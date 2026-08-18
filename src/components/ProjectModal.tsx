import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncDailyProgressForStatus } from '../lib/statusSync'
import type { DailyProgress, Project, ProjectClient } from '../types'
import { STATUS_COLUNAS, isClientDataComplete, suggestedPoints } from '../types'
import type { MonthRef } from '../lib/month'
import { daysInMonth, monthLabel, monthRange } from '../lib/month'
import TaskSchedule from './TaskSchedule'
import ActivityHistory from './ActivityHistory'
import ClientDataForm from './ClientDataForm'
import FileUpload from './FileUpload'
import PlanningForm from './PlanningForm'

const LETRA_OPTIONS = [
  { value: '', label: '—' },
  { value: 'S', label: 'S · Início' },
  { value: 'P', label: 'P · Pendente' },
  { value: 'E', label: 'E · Executando' },
  { value: 'T', label: 'T · Tramitando' },
  { value: 'C', label: 'C · Correção' },
  { value: 'D', label: 'D · Concluído' },
  { value: 'Z', label: 'Z · Zstandby' },
]

const LETRA_COLORS: Record<string, string> = {
  S: 'bg-emerald-700 text-white',
  P: 'bg-sky-200 text-sky-800',
  E: 'bg-yellow-300 text-yellow-900',
  T: 'bg-pink-200 text-pink-800',
  C: 'bg-red-400 text-white',
  D: 'bg-emerald-300 text-emerald-900',
  Z: 'bg-slate-300 text-slate-700',
  '': 'bg-white text-slate-300',
}

