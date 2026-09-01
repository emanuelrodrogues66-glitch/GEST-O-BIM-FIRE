import { useEffect, useMemo, useState } from 'react'
import { carregarTabelaCompleta } from '../lib/supabase'
import { corDoResponsavel } from '../lib/agenda'
import type { Jornada, Solicitacao } from '../lib/ponto'
import {
  ROTULO_TIPO,
  TIPOS,
  cancelarSolicitacao,
  carregarJornadas,
  carregarSolicitacoes,
  dataBR,
  decidirSolicitacao,
  hojeLocal,
  jornadaNoDia,
  primeiroDiaSolicitavel,
  siglaDoDia,
  solicitarHorario,
} from '../lib/ponto'

type Membro = { nome: string; ativo: boolean }

const CAMPOS = [
  ['entrada_manha', 'Entrada'],
  ['saida_manha', 'Saída almoço'],
  ['entrada_tarde', 'Volta almoço'],
  ['saida_tarde', 'Saída'],
] as const

/**
 * Horário diferente combinado antes.
 *
 * A regra do escritório é avisar com antecedência, e o sistema cobra isso: o
 * pedido só aceita data a partir de amanhã. Não é burocracia — é o que separa
 * "combinei" de "justifiquei depois", que é justamente a diferença que o
 * espelho não conseguia enxergar.
 */
