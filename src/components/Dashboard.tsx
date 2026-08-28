import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useMemo, useState } from 'react'
import { supabase, carregarTabelaCompleta } from '../lib/supabase'
import type { Project, ProjectPlan } from '../types'
import { STATUS_COLUNAS, normalizeStatus, statusColor } from '../types'
import {
  RANKING_COLORS,
  STATUS_CHART_COLORS,
  METAS_PONTOS,
  statusDistribution,
} from '../lib/stats'
import type { MonthRef } from '../lib/month'
import { addMonths, dateInMonth, monthKey, monthLabel } from '../lib/month'
import { corDoResponsavel } from '../lib/agenda'
import type { LancamentoDeHora, SemPontuacao } from '../lib/rateioPontos'
import { calcularRateio, carregarQuemNaoPontua } from '../lib/rateioPontos'

const MEDALS = ['🥇', '🥈', '🥉']

/** Quantos meses à frente a projeção olha. */
const MESES_PROJECAO = 6

/** Um projeto dentro de uma barra da projeção. */
type ItemProjecao = {
  nome: string
  responsavel: string | null
  pts: number
  data: string
  status?: string
  vencido?: boolean
  aproximado?: boolean
}

function dataCurta(d: string): string {
  const [, m, dia] = d.split('-')
  return `${dia}/${m}`
}

/** Bloco de uma categoria dentro da prévia. */
function GrupoPrevia({
  titulo,
  cor,
  itens,
  nota,
}: {
  titulo: string
  cor: string
  itens: ItemProjecao[]
  nota?: string
}) {
  if (itens.length === 0) return null
  const LIMITE = 6
  const total = itens.reduce((s, i) => s + i.pts, 0)
  const mostrados = itens.slice(0, LIMITE)

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: cor }} />
        <span className="text-[11px] font-semibold text-slate-700">{titulo}</span>
        <span className="text-[10px] text-slate-400">
          {itens.length} projeto{itens.length !== 1 ? 's' : ''} · {total.toLocaleString('pt-BR')} pts
        </span>
      </div>
      <ul className="space-y-0.5 pl-4">
        {mostrados.map((i, k) => (
          <li key={k} className="text-[10.5px] text-slate-600 flex items-baseline gap-1.5">
            <span className="truncate max-w-[190px]">{i.nome}</span>
            <span className="text-slate-400 shrink-0">{i.pts} pts</span>
            <span className="text-slate-300 shrink-0">{dataCurta(i.data)}</span>
            {i.vencido && <span className="text-red-600 font-medium shrink-0">vencido</span>}
          </li>
        ))}
        {itens.length > LIMITE && (
          <li className="text-[10.5px] text-slate-400">+{itens.length - LIMITE} projeto(s)</li>
        )}
      </ul>
      {nota && <p className="text-[10px] text-slate-400 pl-4 mt-0.5 italic">{nota}</p>}
    </div>
  )
}

/** Prévia detalhada ao passar o mouse sobre um mês do gráfico. */
function PreviaProjecao({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const linha = payload[0].payload
  const d = linha.detalhes as {
    realizado: ItemProjecao[]
    previsto: ItemProjecao[]
    estimado: ItemProjecao[]
  }
  if (!d) return null

  const vazio = d.realizado.length + d.previsto.length + d.estimado.length === 0

  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-xl p-3 max-w-[330px] space-y-2.5">
      <p className="text-xs font-bold text-slate-800">{linha.mesExtenso}</p>

      {vazio ? (
        <p className="text-[11px] text-slate-400">Nenhum projeto neste mês.</p>
      ) : (
        <>
          <GrupoPrevia
            titulo="Concluídos"
            cor="#22c55e"
            itens={d.realizado}
            nota={
              d.realizado.some((i) => i.aproximado)
                ? 'Alguns sem data de aprovação — usando o prazo.'
                : undefined
            }
          />
          <GrupoPrevia titulo="Previstos (planejado)" cor="#6366f1" itens={d.previsto} />
          <GrupoPrevia
            titulo="Estimados (sem plano)"
            cor="#c7d2fe"
            itens={d.estimado}
            nota="Posição baseada no prazo do projeto, não no planejamento."
          />
        </>
      )}
    </div>
  )
}

