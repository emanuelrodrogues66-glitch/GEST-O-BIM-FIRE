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
import type { Project } from '../types'
import {
  RANKING_COLORS,
  STATUS_CHART_COLORS,
  METAS_PONTOS,
  metaPontosAtual,
  rankingPorResponsavel,
  statusDistribution,
} from '../lib/stats'
import type { MonthRef } from '../lib/month'
import { monthLabel } from '../lib/month'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Dashboard({ projects, month }: { projects: Project[]; month: MonthRef }) {
  const ranking = rankingPorResponsavel(projects)
  const statusRows = statusDistribution(projects)

  const totalPontos = projects.reduce((s, p) => s + (p.pts || 0), 0)
  const totalM2 = projects.reduce((s, p) => s + (p.m2 || 0), 0)
  const atrasados = projects.filter((p) => p.prazo_categoria === 'ATRASADO').length
  const lider = ranking[0]

  const pieData = statusRows.map((r) => ({ name: r.status, value: r.count }))
  const rankingChartData = ranking.slice(0, 10).map((r) => ({ name: r.responsavel, pontos: r.pontos }))

  const pontosAtuais = metaPontosAtual(projects)
  const metaChartData = METAS_PONTOS.map((m) => ({
    name: `${m.label} · ${m.sub}`,
    atual: pontosAtuais,
    meta: m.meta,
  }))
  const proximaMeta = METAS_PONTOS.find((m) => m.meta > pontosAtuais)

  return (
    <div className="space-y-4">
      {/* Meta de pontos do mês */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Meta Pontos</h3>
          <span className="text-xs text-slate-400">{monthLabel(month)}</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Soma dos pontos de todos os funcionários nos projetos aprovados (Concluído) neste mês:{' '}
          <b className="text-slate-700">{pontosAtuais.toLocaleString('pt-BR')} pts</b>
          {proximaMeta && (
            <>
              {' '}
              · faltam <b className="text-indigo-600">{(proximaMeta.meta - pontosAtuais).toLocaleString('pt-BR')} pts</b> para a
              meta {proximaMeta.sub} ({proximaMeta.label})
            </>
          )}
        </p>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Ranking de pontos por responsável</h3>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Pontos por responsável</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rankingChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="pontos" radius={[4, 4, 0, 0]}>
                {rankingChartData.map((_, i) => (
                  <Cell key={i} fill={RANKING_COLORS[i % RANKING_COLORS.length]} />
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

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
