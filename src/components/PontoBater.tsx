import { useEffect, useMemo, useState } from 'react'
import { carregarTabelaCompleta } from '../lib/supabase'
import { corDoResponsavel } from '../lib/agenda'
import type { Batida, DiaApurado, Jornada, TipoBatida } from '../lib/ponto'
import {
  ROTULO_TIPO,
  TIPOS,
  apurarDia,
  baterPonto,
  carregarBatidas,
  carregarFeriados,
  carregarJornadas,
  carregarSituacoes,
  dataBR,
  hojeLocal,
  horaDoMomento,
  jornadaNoDia,
  minutosLegiveis,
} from '../lib/ponto'

type Membro = { nome: string; ativo: boolean }

/**
 * O relógio de ponto.
 *
 * Um botão só. O sistema descobre sozinho se a batida é entrada, almoço, volta
 * ou saída — pedir para a pessoa escolher, às 8h da manhã, é convite para
 * marcar na linha errada, e foi assim que a planilha acumulou furo.
 *
 * O PIN existe porque hoje o escritório inteiro divide um login: sem ele, não
 * haveria como saber quem apertou o botão.
 */
export default function PontoBater() {
  const [membros, setMembros] = useState<Membro[]>([])
  const [colaborador, setColaborador] = useState('')
  const [pin, setPin] = useState('')
  const [agora, setAgora] = useState(new Date())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ tipo: TipoBatida; hora: string } | null>(null)

  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [batidasHoje, setBatidasHoje] = useState<Batida[]>([])
  const [resumo, setResumo] = useState<DiaApurado | null>(null)

  const hoje = hojeLocal()

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    ;(async () => {
      const [m, j] = await Promise.all([
        carregarTabelaCompleta<Membro>('team_members', 'nome, ativo'),
        carregarJornadas(),
      ])
      setMembros(m.filter((x) => x.ativo))
      setJornadas(j)
      // Lembra de quem bateu por último neste computador: no dia a dia é
      // sempre a mesma pessoa no mesmo aparelho.
      const guardado = localStorage.getItem('ponto:colaborador')
      if (guardado) setColaborador(guardado)
    })()
  }, [])

  useEffect(() => {
    if (!colaborador) return
    localStorage.setItem('ponto:colaborador', colaborador)
    recarregarDia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador, jornadas])

  async function recarregarDia() {
    const [bat, sit, fer] = await Promise.all([
      carregarBatidas(hoje, hoje, colaborador),
      carregarSituacoes(hoje, hoje),
      carregarFeriados(hoje, hoje),
    ])
    setBatidasHoje(bat)
    setResumo(
      apurarDia({
        dia: hoje,
        colaborador,
        jornada: jornadaNoDia(jornadas, colaborador, hoje),
        batidas: bat,
        situacao: sit.find((s) => s.colaborador === colaborador)?.situacao || 'normal',
        feriado: fer[0]?.nome || null,
      })
    )
  }

  const proxima = useMemo(() => {
    const feitas = new Set(batidasHoje.map((b) => b.tipo))
    return TIPOS.find((t) => !feitas.has(t)) || null
  }, [batidasHoje])

  async function bater() {
    setErro('')
    setSucesso(null)
    if (!colaborador) return setErro('Escolha o seu nome.')
    if (pin.length < 4) return setErro('Digite o seu PIN.')

    setSalvando(true)
    try {
      const r = await baterPonto({ colaborador, pin })
      setSucesso({ tipo: r.tipo, hora: horaDoMomento(r.momento) })
      setPin('')
      await recarregarDia()
    } catch (e: any) {
      setErro(e.message || 'Não foi possível registrar.')
    } finally {
      setSalvando(false)
    }
  }

  const relogio = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(agora)

  const jornadaHoje = colaborador ? jornadaNoDia(jornadas, colaborador, hoje) : null

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ---------- relógio ---------- */}
      <div className="bg-carvao-900 text-white rounded-2xl p-6 text-center shadow-lg">
        <p className="text-[11px] uppercase tracking-widest text-white/50">
          {dataBR(hoje)} · Londrina
        </p>
        <p className="text-5xl font-semibold tabular-nums mt-1">{relogio}</p>
        <p className="text-[10px] text-white/40 mt-2">
          Vale a hora do servidor, não a do seu aparelho.
        </p>
      </div>

      {/* ---------- quem está batendo ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
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

        <div>
          <label className="text-[11px] font-medium text-slate-500 uppercase">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={(e) => e.key === 'Enter' && bater()}
            placeholder="••••"
            className="w-full mt-1 text-center text-2xl tracking-[0.5em] tabular-nums border border-slate-300 rounded-lg py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
          />
        </div>

        <button
          onClick={bater}
          disabled={salvando || !proxima}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold text-sm shadow-sm transition"
        >
          {salvando
            ? 'Registrando...'
            : proxima
              ? `Bater ponto · ${ROTULO_TIPO[proxima]}`
              : 'Ponto do dia completo'}
        </button>

        {erro && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}
        {sucesso && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            ✓ {ROTULO_TIPO[sucesso.tipo]} registrada às <strong>{sucesso.hora}</strong>.
          </p>
        )}

        {colaborador && !jornadaHoje && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {colaborador} ainda não tem jornada cadastrada. A batida é registrada, mas o atraso e o
            banco de horas só começam a ser calculados depois que o ADM cadastrar o horário.
          </p>
        )}
      </div>

      {/* ---------- o dia de hoje ---------- */}
      {colaborador && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700">Hoje</h3>
            {jornadaHoje && (
              <span className="text-[10px] text-slate-500 tabular-nums">
                {jornadaHoje.entrada_manha?.slice(0, 5)}–{jornadaHoje.saida_manha?.slice(0, 5)} ·{' '}
                {jornadaHoje.entrada_tarde?.slice(0, 5)}–{jornadaHoje.saida_tarde?.slice(0, 5)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 divide-x divide-slate-100">
            {TIPOS.map((t) => {
              const b = batidasHoje.find((x) => x.tipo === t)
              return (
                <div key={t} className="px-2 py-3 text-center">
                  <p className="text-[9px] uppercase text-slate-400 leading-tight">
                    {ROTULO_TIPO[t]}
                  </p>
                  <p
                    className={`text-lg font-semibold tabular-nums mt-1 ${
                      b ? 'text-slate-800' : 'text-slate-300'
                    }`}
                  >
                    {b ? horaDoMomento(b.momento) : '--:--'}
                  </p>
                </div>
              )
            })}
          </div>

          {resumo && resumo.util && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-slate-500">
                Trabalhado: <strong className="text-slate-800">{minutosLegiveis(resumo.trabalhado)}</strong>
              </span>
              <span className="text-slate-500">
                Previsto: <strong className="text-slate-800">{minutosLegiveis(resumo.previsto)}</strong>
              </span>
              {resumo.atraso > 0 && (
                <span className="text-red-700 font-medium">
                  Atraso: {minutosLegiveis(resumo.atraso)}
                </span>
              )}
              {resumo.atraso === 0 && Object.keys(resumo.batidas).length > 0 && (
                <span className="text-emerald-700 font-medium">Sem atraso</span>
              )}
            </div>
          )}

          {resumo?.feriado && (
            <p className="px-4 py-2 border-t border-slate-100 text-[11px] text-cobre-700">
              Feriado: {resumo.feriado}
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        Esqueceu de bater? Fale com o ADM. Todo ajuste fica registrado com o motivo e o autor.
      </p>
    </div>
  )
}