export default function Dashboard({
  projects: todosProjetos,
  month,
}: {
  projects: Project[]
  month: MonthRef
}) {
  // Filtros locais: valem só nesta tela, sem mexer nos filtros do topo do app.
  const [statusSel, setStatusSel] = useState<string[]>([...STATUS_COLUNAS])
  const [mesSel, setMesSel] = useState<MonthRef | null>(month)
  const [planos, setPlanos] = useState<Record<string, ProjectPlan>>({})
  // Data em que cada projeto foi aprovado — é ela que posiciona o "realizado".
  const [aprovacoes, setAprovacoes] = useState<Record<string, string>>({})
  // Horas por projeto: é o que reparte os pontos entre quem trabalhou nele.
  const [horasPorProjeto, setHorasPorProjeto] = useState<Map<string, LancamentoDeHora[]>>(new Map())
  const [rateioManual, setRateioManual] = useState<
    Map<string, { colaborador: string; fracao: number }[]>
  >(new Map())
  // Quem gerencia não disputa ranking: as horas dele saem da divisão.
  const [semPontuacao, setSemPontuacao] = useState<SemPontuacao>(new Set())

  useEffect(() => {
    setMesSel(month)
  }, [month])

  useEffect(() => {
    carregarPlanos()
  }, [])

  async function carregarPlanos() {
    const [{ data: planosData }, { data: clientes }, atividades, { data: ajustes }] =
      await Promise.all([
        supabase.from('project_plans').select('*'),
        supabase.from('project_clients').select('project_id, data_aprovacao'),
        carregarTabelaCompleta<{
          project_id: string
          responsavel: string
          horas: number | null
          horas_estimadas: boolean
        }>('project_activities', 'project_id, responsavel, horas, horas_estimadas'),
        supabase.from('project_point_shares').select('project_id, colaborador, fracao'),
      ])

    setSemPontuacao(await carregarQuemNaoPontua())

    const mapa: Record<string, ProjectPlan> = {}
    ;(planosData as ProjectPlan[] | null)?.forEach((p) => {
      mapa[p.project_id] = p
    })
    setPlanos(mapa)

    const aprov: Record<string, string> = {}
    ;(clientes as { project_id: string; data_aprovacao: string | null }[] | null)?.forEach((c) => {
      if (c.data_aprovacao) aprov[c.project_id] = c.data_aprovacao
    })
    setAprovacoes(aprov)

    const horas = new Map<string, LancamentoDeHora[]>()
    for (const a of atividades) {
      if (!horas.has(a.project_id)) horas.set(a.project_id, [])
      horas.get(a.project_id)!.push({
        responsavel: a.responsavel,
        horas: a.horas,
        horas_estimadas: a.horas_estimadas,
      })
    }
    setHorasPorProjeto(horas)

    const manual = new Map<string, { colaborador: string; fracao: number }[]>()
    ;((ajustes as { project_id: string; colaborador: string; fracao: number }[]) || []).forEach(
      (r) => {
        if (!manual.has(r.project_id)) manual.set(r.project_id, [])
        manual.get(r.project_id)!.push({ colaborador: r.colaborador, fracao: Number(r.fracao) })
      }
    )
    setRateioManual(manual)
  }

  function toggleStatus(s: string) {
    setStatusSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const projects = useMemo(() => {
    return todosProjetos.filter((p) => {
      if (statusSel.length > 0 && !statusSel.includes(normalizeStatus(p.status))) return false
      if (mesSel && !dateInMonth(p.data_inicio, mesSel)) return false
      return true
    })
  }, [todosProjetos, statusSel, mesSel])

  /**
   * Projeção: distribui os pontos pelos meses.
   * - Realizado: projetos já concluídos, no mês do prazo (quando o projeto de fato fechou).
   * - Previsto: projetos em aberto, no mês do fim previsto do planejamento
   *   (caindo para o prazo do projeto quando não há planejamento).
   */
  const { projecao, diagnostico } = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    const mesAtualChave = hoje.slice(0, 7)

    const meses: MonthRef[] = []
    for (let i = -2; i <= MESES_PROJECAO; i++) meses.push(addMonths(month, i))

    const linhas = meses.map((m) => ({
      mes: m,
      name: `${monthLabel(m).slice(0, 3)}/${String(m.year).slice(2)}`,
      mesExtenso: monthLabel(m),
      realizado: 0,
      // Separadas de propósito: uma vem do planejamento, a outra é só estimativa.
      previsto: 0,
      estimado: 0,
      // Guarda quais projetos compõem cada barra, para a prévia ao passar o mouse.
      detalhes: {
        realizado: [] as ItemProjecao[],
        previsto: [] as ItemProjecao[],
        estimado: [] as ItemProjecao[],
      },
    }))

    const indicePorChave = new Map(linhas.map((l, i) => [monthKey(l.mes), i]))

    // O que não entra no gráfico precisa aparecer em algum lugar,
    // senão a projeção parece menor do que a realidade.
    const diag = {
      semData: { projetos: 0, pontos: 0 },
      foraDaJanela: { projetos: 0, pontos: 0 },
      vencidos: { projetos: 0, pontos: 0 },
      comPlano: { projetos: 0, pontos: 0 },
      semPlano: { projetos: 0, pontos: 0 },
    }

    for (const p of todosProjetos) {
      // Respeita o filtro de status, mas não o de mês: a projeção é sobre o tempo.
      if (statusSel.length > 0 && !statusSel.includes(normalizeStatus(p.status))) continue

      const pts = p.pts || 0
      if (!pts) continue

      const concluido = normalizeStatus(p.status) === 'Concluído'

      if (concluido) {
        // Realizado entra no mês em que o projeto foi de fato aprovado.
        // O prazo só serve de aproximação quando a aprovação não foi registrada.
        const dataRef = aprovacoes[p.id] || p.data_prazo || p.data_inicio
        if (!dataRef) continue
        const idx = indicePorChave.get(dataRef.slice(0, 7))
        if (idx !== undefined) {
          linhas[idx].realizado += pts
          linhas[idx].detalhes.realizado.push({
            nome: p.numero ? `${p.numero} · ${p.nome}` : p.nome,
            responsavel: p.responsavel,
            pts,
            data: dataRef,
            aproximado: !aprovacoes[p.id],
          })
        }
        continue
      }

      // --- Projetos em aberto ---
      const fimPrevisto = planos[p.id]?.data_fim_prevista || null
      const temPlano = !!fimPrevisto
      const dataRef = fimPrevisto || p.data_prazo || null

      if (temPlano) {
        diag.comPlano.projetos += 1
        diag.comPlano.pontos += pts
      } else {
        diag.semPlano.projetos += 1
        diag.semPlano.pontos += pts
      }

      if (!dataRef) {
        diag.semData.projetos += 1
        diag.semData.pontos += pts
        continue
      }

      // Previsão que já passou e o projeto não foi concluído: a entrega não
      // aconteceu naquele mês. Realoca para o mês corrente para não mostrar
      // "previsto" no passado, que seria falso.
      const vencido = dataRef < hoje
      if (vencido) {
        diag.vencidos.projetos += 1
        diag.vencidos.pontos += pts
      }
      const chave = vencido ? mesAtualChave : dataRef.slice(0, 7)

      const idx = indicePorChave.get(chave)
      if (idx === undefined) {
        diag.foraDaJanela.projetos += 1
        diag.foraDaJanela.pontos += pts
        continue
      }

      const item: ItemProjecao = {
        nome: p.numero ? `${p.numero} · ${p.nome}` : p.nome,
        responsavel: p.responsavel,
        pts,
        data: dataRef,
        status: normalizeStatus(p.status),
        vencido,
      }

      if (temPlano) {
        linhas[idx].previsto += pts
        linhas[idx].detalhes.previsto.push(item)
      } else {
        linhas[idx].estimado += pts
        linhas[idx].detalhes.estimado.push(item)
      }
    }

    return { projecao: linhas, diagnostico: diag }
  }, [todosProjetos, planos, aprovacoes, statusSel, month])

  /**
   * Ranking de pontos: mesma base da Meta Pontos — projetos aprovados
   * (Concluído) com aprovação no mês selecionado.
   *
   * Antes contava por mês de início e incluía projeto em andamento, o que
   * inflava o número: ponto só existe quando o projeto é aprovado.
   */
  const { ranking, projetosPorResponsavel } = useMemo(() => {
    const mapa = new Map<
      string,
      { responsavel: string; pontos: number; m2: number; projetos: number }
    >()
    const detalhe = new Map<
      string,
      { nome: string; numero: number | null; pts: number; aprovacao: string }[]
    >()

    for (const p of todosProjetos) {
      if (normalizeStatus(p.status) !== 'Concluído') continue
      const aprovacao = aprovacoes[p.id] || p.data_prazo
      if (!aprovacao) continue
      if (mesSel && !dateInMonth(aprovacao, mesSel)) continue

      // Os pontos do projeto são repartidos entre quem trabalhou nele. Antes
      // da data de corte, e nos projetos sem hora lançada, a divisão devolve
      // tudo para o responsável cadastrado — o número não muda.
      const { fatias } = calcularRateio({
        pontos: p.pts || 0,
        responsavelCadastrado: p.responsavel,
        aprovacao,
        lancamentos: horasPorProjeto.get(p.id) || [],
        manual: rateioManual.get(p.id),
        semPontuacao,
      })

      for (const f of fatias) {
        const nome = (f.colaborador || 'Sem responsável').trim()
        if (!mapa.has(nome)) {
          mapa.set(nome, { responsavel: nome, pontos: 0, m2: 0, projetos: 0 })
          detalhe.set(nome, [])
        }
        const linha = mapa.get(nome)!
        linha.pontos += f.pontos
        // Área e contagem seguem a mesma proporção, senão dois projetistas
        // no mesmo projeto contariam dois projetos inteiros.
        linha.m2 += (p.m2 || 0) * f.fracao
        linha.projetos += f.fracao

        detalhe.get(nome)!.push({
          nome: p.nome,
          numero: p.numero,
          pts: f.pontos,
          aprovacao,
        })
      }
    }

    for (const lista of detalhe.values()) {
      lista.sort((a, b) => a.aprovacao.localeCompare(b.aprovacao))
    }

    return {
      ranking: Array.from(mapa.values())
        .map((r) => ({
          ...r,
          pontos: Math.round(r.pontos * 100) / 100,
          projetos: Math.round(r.projetos * 100) / 100,
        }))
        .sort((a, b) => b.pontos - a.pontos),
      projetosPorResponsavel: detalhe,
    }
  }, [todosProjetos, aprovacoes, mesSel, horasPorProjeto, rateioManual, semPontuacao])
  const statusRows = statusDistribution(projects)

  const totalPontos = projects.reduce((s, p) => s + (p.pts || 0), 0)
  const totalM2 = projects.reduce((s, p) => s + (p.m2 || 0), 0)
  const atrasados = projects.filter((p) => p.prazo_categoria === 'ATRASADO').length
  const lider = ranking[0]

  const pieData = statusRows.map((r) => ({ name: r.status, value: r.count }))
  const rankingChartData = ranking.slice(0, 10).map((r) => ({ name: r.responsavel, pontos: r.pontos }))

  /**
   * Meta de pontos: o que vale é o mês da APROVAÇÃO, não o mês em que o
   * projeto começou. Um projeto iniciado em junho e aprovado em agosto
   * conta para agosto.
   *
   * Sem data de aprovação preenchida, cai no prazo do projeto — melhor do
   * que sumir da conta, mas o painel avisa quantos estão nessa situação.
   */
  const { pontosAtuais, semDataAprovacao } = useMemo(() => {
    let pontos = 0
    let semData = 0

    for (const p of todosProjetos) {
      if (normalizeStatus(p.status) !== 'Concluído') continue

      const aprovacao = aprovacoes[p.id]
      const dataRef = aprovacao || p.data_prazo
      if (!dataRef) continue

      if (mesSel && !dateInMonth(dataRef, mesSel)) continue

      pontos += p.pts || 0
      if (!aprovacao) semData += 1
    }

    return { pontosAtuais: pontos, semDataAprovacao: semData }
  }, [todosProjetos, aprovacoes, mesSel])
  const metaChartData = METAS_PONTOS.map((m) => ({
    name: `${m.label} · ${m.sub}`,
    atual: pontosAtuais,
    meta: m.meta,
  }))
  const proximaMeta = METAS_PONTOS.find((m) => m.meta > pontosAtuais)

  const todosStatus = statusSel.length === STATUS_COLUNAS.length
  const temFiltro = !todosStatus || !mesSel || monthKey(mesSel) !== monthKey(month)

  return (
    <div className="space-y-4">
      {/* Filtros exclusivos do Dashboard */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-slate-500">Filtrar só neste painel:</span>

          <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-0.5">
            <button
              onClick={() => setMesSel((m) => (m ? addMonths(m, -1) : month))}
              className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded"
              disabled={!mesSel}
            >
              ‹
            </button>
            <span className="text-[11px] font-medium text-slate-700 px-1 min-w-[95px] text-center">
              {mesSel ? monthLabel(mesSel) : 'Todos os meses'}
            </span>
            <button
              onClick={() => setMesSel((m) => (m ? addMonths(m, 1) : month))}
              className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded"
              disabled={!mesSel}
            >
              ›
            </button>
          </div>

          <button
            onClick={() => setMesSel((m) => (m ? null : month))}
            className={`text-[11px] font-medium px-2 py-1 rounded-full border transition ${
              mesSel
                ? 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                : 'bg-indigo-100 text-indigo-700 border-indigo-300'
            }`}
          >
            Todos os meses
          </button>

          {temFiltro && (
            <button
              onClick={() => {
                setStatusSel([...STATUS_COLUNAS])
                setMesSel(month)
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-auto"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-slate-500 mr-1">Status:</span>
          {STATUS_COLUNAS.map((s) => {
            const ativo = statusSel.includes(s)
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[11px] font-medium px-2 py-1 rounded-full border transition flex items-center gap-1.5 ${
                  ativo ? statusColor(s).badge : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full inline-block ${ativo ? statusColor(s).dot : 'bg-slate-300'}`}
                />
                {s}
              </button>
            )
          })}
          <button
            onClick={() => setStatusSel(todosStatus ? [] : [...STATUS_COLUNAS])}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium ml-1"
          >
            {todosStatus ? 'Limpar' : 'Todos'}
          </button>
        </div>
      </div>

      {/* Meta de pontos do mês */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Meta Pontos</h3>
          <span className="text-xs text-slate-400">{mesSel ? monthLabel(mesSel) : 'Todos os meses'}</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Soma dos pontos nos projetos aprovados (Concluído) com aprovação{' '}
          {mesSel ? `em ${monthLabel(mesSel).toLowerCase()}` : 'em qualquer mês'}, independente de quando
          começaram: <b className="text-slate-700">{pontosAtuais.toLocaleString('pt-BR')} pts</b>
          {proximaMeta && (
            <>
              {' '}
              · faltam <b className="text-indigo-600">{(proximaMeta.meta - pontosAtuais).toLocaleString('pt-BR')} pts</b> para a
              meta {proximaMeta.sub} ({proximaMeta.label})
            </>
          )}
        </p>
        {semDataAprovacao > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3">
            {semDataAprovacao} projeto{semDataAprovacao !== 1 ? 's' : ''} concluído
            {semDataAprovacao !== 1 ? 's' : ''} sem <b>data de aprovação</b> preenchida nos Dados do cliente —
            {semDataAprovacao !== 1 ? ' eles estão' : ' ele está'} contando pela data do prazo.
          </p>
        )}
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={metaChartData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend
              formatter={(value) => (value === 'atual' ? 'Pontos atuais' : 'Meta')}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="atual" name="atual" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Bar dataKey="meta" name="meta" fill="#ea580c" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cards de resumo */}
      {/* Projeção dos próximos meses com base no planejamento */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Projeção dos próximos meses
          </h3>
          <span className="text-xs text-slate-400">{MESES_PROJECAO} meses à frente</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          <b className="text-slate-700">Realizado</b>: projetos concluídos, no mês da aprovação.{' '}
          <b className="text-slate-700">Previsto</b>: em aberto, no mês do fim previsto da aba Planejamento.{' '}
          <b className="text-slate-700">Estimado</b>: em aberto sem planejamento — usa a data de prazo, então é
          só uma aproximação. Ignora o filtro de mês, mas respeita o de status.
        </p>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={projecao} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<PreviaProjecao />} cursor={{ fill: 'rgba(99,102,241,.07)' }} />
            <Legend
              formatter={(value) =>
                value === 'realizado' ? 'Realizado' : value === 'previsto' ? 'Previsto (planejado)' : 'Estimado (sem plano)'
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="realizado" name="realizado" stackId="p" fill="#22c55e" />
            <Bar dataKey="previsto" name="previsto" stackId="p" fill="#6366f1" />
            <Bar dataKey="estimado" name="estimado" stackId="p" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-[11px] text-slate-500">
          <span>
            Realizado no período:{' '}
            <b className="text-slate-700">
              {projecao.reduce((s, l) => s + l.realizado, 0).toLocaleString('pt-BR')} pts
            </b>
          </span>
          <span>
            Previsto pelo planejamento:{' '}
            <b className="text-slate-700">
              {projecao.reduce((s, l) => s + l.previsto, 0).toLocaleString('pt-BR')} pts
            </b>
          </span>
          <span>
            Estimado pelo prazo:{' '}
            <b className="text-slate-700">
              {projecao.reduce((s, l) => s + l.estimado, 0).toLocaleString('pt-BR')} pts
            </b>
          </span>
        </div>

        {/* O que NÃO está no gráfico — sem isso a projeção engana */}
        {(diagnostico.semData.pontos > 0 ||
          diagnostico.foraDaJanela.pontos > 0 ||
          diagnostico.vencidos.pontos > 0) && (
          <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-amber-900">Atenção ao ler este gráfico</p>

            {diagnostico.semData.pontos > 0 && (
              <p className="text-[11px] text-amber-800">
                <b>{diagnostico.semData.pontos.toLocaleString('pt-BR')} pts</b> em{' '}
                {diagnostico.semData.projetos} projeto{diagnostico.semData.projetos !== 1 ? 's' : ''} ficam
                <b> fora do gráfico</b>: não têm fim previsto nem data de prazo. Preencha a aba Planejamento
                para eles entrarem na conta.
              </p>
            )}

            {diagnostico.vencidos.pontos > 0 && (
              <p className="text-[11px] text-amber-800">
                <b>{diagnostico.vencidos.pontos.toLocaleString('pt-BR')} pts</b> em{' '}
                {diagnostico.vencidos.projetos} projeto{diagnostico.vencidos.projetos !== 1 ? 's' : ''} estão
                com a data já vencida e foram realocados para o mês atual.
              </p>
            )}

            {diagnostico.foraDaJanela.pontos > 0 && (
              <p className="text-[11px] text-amber-800">
                <b>{diagnostico.foraDaJanela.pontos.toLocaleString('pt-BR')} pts</b> caem fora da janela de
                meses mostrada.
              </p>
            )}
          </div>
        )}

        {(diagnostico.comPlano.projetos > 0 || diagnostico.semPlano.projetos > 0) && (
          <p className="text-[11px] text-slate-500 mt-2">
            Dos projetos em aberto, <b className="text-slate-700">{diagnostico.comPlano.projetos}</b> têm
            planejamento preenchido e <b className="text-slate-700">{diagnostico.semPlano.projetos}</b> não têm.
            Quanto maior o primeiro número, mais confiável fica a projeção.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total de projetos" value={projects.length} />
        <StatCard label="Total de pontos" value={totalPontos.toLocaleString('pt-BR')} />
        <StatCard label="Área total (m²)" value={totalM2.toLocaleString('pt-BR')} />
        <StatCard label="Atrasados" value={atrasados} accent="text-red-600" />
      </div>

      {/* Destaque do líder */}
      {lider && (
        <div className="bg-gradient-to-r from-amber-50 to-white border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <span className="text-4xl">🏆</span>
          <div>
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">
              Funcionário com mais pontos
            </p>
            <p className="text-lg font-semibold text-slate-800">
              {lider.responsavel} · {lider.pontos.toLocaleString('pt-BR')} pts
            </p>
            <p className="text-xs text-slate-500">
              {lider.projetos} projeto{lider.projetos !== 1 ? 's' : ''} · {lider.m2.toLocaleString('pt-BR')} m²
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking de pontos */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Ranking de pontos por responsável</h3>
          <p className="text-[11px] text-slate-400 mb-2">
            Conta só o que foi aprovado no mês — é o que vale para a meta.
          </p>
          <div className="space-y-2">
            {ranking.map((r, i) => {
              const max = ranking[0]?.pontos || 1
              return (
                <div key={r.responsavel} className="flex items-center gap-2">
                  <span className="w-6 text-center text-sm">{MEDALS[i] || i + 1}</span>
                  <span className="w-24 text-xs text-slate-600 truncate">{r.responsavel}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(4, (r.pontos / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-xs font-medium text-slate-700">{r.pontos} pts</span>
                </div>
              )
            })}
            {ranking.length === 0 && <p className="text-xs text-slate-400">Sem dados</p>}
          </div>
        </div>

        {/* Gráfico de barras - pontos por responsável */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Pontos por responsável</h3>
          <p className="text-[11px] text-slate-400 mb-2">
            Projetos aprovados {mesSel ? `em ${monthLabel(mesSel).toLowerCase()}` : 'em qualquer mês'}.
            Passe o mouse na barra para ver quais são.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rankingChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                content={<PreviaDoResponsavel detalhes={projetosPorResponsavel} />}
              />
              <Bar dataKey="pontos" radius={[4, 4, 0, 0]}>
                {/* Cada pessoa com a sua cor, a mesma do calendário e do Gantt. */}
                {rankingChartData.map((r, i) => (
                  <Cell key={i} fill={corDoResponsavel(r.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pizza de status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Distribuição por status</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85} label={(e) => `${e.name} ${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_CHART_COLORS[entry.name] || RANKING_COLORS[i % RANKING_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela resumo por status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Resumo por status</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 uppercase text-[10px]">
                <th className="text-left py-1">Status</th>
                <th className="text-right py-1">Qtd</th>
                <th className="text-right py-1">%</th>
                <th className="text-right py-1">m²</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((r) => (
                <tr key={r.status} className="border-t border-slate-100">
                  <td className="py-1.5 flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: STATUS_CHART_COLORS[r.status] || '#94a3b8' }}
                    />
                    {r.status}
                  </td>
                  <td className="text-right py-1.5">{r.count}</td>
                  <td className="text-right py-1.5">{r.pct}%</td>
                  <td className="text-right py-1.5">{r.m2.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold text-slate-700">
                <td className="py-1.5">Total</td>
                <td className="text-right py-1.5">{projects.length}</td>
                <td className="text-right py-1.5">100%</td>
                <td className="text-right py-1.5">{totalM2.toLocaleString('pt-BR')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * Prévia ao passar o mouse no gráfico de pontos: mostra exatamente quais
 * projetos formam a barra daquela pessoa.
 */
function PreviaDoResponsavel({
  active,
  label,
  detalhes,
}: {
  active?: boolean
  label?: string
  detalhes: Map<string, { nome: string; numero: number | null; pts: number; aprovacao: string }[]>
}) {
  if (!active || !label) return null
  const lista = detalhes.get(label) || []
  const total = lista.reduce((s, p) => s + p.pts, 0)

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 max-w-xs">
      <p className="text-xs font-semibold text-slate-800 mb-1">
        {label} · {total.toLocaleString('pt-BR')} pts
        <span className="font-normal text-slate-400"> · {lista.length} projeto(s)</span>
      </p>
      <div className="space-y-0.5 max-h-56 overflow-y-auto">
        {lista.map((p, i) => (
          <p key={i} className="text-[11px] text-slate-600 flex gap-1.5">
            <span className="text-slate-400 tabular-nums shrink-0">
              {p.aprovacao.slice(8, 10)}/{p.aprovacao.slice(5, 7)}
            </span>
            <span className="flex-1 truncate">
              {p.numero ? `${p.numero} · ` : ''}
              {p.nome}
            </span>
            <span className="font-medium text-slate-700 shrink-0">{p.pts}</span>
          </p>
        ))}
        {lista.length === 0 && <p className="text-[11px] text-slate-400">Nenhum projeto aprovado.</p>}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
