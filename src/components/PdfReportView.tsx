import { forwardRef } from 'react'
import type { Project } from '../types'
import { rankingPorResponsavel, statusDistribution, STATUS_CHART_COLORS } from '../lib/stats'
import { letraColor, weekdayLetter } from '../lib/pdfColors'
import type { MonthRef } from '../lib/month'
import { daysInMonth, monthLabel } from '../lib/month'
import Donut from './Donut'

const MEDALS = ['🥇', '🥈', '🥉']

function formatDateBR(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

type Props = {
  categoria: string
  projects: Project[]
  progressMap: Record<string, Record<number, string>>
  month: MonthRef
}

const PdfReportView = forwardRef<HTMLDivElement, Props>(({ categoria, projects, progressMap, month }, ref) => {
  const DAYS = Array.from({ length: daysInMonth(month) }, (_, i) => i + 1)
  const ranking = rankingPorResponsavel(projects)
  const statusRows = statusDistribution(projects)
  const totalPontos = projects.reduce((s, p) => s + (p.pts || 0), 0)
  const totalM2 = projects.reduce((s, p) => s + (p.m2 || 0), 0)
  const hoje = new Date()

  const pieData = statusRows.map((r) => ({
    label: r.status,
    value: r.count,
    color: STATUS_CHART_COLORS[r.status] || '#94a3b8',
  }))

  return (
    <div ref={ref} style={{ width: 2200 }} className="bg-white p-8 text-slate-800 font-sans">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-3">
        <div className="text-xs">
          <span className="font-semibold">NOME:</span> Gestão de Projetos
        </div>
        <h1 className="text-xl font-bold uppercase tracking-wide">
          Planejamento Estratégico · {categoria} · {monthLabel(month)}
        </h1>
        <div className="text-xs">
          <span className="font-semibold">Data:</span>{' '}
          {hoje.toLocaleDateString('pt-BR')}
        </div>
      </div>

      {/* Tabela do cronograma */}
      <table className="w-full text-[10px] border-collapse mb-6">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="px-2 py-1.5 text-left sticky left-0">Projeto</th>
            <th className="px-2 py-1.5 text-left">Responsável</th>
            <th className="px-2 py-1.5 text-left">Status</th>
            <th className="px-2 py-1.5 text-left">Tipo</th>
            <th className="px-2 py-1.5 text-right">Pts</th>
            <th className="px-2 py-1.5 text-right">m²</th>
            <th className="px-2 py-1.5 text-left">Prazo</th>
            <th className="px-2 py-1.5 text-left">Data</th>
            {DAYS.map((d) => (
              <th key={d} className="w-5 px-0.5 py-1.5 text-center border-l border-slate-600">
                <div>{weekdayLetter(month.year, month.month, d)}</div>
              </th>
            ))}
          </tr>
          <tr className="bg-slate-100">
            <th colSpan={8} className="px-2 py-1 text-left text-slate-400">
              #
            </th>
            {DAYS.map((d) => (
              <th key={d} className="w-5 px-0.5 py-1 text-center text-slate-500 border-l border-slate-200">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, idx) => {
            const prog = progressMap[p.id] || {}
            return (
              <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-2 py-1 border-t border-slate-200 font-medium whitespace-nowrap max-w-[220px] overflow-hidden text-ellipsis">
                  {p.nome}
                </td>
                <td className="px-2 py-1 border-t border-slate-200 whitespace-nowrap">{p.responsavel}</td>
                <td className="px-2 py-1 border-t border-slate-200 whitespace-nowrap">{p.status}</td>
                <td className="px-2 py-1 border-t border-slate-200">{p.tipo}</td>
                <td className="px-2 py-1 border-t border-slate-200 text-right">{p.pts ?? ''}</td>
                <td className="px-2 py-1 border-t border-slate-200 text-right whitespace-nowrap">
                  {p.m2 != null ? p.m2.toLocaleString('pt-BR') : ''}
                </td>
                <td className="px-2 py-1 border-t border-slate-200 whitespace-nowrap">{p.prazo_categoria}</td>
                <td className="px-2 py-1 border-t border-slate-200 whitespace-nowrap">
                  {formatDateBR(p.data_prazo)}
                </td>
                {DAYS.map((d) => (
                  <td
                    key={d}
                    className="w-5 h-5 text-center border-l border-t border-slate-200 text-[9px] font-semibold"
                    style={{ background: letraColor(prog[d]) }}
                  >
                    {prog[d] ? prog[d].toUpperCase() : ''}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Legenda */}
      <div className="flex gap-3 mb-6 text-[10px] flex-wrap">
        {[
          ['S', 'Início'],
          ['P', 'Pendente'],
          ['E', 'Executando'],
          ['T', 'Tramitando'],
          ['C', 'Correção'],
          ['D', 'Concluído'],
          ['Z', 'Standby'],
        ].map(([k, label]) => (
          <span
            key={k}
            className={`flex items-center gap-1 px-2 py-0.5 rounded ${
              k === 'S' || k === 'C' ? 'text-white' : 'text-slate-800'
            }`}
            style={{ background: letraColor(k) }}
          >
            {k} · {label}
          </span>
        ))}
      </div>

      {/* Painel de resumo */}
      <div className="grid grid-cols-4 gap-4">
        {/* Cards */}
        <div className="col-span-4 grid grid-cols-4 gap-3 mb-1">
          <SummaryCard label="Total de projetos" value={projects.length} />
          <SummaryCard label="Total de pontos" value={totalPontos.toLocaleString('pt-BR')} />
          <SummaryCard label="Área total (m²)" value={totalM2.toLocaleString('pt-BR')} />
          <SummaryCard
            label="Atrasados"
            value={projects.filter((p) => p.prazo_categoria === 'ATRASADO').length}
          />
        </div>

        {/* Resumo por status */}
        <div className="col-span-2 border border-slate-200 rounded-lg p-3">
          <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Resumo por status</h3>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left py-1">Status</th>
                <th className="text-right py-1">Qtd</th>
                <th className="text-right py-1">%</th>
                <th className="text-right py-1">m²</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((r) => (
                <tr key={r.status} className="border-t border-slate-100">
                  <td className="py-1 flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: STATUS_CHART_COLORS[r.status] || '#94a3b8' }}
                    />
                    {r.status}
                  </td>
                  <td className="text-right py-1">{r.count}</td>
                  <td className="text-right py-1">{r.pct}%</td>
                  <td className="text-right py-1">{r.m2.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Donut */}
        <div className="col-span-1 border border-slate-200 rounded-lg p-3 flex items-center justify-center">
          <Donut data={pieData} size={150} />
        </div>

        {/* Ranking / funcionário da semana */}
        <div className="col-span-1 border border-slate-200 rounded-lg p-3">
          <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Ranking de pontos</h3>
          <div className="space-y-1.5">
            {ranking.slice(0, 6).map((r, i) => (
              <div key={r.responsavel} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 truncate">
                  <span>{MEDALS[i] || `${i + 1}º`}</span> {r.responsavel}
                </span>
                <span className="font-semibold">{r.pontos} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[9px] text-slate-400 mt-4">
        Relatório gerado automaticamente · Gestão de Projetos · {hoje.toLocaleString('pt-BR')}
      </p>
    </div>
  )
})

PdfReportView.displayName = 'PdfReportView'

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[9px] text-slate-400 uppercase">{label}</p>
      <p className="text-base font-bold text-slate-800">{value}</p>
    </div>
  )
}

export default PdfReportView