export default function PontoSolicitacoes({ ehAdm }: { ehAdm: boolean }) {
  const [membros, setMembros] = useState<Membro[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [pedidos, setPedidos] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [colaborador, setColaborador] = useState(
    () => localStorage.getItem('ponto:colaborador') || ''
  )
  const [dia, setDia] = useState(primeiroDiaSolicitavel())
  const [horas, setHoras] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [m, j, p] = await Promise.all([
      carregarTabelaCompleta<Membro>('team_members', 'nome, ativo'),
      carregarJornadas(),
      carregarSolicitacoes({ de: '2026-01-01' }),
    ])
    setMembros(m.filter((x) => x.ativo))
    setJornadas(j)
    setPedidos(p)
    setCarregando(false)
  }

  // Os campos começam com a jornada normal da pessoa naquele dia: mais rápido
  // mexer numa hora do que digitar as quatro.
  const jornadaDoDia = useMemo(
    () => (colaborador ? jornadaNoDia(jornadas, colaborador, dia) : null),
    [jornadas, colaborador, dia]
  )

  useEffect(() => {
    if (!jornadaDoDia) return setHoras({})
    setHoras({
      entrada_manha: jornadaDoDia.entrada_manha?.slice(0, 5) || '',
      saida_manha: jornadaDoDia.saida_manha?.slice(0, 5) || '',
      entrada_tarde: jornadaDoDia.entrada_tarde?.slice(0, 5) || '',
      saida_tarde: jornadaDoDia.saida_tarde?.slice(0, 5) || '',
    })
  }, [jornadaDoDia])

  /** Só vai para o banco o que a pessoa de fato mudou. */
  const alterados = useMemo(() => {
    if (!jornadaDoDia) return {}
    const patch: Record<string, string | null> = {}
    for (const [campo] of CAMPOS) {
      const novo = horas[campo] || ''
      const original = (jornadaDoDia[campo] || '').slice(0, 5)
      patch[campo] = novo && novo !== original ? novo : null
    }
    return patch
  }, [horas, jornadaDoDia])

  const mudouAlgo = Object.values(alterados).some(Boolean)

  async function enviar() {
    setErro('')
    setOk('')
    if (!colaborador) return setErro('Escolha o seu nome.')
    if (!mudouAlgo) return setErro('Nenhum horário foi alterado.')
    if (!motivo.trim()) return setErro('Escreva o motivo.')
    if (pin.length < 4) return setErro('Digite o seu PIN.')

    setEnviando(true)
    try {
      await solicitarHorario({ colaborador, pin, dia, motivo, ...alterados })
      setOk('Pedido enviado. O ADM vai aprovar ou recusar.')
      setMotivo('')
      setPin('')
      await carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  async function decidir(p: Solicitacao, aprovar: boolean) {
    let abona = false
    if (aprovar) {
      abona = confirm(
        `Aprovar o horário de ${p.colaborador} em ${dataBR(p.dia)}.\n\n` +
          `OK = abonar as horas: o dia passa a prever só o horário combinado, e a diferença ` +
          `não vira dívida no banco de horas.\n\n` +
          `Cancelar = aprovar sem abonar: não conta como atraso, mas as horas continuam devidas.`
      )
    }
    const resposta = aprovar
      ? prompt('Quer deixar algum recado? (opcional)') || ''
      : prompt('Motivo da recusa (obrigatório):') || ''
    if (!aprovar && !resposta.trim()) return alert('A recusa precisa de um motivo.')

    try {
      await decidirSolicitacao({ id: p.id, aprovar, resposta, abonaHoras: abona })
      await carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function cancelar(p: Solicitacao) {
    const senha = prompt(`Cancelar o seu pedido de ${dataBR(p.dia)}? Digite o seu PIN:`)
    if (!senha) return
    try {
      await cancelarSolicitacao(p.id, p.colaborador, senha)
      await carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const hoje = hojeLocal()
  const pendentes = pedidos.filter((p) => p.status === 'pendente')
  const decididos = pedidos
    .filter((p) => p.status !== 'pendente')
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .slice(0, 30)

  return (
    <div className="space-y-4 max-w-3xl">
      {/* ---------- pedir ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Pedir horário diferente</h2>
          <p className="text-[11px] text-slate-500">
            Precisa ser com pelo menos um dia de antecedência. Para hoje, fale direto com o ADM.
          </p>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500 uppercase">Quem é você</label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {membros.map((m) => (
              <button
                key={m.nome}
                onClick={() => setColaborador(m.nome)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  colaborador === m.nome
                    ? 'text-white border-transparent'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
                style={
                  colaborador === m.nome ? { backgroundColor: corDoResponsavel(m.nome) } : undefined
                }
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="text-[10px] uppercase text-slate-400">Dia</span>
            <input
              type="date"
              min={primeiroDiaSolicitavel()}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="block mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
            <span className="text-[10px] text-slate-400">{siglaDoDia(dia)}</span>
          </label>

          {CAMPOS.map(([campo, rotulo]) => (
            <label key={campo} className="block">
              <span className="text-[10px] uppercase text-slate-400">{rotulo}</span>
              <input
                type="time"
                value={horas[campo] || ''}
                disabled={!jornadaDoDia}
                onChange={(e) => setHoras({ ...horas, [campo]: e.target.value })}
                className={`block mt-0.5 text-sm border rounded-md px-2 py-1.5 disabled:bg-slate-50 ${
                  alterados[campo] ? 'border-indigo-500 bg-indigo-50/50 font-medium' : 'border-slate-300'
                }`}
              />
              <span className="text-[10px] text-slate-400">
                {jornadaDoDia?.[campo]?.slice(0, 5) || '—'} normal
              </span>
            </label>
          ))}
        </div>

        {colaborador && !jornadaDoDia && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {colaborador} não tem jornada cadastrada para {dataBR(dia)} — pode ser fim de semana,
            feriado, ou o ADM ainda não cadastrou o horário.
          </p>
        )}

        <label className="block">
          <span className="text-[10px] uppercase text-slate-400">Motivo</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: consulta médica de manhã, compenso saindo mais tarde"
            className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1.5"
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="block">
            <span className="text-[10px] uppercase text-slate-400">Seu PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="••••"
              className="block w-24 mt-0.5 text-center tracking-[0.3em] text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
          </label>
          <button
            onClick={enviar}
            disabled={enviando}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium"
          >
            {enviando ? 'Enviando...' : 'Enviar para aprovação'}
          </button>
        </div>

        {erro && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}
        {ok && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {ok}
          </p>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>
      ) : (
        <>
          {/* ---------- aguardando ---------- */}
          <Lista
            titulo={`Aguardando aprovação (${pendentes.length})`}
            vazio="Nenhum pedido em aberto."
            pedidos={pendentes}
            jornadas={jornadas}
            hoje={hoje}
            ehAdm={ehAdm}
            onDecidir={decidir}
            onCancelar={cancelar}
          />

          {/* ---------- histórico ---------- */}
          {decididos.length > 0 && (
            <Lista
              titulo="Já decididos"
              vazio=""
              pedidos={decididos}
              jornadas={jornadas}
              hoje={hoje}
              ehAdm={false}
            />
          )}
        </>
      )}
    </div>
  )
}

function Lista({
  titulo,
  vazio,
  pedidos,
  jornadas,
  hoje,
  ehAdm,
  onDecidir,
  onCancelar,
}: {
  titulo: string
  vazio: string
  pedidos: Solicitacao[]
  jornadas: Jornada[]
  hoje: string
  ehAdm: boolean
  onDecidir?: (p: Solicitacao, aprovar: boolean) => void
  onCancelar?: (p: Solicitacao) => void
}) {
  const cor: Record<string, string> = {
    pendente: 'bg-amber-100 text-amber-800',
    aprovada: 'bg-emerald-100 text-emerald-800',
    recusada: 'bg-red-100 text-red-800',
    cancelada: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-slate-50">
        <h3 className="text-xs font-semibold text-slate-700">{titulo}</h3>
      </div>

      {pedidos.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">{vazio}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {pedidos.map((p) => {
            const j = jornadaNoDia(jornadas, p.colaborador, p.dia)
            const mudancas = TIPOS.filter((t) => p[t]).map(
              (t) =>
                `${ROTULO_TIPO[t]} ${(j?.[t] || '--:--').slice(0, 5)} → ${p[t]!.slice(0, 5)}`
            )
            return (
              <div key={p.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: corDoResponsavel(p.colaborador) }}
                  >
                    {p.colaborador}
                  </span>
                  <span className="text-xs text-slate-700 tabular-nums">
                    {dataBR(p.dia)} <span className="text-slate-400">{siglaDoDia(p.dia)}</span>
                  </span>
                  {p.dia < hoje && p.status === 'pendente' && (
                    <span className="text-[10px] text-red-700 font-medium">o dia já passou</span>
                  )}
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cor[p.status]}`}
                  >
                    {p.status}
                  </span>
                  {p.abona_horas && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">
                      horas abonadas
                    </span>
                  )}

                  {ehAdm && onDecidir && (
                    <span className="ml-auto flex gap-1.5">
                      <button
                        onClick={() => onDecidir(p, true)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => onDecidir(p, false)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Recusar
                      </button>
                    </span>
                  )}
                  {!ehAdm && p.status === 'pendente' && onCancelar && (
                    <button
                      onClick={() => onCancelar(p)}
                      className="ml-auto text-[11px] text-slate-500 hover:underline"
                    >
                      cancelar
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 mt-1 tabular-nums">
                  {mudancas.join(' · ')}
                </p>
                <p className="text-[11px] text-slate-500 italic">"{p.motivo}"</p>
                {p.resposta && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-medium">Resposta:</span> {p.resposta}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
