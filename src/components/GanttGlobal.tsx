import { useMemo } from 'react'
import type { Project } from '../types'
import { normalizeStatus } from '../types'
import { STATUS_CHART_COLORS } from '../lib/stats'
import GanttChart from './GanttChart'
import type { GanttItem } from './GanttChart'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function GanttGlobal({ projects }: { projects: Project[] }) {
  const items: GanttItem[] = useMemo(() => {
    return projects
      .filter((p) => p.data_inicio)
      .map((p) => {
        const status = normalizeStatus(p.status)
        const end = p.data_prazo || p.data_inicio
        const late = status !== 'Concluído' && !!p.data_prazo && p.data_prazo < todayStr()
        return {
          id: p.id,
          label: p.numero ? `${p.numero} · ${p.nome}` : p.nome,
          sublabel: p.responsavel || undefined,
          start: p.data_inicio,
          end,
          color: late ? '#ef4444' : STATUS_CHART_COLORS[status] || '#94a3b8',
          tooltip: `${p.nome} · ${status}${late ? ' · ATRASADO' : ''}`,
        }
      })
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [projects])

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Gantt global · início e prazo dos projetos</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <LegendDot color="#ef4444" label="Atrasado" />
          <LegendDot color="#10b981" label="Concluído" />
          <LegendDot color="#6366f1" label="Executando" />
          <LegendDot color="#94a3b8" label="Outros status" />
        </div>
      </div>
      <GanttChart items={items} labelWidth={220} rowHeight={28} />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {label}
    </span>
  )
}
