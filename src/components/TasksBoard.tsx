import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import type { ProjectTask } from '../types'
import { TASK_STATUS, TASK_STATUS_COLORS, isTaskLate } from '../types'

type TaskRow = ProjectTask & { projects: { nome: string; numero: number | null } | null }

type GroupBy = 'colaborador' | 'projeto'

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const STATUS_BAR_COLORS: Record<string, string> = {
  Pendente: '#94a3b8',
  'Em andamento': '#6366f1',
  Atrasada: '#ef4444',
  'Concluído': '#22c55e',
}

export default function TasksBoard({
  onProjectClick,
}: {
  /** Abre o cartão do projeto ao qual a tarefa pertence. */
  onProjectClick?: (projectId: string) => void
} = {}) {
  const [rows, setRows] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('colaborador')
  const [busca, setBusca] = useState('')
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*, projects(nome, numero)')
      .order('data_prazo', { ascending: true })
    if (error) alert(error.message)
    setRows((data as TaskRow[]) || [])
    setLoading(false)
  }

  /** Troca o status da tarefa direto na lista, sem abrir o projeto. */
  async function mudarStatus(task: TaskRow, status: string) {
    const patch: Partial<ProjectTask> = { status }
    // Concluir carimba a data de hoje; reabrir limpa a conclusão.
    if (status === 'Concluído') {
      patch.data_conclusao = task.data_conclusao || new Date().toISOString().slice(0, 10)
    } else {
      patch.data_conclusao = null
    }

    setRows((prev) => prev.map((r) => (r.id === task.id ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('project_tasks').update(patch).eq('id', task.id)
    if (error) {
      alert(error.message)
      load()
    }
  }

  /** Corrige a data em que a tarefa foi de fato concluída. */
  async function mudarDataConclusao(task: TaskRow, data: string) {
    const valor = data || null
    setRows((prev) => prev.map((r) => (r.id === task.id ? { ...r, data_conclusao: valor } : r)))
    const { error } = await supabase
      .from('project_tasks')
      .update({ data_conclusao: valor })
      .eq('id', task.id)
    if (error) alert(error.message)
  }

  /** Ajusta a justificativa de uma tarefa atrasada sem sair da tela. */
  async function salvarJustificativa(task: TaskRow, texto: string) {
    setRows((prev) => prev.map((r) => (r.id === task.id ? { ...r, justificativa: texto } : r)))
    const { error } = await supabase
      .from('project_tasks')
      .update({ justificativa: texto || null })
      .eq('id', task.id)
    if (error) alert(error.message)
  }

  const visiveis = useMemo(
    () => (mostrarConcluidas ? rows : rows.filter((r) => r.status !== 'Concluído')),
    [rows, mostrarConcluidas]
  )

  const filtradas = useMemo(() => {
    if (!busca) return visiveis
    return visiveis.filter((r) => {
      const alvo = `${r.projects?.nome || ''} ${r.nome} ${r.responsavel || ''}`.toLowerCase()
      return alvo.includes(busca.toLowerCase())
    })
  }, [visiveis, busca])

  const totalConcluidas = useMemo(() => rows.filter((r) => r.status === 'Concluído').length, [rows])

  // Dashboard: contagem por colaborador, separando Pendente / Em andamento / Atrasada
  const dashboardData = useMemo(() => {
    const map = new Map<string, { colaborador: string; Pendente: number; 'Em andamento': number; Atrasada: number; Concluído: number }>()
    for (const t of rows) {
      const nome = t.responsavel || 'Sem responsável'
      if (!map.has(nome)) {
        map.set(nome, { colaborador: nome, Pendente: 0, 'Em andamento': 0, Atrasada: 0, Concluído: 0 })
      }
      const row = map.get(nome)!
      if (isTaskLate(t)) {
        row.Atrasada += 1
      } else if (t.status === 'Pendente') {
        row.Pendente += 1
      } else if (t.status === 'Em andamento') {
        row['Em andamento'] += 1
      } else if (t.status === 'Concluído') {
        row['Concluído'] += 1
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.Pendente + b['Em andamento'] + b.Atrasada - (a.Pendente + a['Em andamento'] + a.Atrasada)
    )
  }, [rows])

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const t of filtradas) {
      const key =
        groupBy === 'colaborador'
          ? t.responsavel || 'Sem responsável'
          : t.projects?.numero
            ? `${t.projects.numero} · ${t.projects.nome}`
            : t.projects?.nome || 'Projeto'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtradas, groupBy])

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando tarefas...</p>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dashboard de tarefas por colaborador</h3>
        {dashboardData.length === 0 ? (
          <p className="text-xs text-slate-400">Sem dados de tarefas ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, dashboardData.length * 40)}>
            <BarChart data={dashboardData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="colaborador" tick={{ fontSize: 11 }} width={110} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Pendente" stackId="s" fill={STATUS_BAR_COLORS.Pendente} />
              <Bar dataKey="Em andamento" stackId="s" fill={STATUS_BAR_COLORS['Em andamento']} />
              <Bar dataKey="Atrasada" stackId="s" fill={STATUS_BAR_COLORS.Atrasada} />
              <Bar
                dataKey="Concluído"
                stackId="s"
                fill={STATUS_BAR_COLORS['Concluído']}
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(
            [
              ['colaborador', 'Por colaborador'],
              ['projeto', 'Por projeto'],
            ] as [GroupBy, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setGroupBy(mode)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                groupBy === mode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          placeholder="Buscar por tarefa, projeto ou responsável..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[200px] max-w-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={mostrarConcluidas}
            onChange={(e) => setMostrarConcluidas(e.target.checked)}
          />
          Mostrar concluídas
          {totalConcluidas > 0 && <span className="text-slate-400">({totalConcluidas})</span>}
        </label>

        <span className="text-xs text-slate-400 ml-auto">
          {filtradas.length} tarefa(s) {mostrarConcluidas ? 'no total' : 'pendente(s)'}
        </span>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
          {mostrarConcluidas
            ? 'Nenhuma tarefa encontrada com os filtros atuais.'
            : 'Nenhuma tarefa pendente encontrada. 🎉'}
        </p>
      )}

      {grouped.map(([key, tasks]) => (
        <div key={key} className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">
            {key} <span className="text-xs font-normal text-slate-400">· {tasks.length}</span>
          </h3>
          <div className="space-y-1.5">
            {tasks.map((t) => {
              const late = isTaskLate(t)
              return (
                <div
                  key={t.id}
                  className={`border rounded-lg px-2.5 py-1.5 ${
                    late ? 'border-red-200 bg-red-50/40' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {t.codigo && (
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
                        {t.codigo}
                      </span>
                    )}
                    <button
                      onClick={() => onProjectClick?.(t.project_id)}
                      disabled={!onProjectClick}
                      className={`font-medium text-left ${
                        t.status === 'Concluído' ? 'line-through text-slate-400' : 'text-slate-800'
                      } ${onProjectClick ? 'hover:text-indigo-700 hover:underline cursor-pointer' : ''}`}
                      title={onProjectClick ? 'Abrir o cartão do projeto' : undefined}
                    >
                      {t.nome}
                    </button>
                    {groupBy === 'projeto' ? (
                      t.responsavel && <span className="text-slate-500">· {t.responsavel}</span>
                    ) : (
                      <button
                        onClick={() => onProjectClick?.(t.project_id)}
                        disabled={!onProjectClick}
                        className={`text-slate-500 ${
                          onProjectClick ? 'hover:text-indigo-700 hover:underline cursor-pointer' : ''
                        }`}
                        title={onProjectClick ? 'Abrir o cartão do projeto' : undefined}
                      >
                        · {t.projects?.numero ? `${t.projects.numero} · ` : ''}
                        {t.projects?.nome}
                      </button>
                    )}
                    <span className="text-slate-400">· prazo {formatDate(t.data_prazo)}</span>
                    {t.status === 'Concluído' && (
                      <label className="flex items-center gap-1 text-[10px] text-slate-500">
                        concluída em
                        <input
                          type="date"
                          className="border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                          value={t.data_conclusao || ''}
                          onChange={(e) => mudarDataConclusao(t, e.target.value)}
                          title="Ajuste se a tarefa foi concluída em outro dia"
                        />
                      </label>
                    )}
                    {late && <span className="text-red-600 font-semibold text-[10px]">⚠ Atrasada</span>}

                    {/* Mudar o status sem precisar abrir o projeto */}
                    <select
                      value={t.status}
                      onChange={(e) => mudarStatus(t, e.target.value)}
                      className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer ${
                        TASK_STATUS_COLORS[t.status] || ''
                      }`}
                      title="Alterar o status da tarefa"
                    >
                      {TASK_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Atrasada exige justificativa; deixa editar aqui mesmo */}
                  {late && (
                    <textarea
                      className={`w-full mt-1.5 border rounded-md px-2 py-1 text-[11px] ${
                        t.justificativa ? 'border-slate-300' : 'border-red-400'
                      }`}
                      rows={2}
                      placeholder="Justificativa: por que a tarefa não foi concluída no prazo?"
                      defaultValue={t.justificativa || ''}
                      onBlur={(e) => salvarJustificativa(t, e.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
