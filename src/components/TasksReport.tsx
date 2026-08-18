import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectTask } from '../types'
import { TASK_STATUS, isTaskLate } from '../types'

type TaskRow = ProjectTask & { projects: { nome: string; numero: number | null } | null }

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function TasksReport({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
} = {}) {
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [somenteSemJustificativa, setSomenteSemJustificativa] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*, projects(nome, numero)')
      .order('data_prazo', { ascending: true })
    if (error) {
      alert(error.message)
    }
    setRows((data as TaskRow[]) || [])
    setLoading(false)
  }

  async function saveJustificativa(id: string, justificativa: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, justificativa } : r)))
    await supabase.from('project_tasks').update({ justificativa: justificativa || null }).eq('id', id)
  }

  async function saveStatus(id: string, status: string) {
    const patch: Partial<ProjectTask> = { status }
    if (status === 'Concluído') patch.data_conclusao = new Date().toISOString().slice(0, 10)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    await supabase.from('project_tasks').update(patch).eq('id', id)
  }

  const late = useMemo(() => {
    return rows
      .filter((r) => isTaskLate(r))
      .filter((r) => {
        if (busca) {
          const alvo = `${r.projects?.nome || ''} ${r.nome} ${r.responsavel || ''}`.toLowerCase()
          if (!alvo.includes(busca.toLowerCase())) return false
        }
        if (somenteSemJustificativa && r.justificativa) return false
        return true
      })
  }, [rows, busca, somenteSemJustificativa])

  const grouped = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; numero: number | null; tasks: TaskRow[] }>()
    for (const r of late) {
      const key = r.project_id
      if (!map.has(key)) {
        map.set(key, {
          id: r.project_id,
          nome: r.projects?.nome || 'Projeto',
          numero: r.projects?.numero ?? null,
          tasks: [],
        })
      }
      map.get(key)!.tasks.push(r)
    }
    return Array.from(map.values()).sort((a, b) => (a.numero || 0) - (b.numero || 0))
  }, [late])

  const semJustificativa = late.filter((r) => !r.justificativa).length

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando relatório...</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Tarefas atrasadas" value={late.length} accent="text-red-600" />
        <StatCard label="Sem justificativa" value={semJustificativa} accent="text-amber-600" />
        <StatCard label="Projetos afetados" value={grouped.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar por projeto, tarefa ou responsável..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[200px] max-w-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={somenteSemJustificativa}
            onChange={(e) => setSomenteSemJustificativa(e.target.checked)}
          />
          Somente sem justificativa
        </label>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
          Nenhuma tarefa atrasada encontrada. 🎉
        </p>
      )}

      {grouped.map((g) => (
        <div key={g.id} className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">
            <button
              onClick={() => onProjectClick?.(g.id)}
              disabled={!onProjectClick}
              className={onProjectClick ? 'hover:text-indigo-700 hover:underline cursor-pointer' : ''}
              title={onProjectClick ? 'Abrir o cartão do projeto' : undefined}
            >
              {g.numero ? `${g.numero} · ` : ''}
              {g.nome}
            </button>
          </h3>
          <div className="space-y-2">
            {g.tasks.map((t) => (
              <div key={t.id} className="border border-red-200 bg-red-50/40 rounded-lg p-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => onProjectClick?.(t.project_id)}
                    disabled={!onProjectClick}
                    className={`font-medium text-slate-800 text-left ${
                      onProjectClick ? 'hover:text-indigo-700 hover:underline cursor-pointer' : ''
                    }`}
                    title={onProjectClick ? 'Abrir o cartão do projeto' : undefined}
                  >
                    {t.nome}
                  </button>
                  {t.responsavel && <span className="text-slate-500">· {t.responsavel}</span>}
                  <span className="text-red-600">· prazo {formatDate(t.data_prazo)}</span>
                  <select
                    value={t.status}
                    onChange={(e) => saveStatus(t.id, e.target.value)}
                    className="ml-auto text-[11px] border border-slate-300 rounded px-1.5 py-0.5 bg-white"
                  >
                    {TASK_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className={`w-full border rounded-md px-2 py-1 text-xs ${
                    t.justificativa ? 'border-slate-300' : 'border-red-400'
                  }`}
                  rows={2}
                  placeholder="Justificativa: por que a tarefa não foi concluída no prazo?"
                  defaultValue={t.justificativa || ''}
                  onBlur={(e) => saveJustificativa(t.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
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