type Props = {
  project: Project | null
  isNew: boolean
  responsaveis: string[]
  month: MonthRef
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export default function ProjectModal({ project, isNew, responsaveis, month, onClose, onSaved, onDeleted }: Props) {
  const emptyProject: Partial<Project> = {
    nome: '',
    responsavel: '',
    status: 'Pendente',
    tipo: 'PRO',
    pts: 5,
    m2: null,
    categoria: 'PROJETOS EM ANDAMENTO',
    prazo_categoria: null,
    data_prazo: null,
    data_inicio: monthRange(month).start,
    observacoes: '',
  }

  const [form, setForm] = useState<Partial<Project>>(project ?? emptyProject)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'geral' | 'dados' | 'plano'>('geral')
  const [clientData, setClientData] = useState<Partial<ProjectClient>>({})
  const [showMissingClientData, setShowMissingClientData] = useState(false)

  useEffect(() => {
    setForm(project ?? emptyProject)
    setActiveTab('geral')
    setShowMissingClientData(false)
    if (project && !isNew) {
      loadProgress(project.id)
      loadClientData(project.id)
    } else {
      setProgress({})
      setClientData({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isNew, month])

  async function loadProgress(projectId: string) {
    const { start, end } = monthRange(month)
    const { data } = await supabase
      .from('daily_progress')
      .select('*')
      .eq('project_id', projectId)
      .gte('data', start)
      .lte('data', end)
    const map: Record<number, string> = {}
    ;(data as DailyProgress[] | null)?.forEach((d) => {
      const day = Number(d.data.split('-')[2])
      map[day] = d.letra
    })
    setProgress(map)
  }

  async function loadClientData(projectId: string) {
    const { data } = await supabase.from('project_clients').select('*').eq('project_id', projectId).maybeSingle()
    setClientData((data as Partial<ProjectClient>) || {})
  }

  async function handleDayChange(day: number, letra: string) {
    if (!project) return
    const dateStr = `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setProgress((p) => ({ ...p, [day]: letra }))
    if (letra === '') {
      await supabase.from('daily_progress').delete().eq('project_id', project.id).eq('data', dateStr)
    } else {
      await supabase.from('daily_progress').upsert(
        { project_id: project.id, data: dateStr, letra },
        { onConflict: 'project_id,data' }
      )
    }
  }

  async function handleSave() {
    // Bloqueia a conclusão do projeto se os dados do cliente não estiverem completos.
    if (form.status === 'Concluído' && !isClientDataComplete(clientData)) {
      setError('Preencha todos os campos da aba "Dados do cliente" antes de concluir o projeto.')
      setShowMissingClientData(true)
      setActiveTab('dados')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        nome: form.nome,
        responsavel: form.responsavel || null,
        status: form.status,
        tipo: form.tipo || null,
        pts: form.pts === undefined || form.pts === null || (form.pts as any) === '' ? null : Number(form.pts),
        m2: form.m2 === undefined || form.m2 === null || (form.m2 as any) === '' ? null : Number(form.m2),
        categoria: form.categoria,
        prazo_categoria: form.prazo_categoria || null,
        data_prazo: form.data_prazo || null,
        data_inicio: form.data_inicio || monthRange(month).start,
        observacoes: form.observacoes || null,
      }

      let projectId = project?.id

      if (isNew) {
        const { data, error } = await supabase.from('projects').insert(payload).select().single()
        if (error) throw error
        projectId = (data as Project).id
      } else if (project) {
        const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
        if (error) throw error
        if (form.status && form.status !== project.status) {
          await syncDailyProgressForStatus(project.id, form.status)
        }
      }

      // Salva os dados do cliente (se algum campo foi preenchido, ou se já existia registro).
      if (projectId) {
        const hasAnyClientField = Object.values(clientData).some((v) => (v || '').toString().trim())
        if (hasAnyClientField) {
          const { error: clientError } = await supabase
            .from('project_clients')
            .upsert({ ...clientData, project_id: projectId }, { onConflict: 'project_id' })
          if (clientError) throw clientError
        }
      }

      onSaved()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!project) return
    if (!confirm(`Excluir "${project.nome}"? Essa ação não pode ser desfeita.`)) return
    setSaving(true)
    await supabase.from('projects').delete().eq('id', project.id)
    setSaving(false)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-slate-800">
            {isNew ? 'Novo projeto' : 'Editar projeto'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            ×
          </button>
        </div>

        {!isNew && project && (
          <div className="sticky top-[65px] bg-white border-b border-slate-200 px-6 flex gap-1 z-10">
            {(
              [
                ['geral', 'Geral'],
                ['dados', 'Dados do cliente'],
                ['plano', 'Planejamento'],
              ] as ['geral' | 'dados' | 'plano', string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-medium px-3 py-2 border-b-2 -mb-px transition ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 space-y-4">
          {activeTab === 'plano' && !isNew && project ? (
            <PlanningForm projectId={project.id} />
          ) : activeTab === 'dados' && !isNew && project ? (
            <>
              <ClientDataForm
                value={clientData}
                onChange={(patch) => setClientData((c) => ({ ...c, ...patch }))}
                showMissing={showMissingClientData}
              />
              <FileUpload projectId={project.id} folderName={clientData.nome_pasta} />
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nome do projeto</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.nome || ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Responsável</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    list="responsaveis-list"
                    value={form.responsavel || ''}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  />
                  <datalist id="responsaveis-list">
                    {responsaveis.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.status || 'Pendente'}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUS_COLUNAS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.tipo || ''}
                    onChange={(e) => {
                      const tipo = e.target.value
                      const suggested = suggestedPoints(tipo)
                      setForm((f) => ({ ...f, tipo, pts: suggested != null ? suggested : f.pts }))
                    }}
                  >
                    {['PRO', 'MEM', 'TCAC', 'HAB', 'FUNC', 'Vistoria'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pontos</label>
                  <input
                    type="number"
                    step="0.5"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.pts ?? ''}
                    onChange={(e) => setForm({ ...form, pts: e.target.value as any })}
                  />
                  {suggestedPoints(form.tipo) != null && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Sugestão automática para {form.tipo}: {suggestedPoints(form.tipo)} pts
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Área (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.m2 ?? ''}
                    onChange={(e) => setForm({ ...form, m2: e.target.value as any })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Data de início</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.data_inicio || ''}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Define em qual mês o projeto aparece nos filtros.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Categoria do prazo</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.prazo_categoria || ''}
                    onChange={(e) => setForm({ ...form, prazo_categoria: e.target.value || null })}
                  >
                    <option value="">—</option>
                    <option value="ATRASADO">ATRASADO</option>
                    <option value="ESSA SEMANA">ESSA SEMANA</option>
                    <option value="NO PRAZO">NO PRAZO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Data prazo</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.data_prazo || ''}
                    onChange={(e) => setForm({ ...form, data_prazo: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Observações</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2}
                  value={form.observacoes || ''}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>

              {!isNew && project && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">
                    Progresso diário · {monthLabel(month)}
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: daysInMonth(month) }, (_, i) => i + 1).map((day) => {
                      const letra = progress[day] || ''
                      return (
                        <select
                          key={day}
                          value={letra}
                          onChange={(e) => handleDayChange(day, e.target.value)}
                          className={`text-[10px] text-center rounded-md py-1 border border-slate-200 cursor-pointer ${LETRA_COLORS[letra] || LETRA_COLORS['']}`}
                          title={`Dia ${day}`}
                        >
                          {LETRA_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {day} {opt.value && `· ${opt.value}`}
                            </option>
                          ))}
                        </select>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-500">
                    {LETRA_OPTIONS.filter((o) => o.value).map((o) => (
                      <span key={o.value} className={`px-1.5 py-0.5 rounded ${LETRA_COLORS[o.value]}`}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isNew && project && (
                <div className="border-t border-slate-100 pt-4">
                  <TaskSchedule projectId={project.id} responsaveis={responsaveis} />
                </div>
              )}

              {!isNew && project && (
                <div className="border-t border-slate-100 pt-4">
                  <ActivityHistory projectId={project.id} responsaveis={responsaveis} />
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between rounded-b-2xl">
          {!isNew ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Excluir projeto
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.nome}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
