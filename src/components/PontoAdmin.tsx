import { useEffect, useMemo, useState } from 'react'
import { supabase, carregarTabelaCompleta } from '../lib/supabase'
import { corDoResponsavel } from '../lib/agenda'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'
import type { Feriado, Jornada, MesApurado } from '../lib/ponto'
import {
  apurarMes,
  carregarBatidas,
  carregarFechamentos,
  carregarFeriados,
  carregarJornadas,
  carregarSituacoes,
  carregarSolicitacoes,
  dataBR,
  definirPin,
  diasDoMes,
  hojeLocal,
  minutosLegiveis,
} from '../lib/ponto'

type Membro = { nome: string; ativo: boolean }

const VAZIA = {
  entrada_manha: '08:00',
  saida_manha: '12:00',
  entrada_tarde: '13:00',
  saida_tarde: '17:00',
  tolerancia_min: 5,
}

/**
 * Painel do ADM.
 *
 * Três coisas que só o ADM faz: cadastrar a jornada de cada um, dar o PIN e
 * fechar o banco de horas quando as horas são pagas ou compensadas. O resto
 * (ajustar batida, marcar atestado) acontece no próprio espelho, onde dá para
 * ver o contexto do dia.
 */
export default function PontoAdmin() {
  const [aba, setAba] = useState<'equipe' | 'jornadas' | 'feriados'>('equipe')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(
          [
            ['equipe', 'Equipe e banco de horas'],
            ['jornadas', 'Jornadas e PIN'],
            ['feriados', 'Feriados'],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition ${
              aba === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'equipe' && <Equipe />}
      {aba === 'jornadas' && <Jornadas />}
      {aba === 'feriados' && <Feriados />}
    </div>
  )
}

// ============================================================ equipe do mês

function Equipe() {
  const hoje = hojeLocal()
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)))
  const [linhas, setLinhas] = useState<{ apurado: MesApurado; banco: number }[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes])

  async function carregar() {
    setCarregando(true)
    const dias = diasDoMes(ano, mes)
    const de = dias[0]
    const ate = dias[dias.length - 1]

    const [membros, jornadas, batidas, situacoes, feriados, fechamentos, solicitacoes] =
      await Promise.all([
        carregarTabelaCompleta<Membro>('team_members', 'nome, ativo'),
        carregarJornadas(),
        carregarBatidas(de, ate),
        carregarSituacoes(de, ate),
        carregarFeriados(de, ate),
        carregarFechamentos(),
        carregarSolicitacoes({ de, ate, status: ['aprovada'] }),
      ])

    // O saldo anterior de cada um: do último fechamento até a véspera do mês.
    const inicioHistorico = '2026-01-01'
    const vespera = anterior(de)
    const [batAntes, sitAntes, ferAntes, solAntes] = await Promise.all([
      carregarBatidas(inicioHistorico, vespera),
      carregarSituacoes(inicioHistorico, vespera),
      carregarFeriados(inicioHistorico, vespera),
      carregarSolicitacoes({ de: inicioHistorico, ate: vespera, status: ['aprovada'] }),
    ])

    const resultado = membros
      .filter((m) => m.ativo)
      .map((m) => {
        const apurado = apurarMes({
          colaborador: m.nome,
          dias,
          jornadas,
          batidas,
          situacoes,
          feriados,
          solicitacoes,
        })

        const fech = fechamentos.filter((f) => f.colaborador === m.nome).find((f) => f.ate_dia < de)
        const inicio = fech ? proximo(fech.ate_dia) : inicioHistorico
        const diasAntes: string[] = []
        for (const d = new Date(`${inicio}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
          const iso = d.toISOString().slice(0, 10)
          if (iso > vespera) break
          diasAntes.push(iso)
        }
        const antes = apurarMes({
          colaborador: m.nome,
          dias: diasAntes,
          jornadas,
          batidas: batAntes,
          situacoes: sitAntes,
          feriados: ferAntes,
          solicitacoes: solAntes,
        })

        return {
          apurado,
          banco: (fech?.saldo_zerado ?? 0) + antes.saldoMes + apurado.saldoMes,
        }
      })

    setLinhas(resultado)
    setCarregando(false)
  }

  async function fechar(colaborador: string, banco: number) {
    const dias = diasDoMes(ano, mes)
    const ate = dias[dias.length - 1]
    const motivo = prompt(
      `Fechar o banco de horas de ${colaborador} em ${dataBR(ate)}.\n` +
        `Saldo hoje: ${minutosLegiveis(banco)}.\n\n` +
        `Isso não apaga nenhuma batida — só faz a contagem recomeçar daqui.\n` +
        `Motivo (ex.: horas pagas na folha de setembro):`
    )
    if (!motivo || !motivo.trim()) return

    const novo = prompt('Saldo com que a contagem recomeça, em minutos (0 para zerar):', '0')
    if (novo === null) return

    const { error } = await supabase.from('time_closures').upsert(
      {
        colaborador,
        ate_dia: ate,
        saldo_zerado: Number(novo) || 0,
        motivo: motivo.trim(),
        quem: (await supabase.auth.getUser()).data.user?.email,
      },
      { onConflict: 'colaborador,ate_dia' }
    )
    if (error) return alert(error.message)
    carregar()
  }

  function exportar() {
    exportarParaExcel({
      nomeArquivo: `Ponto da equipe ${String(mes).padStart(2, '0')}-${ano} - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Resumo',
      linhas,
      colunas: [
        { titulo: 'Colaborador', valor: (l) => l.apurado.colaborador, largura: 16 },
        { titulo: 'Previsto', valor: (l) => minutosLegiveis(l.apurado.previsto), largura: 11 },
        { titulo: 'Trabalhado', valor: (l) => minutosLegiveis(l.apurado.trabalhado), largura: 11 },
        { titulo: 'Atraso', valor: (l) => minutosLegiveis(l.apurado.atraso), largura: 10 },
        { titulo: 'Entradas em atraso', valor: (l) => l.apurado.vermelhos, largura: 18 },
        { titulo: 'Faltas', valor: (l) => l.apurado.faltas, largura: 8 },
        { titulo: 'Dias incompletos', valor: (l) => l.apurado.diasIncompletos, largura: 16 },
        { titulo: 'Saldo do mês', valor: (l) => minutosLegiveis(l.apurado.saldoMes), largura: 13 },
        { titulo: 'Banco de horas', valor: (l) => minutosLegiveis(l.banco), largura: 14 },
        { titulo: 'Bônus', valor: (l) => (l.apurado.elegivelBonus ? 'Sim' : 'Não'), largura: 8 },
      ],
    })
  }

  const noBonus = linhas.filter((l) => l.apurado.elegivelBonus).length
  const bonus = useMemo(() => {
    // A regra do escritório: R$ 150 divididos entre quem cumpriu.
    if (noBonus === 0) return 0
    return Math.round((150 / noBonus) * 100) / 100
  }, [noBonus])

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(
            (m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            )
          )}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          {[2026, 2027, 2028].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          onClick={exportar}
          className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          ⬇ Excel
        </button>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-2 pl-4">Colaborador</th>
                  <th className="text-right px-2">Trabalhado</th>
                  <th className="text-right px-2">Previsto</th>
                  <th className="text-right px-2">Atraso</th>
                  <th className="text-center px-2">Vermelhos</th>
                  <th className="text-center px-2">Faltas</th>
                  <th className="text-center px-2">Incompletos</th>
                  <th className="text-right px-2">Saldo do mês</th>
                  <th className="text-right px-2">Banco</th>
                  <th className="text-center px-2">Bônus</th>
                  <th className="pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ apurado: a, banco }) => (
                  <tr key={a.colaborador} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pl-4">
                      <span
                        className="font-medium"
                        style={{ color: corDoResponsavel(a.colaborador) }}
                      >
                        {a.colaborador}
                      </span>
                    </td>
                    <td className="text-right px-2 tabular-nums text-slate-700">
                      {minutosLegiveis(a.trabalhado)}
                    </td>
                    <td className="text-right px-2 tabular-nums text-slate-400">
                      {minutosLegiveis(a.previsto)}
                    </td>
                    <td
                      className={`text-right px-2 tabular-nums font-medium ${
                        a.atraso >= 30 ? 'text-red-700' : 'text-slate-600'
                      }`}
                    >
                      {minutosLegiveis(a.atraso)}
                    </td>
                    <td
                      className={`text-center px-2 tabular-nums font-medium ${
                        a.vermelhos >= 5 ? 'text-red-700' : 'text-slate-600'
                      }`}
                    >
                      {a.vermelhos}
                    </td>
                    <td className="text-center px-2 tabular-nums text-slate-600">{a.faltas}</td>
                    <td
                      className={`text-center px-2 tabular-nums ${
                        a.diasIncompletos > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {a.diasIncompletos}
                    </td>
                    <td
                      className={`text-right px-2 tabular-nums font-medium ${
                        a.saldoMes < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {minutosLegiveis(a.saldoMes)}
                    </td>
                    <td
                      className={`text-right px-2 tabular-nums font-semibold ${
                        banco < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {minutosLegiveis(banco)}
                    </td>
                    <td className="text-center px-2">
                      {a.elegivelBonus ? (
                        <span className="text-[10px] font-semibold text-emerald-700">✓</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="pr-4 text-right">
                      <button
                        onClick={() => fechar(a.colaborador, banco)}
                        className="text-[10px] font-medium px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                        title="Recomeçar a contagem do banco de horas a partir deste mês"
                      >
                        Fechar banco
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 text-[11px] text-slate-600">
            <strong className="text-slate-800">Bônus do mês.</strong> {noBonus} de {linhas.length}{' '}
            cumpriram a regra (menos de 5 entradas em atraso e menos de 30 min de atraso).
            {noBonus > 0 ? (
              <>
                {' '}
                Dividindo os R$ 150, dá{' '}
                <strong className="text-emerald-700">
                  R$ {bonus.toFixed(2).replace('.', ',')}
                </strong>{' '}
                para cada.
              </>
            ) : (
              ' Ninguém cumpriu — o bônus não é distribuído.'
            )}
          </div>

          <p className="text-[10px] text-slate-400">
            "Incompletos" são dias em que a pessoa bateu algumas marcações e esqueceu outras. Esses
            dias não entram no saldo até você ajustar a hora no espelho — deixá-los contar como zero
            seria inventar hora que ninguém sabe se foi trabalhada.
          </p>
        </>
      )}
    </div>
  )
}

// ============================================================ jornadas e PIN

function Jornadas() {
  const [membros, setMembros] = useState<Membro[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<any>(VAZIA)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    const [m, j] = await Promise.all([
      carregarTabelaCompleta<Membro>('team_members', 'nome, ativo'),
      carregarJornadas(),
    ])
    setMembros(m.filter((x) => x.ativo))
    setJornadas(j)
  }

  function abrir(nome: string) {
    const atual = jornadas.find((j) => j.colaborador === nome && !j.vigencia_fim)
    setEditando(nome)
    setForm(
      atual
        ? {
            entrada_manha: atual.entrada_manha?.slice(0, 5) || '',
            saida_manha: atual.saida_manha?.slice(0, 5) || '',
            entrada_tarde: atual.entrada_tarde?.slice(0, 5) || '',
            saida_tarde: atual.saida_tarde?.slice(0, 5) || '',
            tolerancia_min: atual.tolerancia_min,
          }
        : VAZIA
    )
  }

  async function salvar() {
    if (!editando) return
    setSalvando(true)
    try {
      const hoje = hojeLocal()
      // A jornada antiga não é apagada: ela é encerrada ontem. Assim o mês
      // passado continua sendo calculado com o horário que valia lá.
      const atual = jornadas.find((j) => j.colaborador === editando && !j.vigencia_fim)
      if (atual) {
        if (atual.vigencia_inicio >= hoje) {
          await supabase.from('time_schedules').delete().eq('id', atual.id)
        } else {
          await supabase
            .from('time_schedules')
            .update({ vigencia_fim: anterior(hoje) })
            .eq('id', atual.id)
        }
      }
      const { error } = await supabase.from('time_schedules').insert({
        colaborador: editando,
        vigencia_inicio: hoje,
        entrada_manha: form.entrada_manha || null,
        saida_manha: form.saida_manha || null,
        entrada_tarde: form.entrada_tarde || null,
        saida_tarde: form.saida_tarde || null,
        tolerancia_min: Number(form.tolerancia_min) || 0,
      })
      if (error) throw new Error(error.message)
      setEditando(null)
      await carregar()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function trocarPin(nome: string) {
    const pin = prompt(
      `PIN de ${nome} (4 a 8 dígitos).\n\n` +
        `Ele vai precisar digitar isto toda vez que bater o ponto. Combine o número com a pessoa — ` +
        `você não consegue consultar depois, só definir de novo.`
    )
    if (!pin) return
    try {
      await definirPin(nome, pin.trim())
      alert(`PIN de ${nome} atualizado.`)
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
              <th className="text-left py-2 pl-4">Colaborador</th>
              <th className="text-left">Manhã</th>
              <th className="text-left">Tarde</th>
              <th className="text-center">Tolerância</th>
              <th className="text-left">Desde</th>
              <th className="pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => {
              const j = jornadas.find((x) => x.colaborador === m.nome && !x.vigencia_fim)
              return (
                <tr key={m.nome} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pl-4">
                    <span className="font-medium" style={{ color: corDoResponsavel(m.nome) }}>
                      {m.nome}
                    </span>
                  </td>
                  <td className="tabular-nums text-slate-600">
                    {j ? `${j.entrada_manha?.slice(0, 5)} – ${j.saida_manha?.slice(0, 5)}` : '—'}
                  </td>
                  <td className="tabular-nums text-slate-600">
                    {j ? `${j.entrada_tarde?.slice(0, 5)} – ${j.saida_tarde?.slice(0, 5)}` : '—'}
                  </td>
                  <td className="text-center tabular-nums text-slate-500">
                    {j ? `${j.tolerancia_min} min` : '—'}
                  </td>
                  <td className="text-slate-400 tabular-nums">
                    {j ? dataBR(j.vigencia_inicio) : ''}
                  </td>
                  <td className="pr-4 text-right space-x-1 py-1.5">
                    <button
                      onClick={() => abrir(m.nome)}
                      className="text-[10px] font-medium px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      {j ? 'Alterar jornada' : 'Cadastrar jornada'}
                    </button>
                    <button
                      onClick={() => trocarPin(m.nome)}
                      className="text-[10px] font-medium px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Definir PIN
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Mudar a jornada não reescreve o passado: o horário antigo é encerrado ontem e o novo passa a
        valer de hoje, então o mês fechado continua batendo. O PIN é guardado criptografado — nem o
        ADM consegue lê-lo depois, só trocar.
      </p>

      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Jornada de {editando}</h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['entrada_manha', 'Entrada'],
                  ['saida_manha', 'Saída almoço'],
                  ['entrada_tarde', 'Volta almoço'],
                  ['saida_tarde', 'Saída'],
                ] as const
              ).map(([campo, rotulo]) => (
                <label key={campo} className="block">
                  <span className="text-[10px] uppercase text-slate-400">{rotulo}</span>
                  <input
                    type="time"
                    value={form[campo] || ''}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                    className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-[10px] uppercase text-slate-400">
                Tolerância de atraso (minutos)
              </span>
              <input
                type="number"
                min={0}
                max={30}
                value={form.tolerancia_min}
                onChange={(e) => setForm({ ...form, tolerancia_min: e.target.value })}
                className="w-full mt-0.5 text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditando(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ================================================================= feriados

function Feriados() {
  const [lista, setLista] = useState<Feriado[]>([])
  const [dia, setDia] = useState('')
  const [nome, setNome] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLista(await carregarFeriados('2026-01-01', '2030-12-31'))
  }

  async function adicionar() {
    if (!dia || !nome.trim()) return
    const { error } = await supabase.from('time_holidays').upsert({ dia, nome: nome.trim() })
    if (error) return alert(error.message)
    setDia('')
    setNome('')
    carregar()
  }

  async function remover(d: string) {
    if (!confirm('Remover este feriado?')) return
    await supabase.from('time_holidays').delete().eq('dia', d)
    carregar()
  }

  return (
    <div className="space-y-3 max-w-lg">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[130px]">
          <span className="text-[10px] uppercase text-slate-400">Data</span>
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="w-full mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5"
          />
        </label>
        <label className="flex-[2] min-w-[160px]">
          <span className="text-[10px] uppercase text-slate-400">Feriado</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Aniversário de Londrina"
            className="w-full mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5"
          />
        </label>
        <button
          onClick={adicionar}
          className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Adicionar
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
        {lista.map((f) => (
          <div key={f.dia} className="px-4 py-2 flex items-center gap-3 text-xs">
            <span className="tabular-nums text-slate-500 w-20">{dataBR(f.dia)}</span>
            <span className="flex-1 text-slate-700">{f.nome}</span>
            <button
              onClick={() => remover(f.dia)}
              className="text-[10px] text-red-600 hover:underline"
            >
              remover
            </button>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-400">Nenhum feriado cadastrado.</p>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Já deixei os feriados nacionais de 2026. Faltam os municipais e estaduais — em Londrina, o
        aniversário da cidade costuma entrar aqui.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ datas

function proximo(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function anterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
