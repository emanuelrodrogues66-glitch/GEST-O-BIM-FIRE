import { useEffect, useMemo, useState } from 'react'
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
  responsavelDoProjeto,
}: {
  projectId: string
  responsaveis: string[]
  /** Projetista dos Dados gerais: entra pré-selecionado ao assumir. */
  responsavelDoProjeto?: string | null
}) {
  const [activities, setActivities] = useState<ProjectActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ responsavel: '', data: todayStr(), descricao: '' })

  /** Responsável do projeto primeiro; depois os demais nomes conhecidos. */
  const opcoesResponsavel = useMemo(() => {
    const lista = responsavelDoProjeto ? [responsavelDoProjeto] : []
    for (const r of responsaveis) {
      if (!lista.some((x) => x.toLowerCase() === r.toLowerCase())) lista.push(r)
    }
    return lista
  }, [responsaveis, responsavelDoProjeto])

  // Edição de um registro já gravado do histórico.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState({ responsavel: '', data: '', descricao: '' })

  useEffect(() => {
    load()
    prefillResponsavel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, responsavelDoProjeto])

  /**
   * O login é compartilhado, então o usuário da sessão não diz quem está
   * trabalhando. O responsável cadastrado no projeto é o palpite certo,
   * e a lista ao lado permite trocar quando outra pessoa assumir.
   */
  async function prefillResponsavel() {
    if (responsavelDoProjeto) {
      setForm((f) => ({ ...f, responsavel: responsavelDoProjeto }))
      return
    }
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

  /** Salva a edição de um registro já existente do histórico. */
  async function salvarEdicao(id: string, patch: Partial<ProjectActivity>) {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await supabase.from('project_activities').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      load()
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
            <select
              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
              value={opcoesResponsavel.includes(form.responsavel) ? form.responsavel : '__outro'}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => ({ ...f, responsavel: v === '__outro' ? '' : v }))
              }}
            >
              <option value="" disabled>
                Quem assumiu?
              </option>
              {opcoesResponsavel.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {r === responsavelDoProjeto ? ' (responsável do projeto)' : ''}
                </option>
              ))}
              <option value="__outro">Outro...</option>
            </select>

            {!opcoesResponsavel.includes(form.responsavel) && (
              <input
                className="flex-1 min-w-[120px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                placeholder="Nome de quem assumiu"
                value={form.responsavel}
                onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
                autoFocus
              />
            )}
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
          {activities.map((a) =>
            editandoId === a.id ? (
              <div key={a.id} className="border border-indigo-300 bg-indigo-50/40 rounded-lg p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                    list="activity-resp-suggestions"
                    value={rascunho.responsavel}
                    onChange={(e) => setRascunho((r) => ({ ...r, responsavel: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                    value={rascunho.data}
                    onChange={(e) => setRascunho((r) => ({ ...r, data: e.target.value }))}
                  />
                </div>
                <textarea
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                  rows={2}
                  placeholder="O que foi feito no projeto neste dia?"
                  value={rascunho.descricao}
                  onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditandoId(null)}
                    className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await salvarEdicao(a.id, {
                        responsavel: rascunho.responsavel.trim() || a.responsavel,
                        data: rascunho.data || a.data,
                        descricao: rascunho.descricao.trim() || null,
                      })
                      setEditandoId(null)
                    }}
                    className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={a.id}
                className="flex items-start gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <span className="text-slate-400 shrink-0 w-16">{formatDate(a.data)}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{a.responsavel}</span>
                  {a.descricao ? (
                    <p className="text-slate-500 mt-0.5 whitespace-pre-wrap">{a.descricao}</p>
                  ) : (
                    <p className="text-slate-300 mt-0.5 italic">Sem descrição</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditandoId(a.id)
                    setRascunho({
                      responsavel: a.responsavel,
                      data: a.data,
                      descricao: a.descricao || '',
                    })
                  }}
                  className="text-slate-300 hover:text-indigo-600 shrink-0 px-1"
                  title="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-slate-300 hover:text-red-500 shrink-0 px-1"
                  title="Excluir"
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
