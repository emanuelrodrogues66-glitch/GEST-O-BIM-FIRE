import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectActivity } from '../types'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function ActivityHistory({
  projectId,
  responsaveis,
}: {
  projectId: string
  responsaveis: string[]
}) {
  const [activities, setActivities] = useState<ProjectActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ responsavel: '', data: todayStr(), descricao: '' })

  useEffect(() => {
    load()
    prefillResponsavel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function prefillResponsavel() {
    const { data } = await supabase.auth.getSession()
    const meta = data.session?.user.user_metadata as any
    const nome = meta?.nome || data.session?.user.email?.split('@')[0] || ''
    setForm((f) => ({ ...f, responsavel: nome }))
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('project_activities')
      .select('*')
      .eq('project_id', projectId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    setActivities((data as ProjectActivity[]) || [])
    setLoading(false)
  }

  async function handleAssumir() {
    if (!form.responsavel.trim()) return
    setSaving(true)
    try {
      const payload = {
        project_id: projectId,
        responsavel: form.responsavel.trim(),
        data: form.data,
        descricao: form.descricao.trim() || null,
      }
      const { data, error } = await supabase.from('project_activities').insert(payload).select().single()
      if (error) throw error
      setActivities((prev) => [data as ProjectActivity, ...prev])
      setForm((f) => ({ ...f, descricao: '' }))
      setShowForm(false)
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar atividade')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este registro do histórico?')) return
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('project_activities').delete().eq('id', id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-slate-500">Histórico de atividades do projeto</label>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1 rounded-md"
          >
            + Assumir projeto no dia
          </button>
        )}
      </div>

      {showForm && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs"
              placeholder="Responsável"
              list="activity-resp-suggestions"
              value={form.responsavel}
              onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
            />
            <input
              type="date"
              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
            />
          </div>
          <textarea
            className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
            rows={2}
            placeholder="O que foi feito no projeto neste dia?"
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssumir}
              disabled={saving || !form.responsavel.trim()}
              className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
          <datalist id="activity-resp-suggestions">
            {responsaveis.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Carregando histórico...</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {activities.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <span className="text-slate-400 shrink-0 w-16">{formatDate(a.data)}</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-700">{a.responsavel}</span>
                {a.descricao && <p className="text-slate-500 mt-0.5">{a.descricao}</p>}
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                className="text-slate-300 hover:text-red-500 shrink-0 px-1"
                title="Excluir"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
