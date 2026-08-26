import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectTask } from '../types'
import { TASK_STATUS, TASK_STATUS_COLORS, taskNeedsJustificativa } from '../types'
import { usePerfil } from '../lib/perfil'
import GanttChart from './GanttChart'
import type { GanttItem } from './GanttChart'
import TaskAttachments from './TaskAttachments'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function TaskSchedule({
  projectId,
  responsaveis,
}: {
  projectId: string
  responsaveis: string[]
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showGantt, setShowGantt] = useState(false)
  const [newTask, setNewTask] = useState({ nome: '', responsavel: '', data_inicio: todayStr(), data_prazo: '' })
  const [adding, setAdding] = useState(false)

  // Datas definidas ficam travadas; só o administrador reabre.
  const { ehAdmin } = usePerfil()

  // Tarefa recém-concluída: destaca o campo de data para confirmar ou ajustar.
  const [confirmandoConclusao, setConfirmandoConclusao] = useState<string | null>(null)

  // Observações e anexos ficam recolhidos: a maioria das tarefas não usa.
  const [anexosAbertos, setAnexosAbertos] = useState<string | null>(null)

  // Reordenação manual por arrastar.
  const [arrastandoId, setArrastandoId] = useState<string | null>(null)
  const [arrastandoSobre, setArrastandoSobre] = useState<string | null>(null)
  const linhasRef = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    loadTasks()
    loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('ordem', { ascending: true })
      .order('data_prazo', { ascending: true })
    setTasks((data as ProjectTask[]) || [])
    setLoading(false)
  }

  async function loadSuggestions() {
    const { data } = await supabase
      .from('project_tasks')
      .select('nome')
      .order('created_at', { ascending: false })
      .limit(500)
    const freq = new Map<string, number>()
    ;(data as { nome: string }[] | null)?.forEach((r) => {
      freq.set(r.nome, (freq.get(r.nome) || 0) + 1)
    })
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome]) => nome)
    setSuggestions(sorted)
  }

  async function handleAdd() {
    if (!newTask.nome.trim() || !newTask.data_prazo) return
    setAdding(true)
    try {
      const payload = {
        project_id: projectId,
        nome: newTask.nome.trim(),
        responsavel: newTask.responsavel.trim() || null,
        data_inicio: newTask.data_inicio || null,
        data_prazo: newTask.data_prazo,
        status: 'Pendente',
        ordem: tasks.length,
      }
      const { data, error } = await supabase.from('project_tasks').insert(payload).select().single()
      if (error) throw error
      setTasks((prev) => [...prev, data as ProjectTask])
      setNewTask({ nome: '', responsavel: '', data_inicio: todayStr(), data_prazo: '' })
      loadSuggestions()
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar tarefa')
    } finally {
      setAdding(false)
    }
  }

  /**
   * Move a tarefa arrastada para a posição de destino e grava a nova ordem.
   * A lista passa a seguir a ordem manual, não mais o prazo.
   */
  async function soltarEm(destino: number) {
    const origem = tasks.findIndex((t) => t.id === arrastandoId)
    setArrastandoSobre(null)
    setArrastandoId(null)
    if (origem === -1 || origem === destino) return

    const nova = [...tasks]
    const [movida] = nova.splice(origem, 1)
    nova.splice(destino, 0, movida)

    // Renumera do zero para a ordem ficar previsível no banco.
    const comOrdem = nova.map((t, i) => ({ ...t, ordem: i }))
    setTasks(comOrdem)

    // Só as linhas que realmente mudaram de posição precisam ir ao banco.
    const alteradas = comOrdem.filter((t, i) => tasks[i]?.id !== t.id)
    const resultados = await Promise.all(
      alteradas.map((t) => supabase.from('project_tasks').update({ ordem: t.ordem }).eq('id', t.id))
    )

    const falha = resultados.find((r) => r.error)
    if (falha?.error) {
      alert(falha.error.message)
      loadTasks()
    }
  }

  function updateLocal(id: string, patch: Partial<ProjectTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function saveField(id: string, patch: Partial<ProjectTask>) {
    updateLocal(id, patch)
    const { error } = await supabase.from('project_tasks').update(patch).eq('id', id)
    if (error) alert(error.message)
  }

  async function handleStatusChange(task: ProjectTask, status: string) {
    const patch: Partial<ProjectTask> = { status }
    if (status === 'Concluído') {
      if (!task.data_conclusao) patch.data_conclusao = todayStr()
      // Hoje é só o palpite: o usuário confirma ou corrige logo abaixo.
      setConfirmandoConclusao(task.id)
    }
    if (status !== 'Concluído') {
      patch.data_conclusao = null
      setConfirmandoConclusao((v) => (v === task.id ? null : v))
    }
    await saveField(task.id, patch)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta tarefa do cronograma?')) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('project_tasks').delete().eq('id', id)
  }

  const ganttItems: GanttItem[] = useMemo(
    () =>
      tasks
        .filter((t) => t.data_prazo)
        .map((t) => {
          const late = taskNeedsJustificativa(t)
          const color = t.status === 'Concluído' ? (late ? '#f59e0b' : '#10b981') : late ? '#ef4444' : '#6366f1'
          return {
            id: t.id,
            label: t.nome,
            sublabel: t.responsavel || undefined,
            start: t.data_inicio || t.data_prazo,
            end: t.data_conclusao || t.data_prazo,
            color,
            tooltip: `${t.nome} · ${t.status}${late ? ' · ATRASADA' : ''}`,
          }
        }),
    [tasks]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-slate-500">
          Cronograma de tarefas
          {tasks.length > 1 && !showGantt && (
            <span className="ml-2 font-normal text-slate-400">
              · arraste pela alça <span className="text-slate-500">⠿</span> para reordenar
            </span>
          )}
        </label>
        {tasks.length > 0 && (
          <button
            onClick={() => setShowGantt((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {showGantt ? 'Ver lista' : 'Ver Gantt'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Carregando tarefas...</p>
      ) : showGantt ? (
        <GanttChart items={ganttItems} labelWidth={150} />
      ) : (
        <div className="space-y-2">
          {tasks.map((t, index) => {
            const late = taskNeedsJustificativa(t)
            const arrastando = arrastandoId === t.id
            const alvo = arrastandoSobre === t.id && !arrastando

            return (
              <div
                key={t.id}
                ref={(el) => {
                  linhasRef.current[t.id] = el
                }}
                onDragOver={(e) => {
                  if (!arrastandoId) return
                  e.preventDefault()
                  setArrastandoSobre(t.id)
                }}
                onDragLeave={() => setArrastandoSobre((v) => (v === t.id ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  soltarEm(index)
                }}
                className={`border rounded-lg p-2.5 space-y-2 transition ${
                  arrastando ? 'opacity-40' : ''
                } ${
                  alvo
                    ? 'border-indigo-400 ring-2 ring-indigo-300'
                    : late
                      ? 'border-red-300 bg-red-50/40'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* Alça de arrastar: só ela é arrastável, para não atrapalhar
                      a seleção de texto nos campos ao lado. */}
                  <span
                    draggable
                    onDragStart={(e) => {
                      setArrastandoId(t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', t.id)
                      // Arrasta a linha inteira como imagem, não só a alça.
                      const linha = linhasRef.current[t.id]
                      if (linha) e.dataTransfer.setDragImage(linha, 20, 20)
                    }}
                    onDragEnd={() => {
                      setArrastandoId(null)
                      setArrastandoSobre(null)
                    }}
                    className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none px-0.5"
                    title="Arraste para reordenar"
                  >
                    ⠿
                  </span>
                  {t.codigo && (
                    <span
                      className="shrink-0 text-[10px] font-semibold text-slate-400 tabular-nums"
                      title="Código da tarefa"
                    >
                      {t.codigo}
                    </span>
                  )}
                  <input
                    className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                    value={t.nome}
                    list="task-name-suggestions"
                    onChange={(e) => updateLocal(t.id, { nome: e.target.value })}
                    onBlur={(e) => saveField(t.id, { nome: e.target.value })}
                  />
                  <input
                    className="w-32 border border-slate-300 rounded-md px-2 py-1 text-xs"
                    placeholder="Responsável"
                    list="task-resp-suggestions"
                    value={t.responsavel || ''}
                    onChange={(e) => updateLocal(t.id, { responsavel: e.target.value })}
                    onBlur={(e) => saveField(t.id, { responsavel: e.target.value || null })}
                  />
                  <select
                    className={`text-[11px] font-medium px-2 py-1 rounded-md border ${TASK_STATUS_COLORS[t.status] || ''}`}
                    value={t.status}
                    onChange={(e) => handleStatusChange(t, e.target.value)}
                  >
                    {TASK_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-slate-300 hover:text-red-500 text-sm px-1"
                    title="Excluir tarefa"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                  <label className="flex items-center gap-1">
                    Início
                    <input
                      type="date"
                      disabled={!!t.data_inicio && !ehAdmin}
                      title={
                        !!t.data_inicio && !ehAdmin
                          ? 'Data já definida. Peça ao administrador para alterar.'
                          : undefined
                      }
                      className={`border rounded px-1 py-0.5 ${
                        !!t.data_inicio && !ehAdmin
                          ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                          : 'border-slate-200'
                      }`}
                      value={t.data_inicio || ''}
                      onChange={(e) => saveField(t.id, { data_inicio: e.target.value || null })}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    Prazo
                    <input
                      type="date"
                      disabled={!!t.data_prazo && !ehAdmin}
                      title={
                        !!t.data_prazo && !ehAdmin
                          ? 'Prazo já definido. Peça ao administrador para alterar.'
                          : undefined
                      }
                      className={`border rounded px-1 py-0.5 ${
                        !!t.data_prazo && !ehAdmin
                          ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                          : 'border-slate-200'
                      }`}
                      value={t.data_prazo || ''}
                      onChange={(e) => saveField(t.id, { data_prazo: e.target.value })}
                    />
                  </label>
                  {(t.data_inicio || t.data_prazo) && !ehAdmin && (
                    <span className="text-slate-400" title="Datas definidas só o administrador altera">
                      🔒
                    </span>
                  )}
                  {t.status === 'Concluído' && (
                    <label
                      className={`flex items-center gap-1 rounded px-1 ${
                        confirmandoConclusao === t.id ? 'bg-emerald-50 ring-1 ring-emerald-300' : ''
                      }`}
                    >
                      Concluída em
                      <input
                        type="date"
                        className="border border-slate-200 rounded px-1 py-0.5"
                        value={t.data_conclusao || ''}
                        onChange={(e) => saveField(t.id, { data_conclusao: e.target.value || null })}
                      />
                      {confirmandoConclusao === t.id && (
                        <button
                          onClick={() => setConfirmandoConclusao(null)}
                          className="text-emerald-700 font-medium hover:underline"
                        >
                          ok
                        </button>
                      )}
                    </label>
                  )}
                  {confirmandoConclusao === t.id && (
                    <span className="text-emerald-700">
                      Concluiu em outro dia? Ajuste a data ao lado.
                    </span>
                  )}
                  {late && <span className="text-red-600 font-semibold">⚠ Atrasada</span>}
                </div>

                {late && (
                  <div>
                    <textarea
                      className={`w-full border rounded-md px-2 py-1 text-xs ${
                        t.justificativa ? 'border-slate-300' : 'border-red-400'
                      }`}
                      rows={2}
                      placeholder="Justificativa obrigatória: por que a tarefa não foi concluída no prazo?"
                      value={t.justificativa || ''}
                      onChange={(e) => updateLocal(t.id, { justificativa: e.target.value })}
                      onBlur={(e) => saveField(t.id, { justificativa: e.target.value || null })}
                    />
                    {!t.justificativa && (
                      <p className="text-[10px] text-red-500 mt-0.5">Preencha a justificativa desta tarefa atrasada.</p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setAnexosAbertos((v) => (v === t.id ? null : t.id))}
                  className="text-[10px] font-medium text-slate-400 hover:text-indigo-600"
                >
                  {anexosAbertos === t.id ? '▾' : '▸'} Observações e anexos
                  {t.observacoes && anexosAbertos !== t.id && ' 📝'}
                </button>

                {anexosAbertos === t.id && (
                  <div className="border-t border-slate-200 pt-2">
                    <TaskAttachments
                      taskId={t.id}
                      projectId={projectId}
                      observacoesIniciais={t.observacoes}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {tasks.length === 0 && <p className="text-xs text-slate-400 py-2">Nenhuma tarefa no cronograma ainda.</p>}

          <div className="border border-dashed border-slate-300 rounded-lg p-2.5 space-y-2 bg-slate-50">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                placeholder="Nova tarefa (comum ou atípica)"
                list="task-name-suggestions"
                value={newTask.nome}
                onChange={(e) => setNewTask((f) => ({ ...f, nome: e.target.value }))}
              />
              <input
                className="w-32 border border-slate-300 rounded-md px-2 py-1 text-xs"
                placeholder="Responsável"
                list="task-resp-suggestions"
                value={newTask.responsavel}
                onChange={(e) => setNewTask((f) => ({ ...f, responsavel: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <label className="flex items-center gap-1">
                Início
                <input
                  type="date"
                  className="border border-slate-200 rounded px-1 py-0.5"
                  value={newTask.data_inicio}
                  onChange={(e) => setNewTask((f) => ({ ...f, data_inicio: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-1">
                Prazo
                <input
                  type="date"
                  className="border border-slate-200 rounded px-1 py-0.5"
                  value={newTask.data_prazo}
                  onChange={(e) => setNewTask((f) => ({ ...f, data_prazo: e.target.value }))}
                />
              </label>
              <button
                onClick={handleAdd}
                disabled={adding || !newTask.nome.trim() || !newTask.data_prazo}
                className="ml-auto px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
              >
                {adding ? 'Adicionando...' : '+ Adicionar tarefa'}
              </button>
            </div>
          </div>

          <datalist id="task-name-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="task-resp-suggestions">
            {responsaveis.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  )
}
