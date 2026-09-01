import { useEffect, useMemo, useState } from 'react'
import { carregarTabelaCompleta } from '../lib/supabase'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'
import type {
  Batida,
  DiaApurado,
  Feriado,
  Jornada,
  MesApurado,
  SituacaoDia,
  Solicitacao,
  TipoBatida,
} from '../lib/ponto'
import {
  ROTULO_TIPO,
  SITUACOES,
  TIPOS,
  ajustarPonto,
  apurarMes,
  carregarBatidas,
  carregarFechamentos,
  carregarFeriados,
  carregarJornadas,
  carregarSituacoes,
  carregarSolicitacoes,
  diasDoMes,
  hojeLocal,
  horaDoMomento,
  minutosLegiveis,
  siglaDoDia,
} from '../lib/ponto'
import { supabase } from '../lib/supabase'

type Membro = { nome: string; ativo: boolean }

const ROTULO_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.rotulo])) as Record<
  string,
  string
>

/**
 * Espelho do mês — o equivalente a uma aba da planilha, mas somando sozinho.
 *
 * Continua mostrando o vermelho da entrada em atraso, porque é isso que decide
 * o bônus. O que a planilha não tinha e aqui tem: a linha do saldo, que é o que
 * de fato vira banco de horas.
 */
export default function PontoEspelho({
  podeAjustar,
  colaboradorFixo,
}: {
  podeAjustar: boolean
  colaboradorFixo?: string
}) {
  const hoje = hojeLocal()
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)))
  const [membros, setMembros] = useState<Membro[]>([])
  const [colaborador, setColaborador] = useState(colaboradorFixo || '')

  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [batidas, setBatidas] = useState<Batida[]>([])
  const [situacoes, setSituacoes] = useState<SituacaoDia[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes])
  const de = dias[0]
  const ate = dias[dias.length - 1]

  useEffect(() => {
    carregarTabelaCompleta<Membro>('team_members', 'nome, ativo').then((m) => {
      const ativos = m.filter((x) => x.ativo)
      setMembros(ativos)
      if (!colaborador && ativos[0]) setColaborador(colaboradorFixo || ativos[0].nome)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!colaborador) return
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador, ano, mes])

  async function recarregar() {
    setCarregando(true)
    const [j, b, s, f, sol] = await Promise.all([
      carregarJornadas(),
      carregarBatidas(de, ate, colaborador),
      carregarSituacoes(de, ate),
      carregarFeriados(de, ate),
      carregarSolicitacoes({ de, ate, colaborador, status: ['aprovada'] }),
    ])
    setJornadas(j)
    setBatidas(b)
    setSituacoes(s)
    setFeriados(f)
    setSolicitacoes(sol)
    setSaldoAnterior(await saldoAteVespera(colaborador, de))
    setCarregando(false)
  }

  /** Saldo acumulado até o dia anterior ao início do mês exibido. */
  async function saldoAteVespera(quem: string, inicioDoMes: string): Promise<number> {
    const fechamentos = await carregarFechamentos(quem)
    const ultimo = fechamentos.find((f) => f.ate_dia < inicioDoMes)
    const inicio = ultimo ? proximo(ultimo.ate_dia) : '2026-01-01'
    if (inicio >= inicioDoMes) return ultimo?.saldo_zerado ?? 0

    const vespera = anterior(inicioDoMes)
    const [j, b, s, f] = await Promise.all([
      carregarJornadas(),
      carregarBatidas(inicio, vespera, quem),
      carregarSituacoes(inicio, vespera),
      carregarFeriados(inicio, vespera),
    ])
    const lista: string[] = []
    for (const d = new Date(`${inicio}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10)
      if (iso > vespera) break
      lista.push(iso)
    }
    const apurado = apurarMes({
      colaborador: quem,
      dias: lista,
      jornadas: j,
      batidas: b,
      situacoes: s,
      feriados: f,
    })
    return (ultimo?.saldo_zerado ?? 0) + apurado.saldoMes
  }

  const apurado: MesApurado | null = useMemo(() => {
    if (!colaborador) return null
    return apurarMes({ colaborador, dias, jornadas, batidas, situacoes, feriados, solicitacoes })
  }, [colaborador, dias, jornadas, batidas, situacoes, feriados, solicitacoes])

  async function mudarSituacao(dia: string, situacao: string) {
    if (situacao === 'normal') {
      await supabase.from('time_days').delete().eq('colaborador', colaborador).eq('dia', dia)
    } else {
      await supabase
        .from('time_days')
        .upsert(
          { colaborador, dia, situacao, registrado_por: (await supabase.auth.getUser()).data.user?.email },
          { onConflict: 'colaborador,dia' }
        )
    }
    recarregar()
  }

  async function editarBatida(dia: string, tipo: TipoBatida, atual: string) {
    const hora = prompt(
      `${ROTULO_TIPO[tipo]} de ${colaborador} em ${dia.split('-').reverse().join('/')}\n` +
        `Digite a hora (HH:MM). Deixe vazio para apagar a marcação.`,
      atual
    )
    if (hora === null) return
    const limpa = hora.trim()
    if (limpa && !/^\d{1,2}:\d{2}$/.test(limpa)) return alert('Use o formato HH:MM.')

    const motivo = prompt('Motivo do ajuste (fica registrado no histórico):')
    if (!motivo || !motivo.trim()) return alert('O ajuste precisa de um motivo.')

    try {
      await ajustarPonto({ colaborador, dia, tipo, hora: limpa || null, motivo: motivo.trim() })
      recarregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  function exportar() {
    if (!apurado) return
    exportarParaExcel({
      nomeArquivo: `Cartao ponto ${colaborador} ${String(mes).padStart(2, '0')}-${ano} - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Espelho',
      linhas: apurado.dias,
      colunas: [
        { titulo: 'Dia', valor: (d) => d.dia.slice(8), largura: 5 },
        { titulo: 'Semana', valor: (d) => siglaDoDia(d.dia), largura: 8 },
        { titulo: 'Situação', valor: (d) => d.feriado || ROTULO_SITUACAO[d.situacao] || '', largura: 16 },
        ...TIPOS.map((t) => ({
          titulo: ROTULO_TIPO[t],
          valor: (d: DiaApurado) => (d.batidas[t] ? horaDoMomento(d.batidas[t]!.momento) : ''),
          largura: 12,
        })),
        { titulo: 'Previsto', valor: (d) => (d.util ? minutosLegiveis(d.previsto) : ''), largura: 10 },
        { titulo: 'Trabalhado', valor: (d) => (d.util ? minutosLegiveis(d.trabalhado) : ''), largura: 11 },
        { titulo: 'Atraso', valor: (d) => (d.atraso > 0 ? minutosLegiveis(d.atraso) : ''), largura: 9 },
        { titulo: 'Saldo', valor: (d) => (d.util ? minutosLegiveis(d.saldo) : ''), largura: 9 },
      ],
    })
  }

  const bancoAcumulado = saldoAnterior + (apurado?.saldoMes ?? 0)

  return (
    <div className="space-y-4">
      {/* ---------- filtros ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        {!colaboradorFixo && (
          <select
            value={colaborador}
            onChange={(e) => setColaborador(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white font-medium"
          >
            {membros.map((m) => (
              <option key={m.nome} value={m.nome}>
                {m.nome}
              </option>
            ))}
          </select>
        )}

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
          disabled={!apurado}
          className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white"
        >
          ⬇ Excel
        </button>
      </div>

      {carregando || !apurado ? (
        <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
      ) : (
        <>
          {/* ---------- resumo ---------- */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Caixa titulo="Trabalhado no mês" valor={minutosLegiveis(apurado.trabalhado)} />
            <Caixa titulo="Previsto" valor={minutosLegiveis(apurado.previsto)} />
            <Caixa
              titulo="Atraso acumulado"
              valor={minutosLegiveis(apurado.atraso)}
              tom={apurado.atraso >= 30 ? 'ruim' : 'bom'}
            />
            <Caixa
              titulo="Saldo do mês"
              valor={minutosLegiveis(apurado.saldoMes)}
              tom={apurado.saldoMes < 0 ? 'ruim' : 'bom'}
            />
            <Caixa
              titulo="Banco de horas"
              valor={minutosLegiveis(bancoAcumulado)}
              tom={bancoAcumulado < 0 ? 'ruim' : 'bom'}
              rodape={`${minutosLegiveis(saldoAnterior)} vinham de antes`}
            />
          </div>

          {/* ---------- bônus ---------- */}
          <div
            className={`rounded-xl border px-4 py-2.5 text-[11px] ${
              apurado.elegivelBonus
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <strong>{apurado.elegivelBonus ? '✓ Dentro do bônus' : 'Fora do bônus'}</strong> — a
            regra é menos de 5 entradas em atraso e menos de 30 min de atraso no mês.{' '}
            {colaborador} está com <strong>{apurado.vermelhos}</strong> entrada(s) em atraso e{' '}
            <strong>{minutosLegiveis(apurado.atraso)}</strong> de atraso.
          </div>

          {/* ---------- espelho ---------- */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th className="text-left py-2 pl-3 w-20">Dia</th>
                  {TIPOS.map((t) => (
                    <th key={t} className="text-center px-1">
                      {ROTULO_TIPO[t]}
                    </th>
                  ))}
                  <th className="text-right px-2">Trab.</th>
                  <th className="text-right px-2">Atraso</th>
                  <th className="text-right px-2">Saldo</th>
                  <th className="text-left pl-2 pr-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {apurado.dias.map((d) => {
                  const futuro = d.dia > hoje
                  const fimDeSemana = !d.util && !d.feriado && d.situacao === 'normal'
                  return (
                    <tr
                      key={d.dia}
                      className={`border-b border-slate-100 last:border-0 ${
                        futuro ? 'opacity-40' : ''
                      } ${fimDeSemana ? 'bg-slate-50/60' : ''} ${d.feriado ? 'bg-cobre-50/40' : ''}`}
                    >
                      <td className="py-1.5 pl-3 tabular-nums whitespace-nowrap">
                        <span className="font-medium text-slate-700">{d.dia.slice(8)}</span>{' '}
                        <span className="text-slate-400">{siglaDoDia(d.dia)}</span>
                      </td>

                      {TIPOS.map((t) => {
                        const b = d.batidas[t]
                        const hora = b ? horaDoMomento(b.momento) : ''
                        const faltou = d.faltando.includes(t) && !futuro
                        return (
                          <td key={t} className="text-center px-1">
                            <button
                              disabled={!podeAjustar}
                              onClick={() => editarBatida(d.dia, t, hora)}
                              title={
                                b?.origem === 'ajuste'
                                  ? `Ajustado por ${b.registrado_por}: ${b.observacao || ''}`
                                  : b?.ip
                                    ? `Batido do IP ${b.ip}`
                                    : undefined
                              }
                              className={`tabular-nums px-1.5 py-0.5 rounded ${
                                podeAjustar ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'
                              } ${
                                faltou
                                  ? 'text-red-600 font-medium'
                                  : b
                                    ? 'text-slate-700'
                                    : 'text-slate-300'
                              }`}
                            >
                              {hora || (faltou ? '⚠' : '--:--')}
                              {b?.origem === 'ajuste' && (
                                <span className="text-[8px] text-amber-600 align-super">a</span>
                              )}
                            </button>
                          </td>
                        )
                      })}

                      <td className="text-right px-2 tabular-nums text-slate-600">
                        {d.util && d.trabalhado > 0 ? minutosLegiveis(d.trabalhado) : ''}
                      </td>
                      <td
                        className={`text-right px-2 tabular-nums font-medium ${
                          d.atraso > 0 ? 'text-red-700' : 'text-slate-300'
                        }`}
                      >
                        {d.atraso > 0 ? minutosLegiveis(d.atraso) : d.util && !futuro ? '—' : ''}
                      </td>
                      <td
                        className={`text-right px-2 tabular-nums font-medium ${
                          !d.util || futuro
                            ? 'text-slate-300'
                            : d.saldo < 0
                              ? 'text-red-700'
                              : d.saldo > 0
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                        }`}
                      >
                        {d.util && !futuro ? minutosLegiveis(d.saldo) : ''}
                      </td>

                      <td className="pl-2 pr-3">
                        {d.acordo ? (
                          <span
                            className="text-[10px] text-cyan-700"
                            title={`Horário combinado: ${d.acordo.motivo}`}
                          >
                            horário combinado{d.acordo.abona_horas ? ' (abonado)' : ''}
                          </span>
                        ) : d.feriado ? (
                          <span className="text-[10px] text-cobre-700">{d.feriado}</span>
                        ) : podeAjustar && !fimDeSemana ? (
                          <select
                            value={d.situacao}
                            onChange={(e) => mudarSituacao(d.dia, e.target.value)}
                            className="text-[10px] border border-transparent hover:border-slate-300 rounded px-1 py-0.5 bg-transparent"
                          >
                            {SITUACOES.map((s) => (
                              <option key={s.valor} value={s.valor}>
                                {s.rotulo}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {d.situacao !== 'normal' ? ROTULO_SITUACAO[d.situacao] : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-400">
            ⚠ marca a batida que faltou num dia útil. O <span className="text-amber-600">a</span> ao
            lado da hora quer dizer que ela foi ajustada pelo ADM — passe o mouse para ver quem e por
            quê. Um dia com marcação faltando não gera saldo até ser ajustado.
          </p>
        </>
      )}
    </div>
  )
}

function Caixa({
  titulo,
  valor,
  tom,
  rodape,
}: {
  titulo: string
  valor: string
  tom?: 'bom' | 'ruim'
  rodape?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tom === 'ruim' ? 'text-red-700' : tom === 'bom' ? 'text-emerald-700' : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
      {rodape && <p className="text-[9px] text-slate-400">{rodape}</p>}
    </div>
  )
}

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
