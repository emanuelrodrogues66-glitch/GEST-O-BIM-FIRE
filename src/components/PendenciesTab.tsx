import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectPendency } from '../types'
import { MOTIVOS_PENDENCIA, diasDePendencia, gravidadePendencia } from '../types'

function formatDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function PendenciesTab({ projectId }: { projectId: string }) {
  const [lista, setLista] = useState<ProjectPendency[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('project_pendencies')
      .select('*')
      .eq('project_id', projectId)
      .order('data_inicio', { ascending: false })
    setLista((data as ProjectPendency[]) || [])
    setLoading(false)
  }

  async function atualizar(id: string, patch: Partial<ProjectPendency>) {
    setLista((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    const { error } = await supabase
      .from('project_pendencies')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setErro(error.message)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este registro de pendência do histórico?')) return
    setLista((prev) => prev.filter((p) => p.id !== id))
    await supabase.from('project_pendencies').delete().eq('id', id)
  }

  if (loading) return <p className="text-xs text-slate-400">Carregando pendências...</p>

  const aberta = lista.find((p) => !p.data_fim)
  const totalDiasParado = lista.reduce((s, p) => s + diasDePendencia(p), 0)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Toda vez que o projeto passa para <b className="text-slate-700">Pendente</b>, o motivo é registrado aqui.
        O sistema conta os dias e encerra o período quando o projeto volta a andar.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-slate-200 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Situação</p>
          <p className={`text-sm font-semibold mt-0.5 ${aberta ? 'text-amber-600' : 'text-emerald-600'}`}>
            {aberta ? 'Pendente agora' : 'Sem pendência'}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Períodos parados</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{lista.length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Dias parados no total</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{totalDiasParado}</p>
        </div>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {lista.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-300 rounded-lg">
          Este projeto nunca ficou pendente.
        </p>
      )}

      <div className="space-y-2">
        {lista.map((p) => {
          const dias = diasDePendencia(p)
          const g = gravidadePendencia(dias)
          const emAberto = !p.data_fim

          return (
            <div
              key={p.id}
              className={`border rounded-lg p-3 space-y-2 ${
                emAberto ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">
                  {formatDate(p.data_inicio)} → {p.data_fim ? formatDate(p.data_fim) : 'hoje'}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${g.badge}`}>
                  {dias} dia{dias !== 1 ? 's' : ''}
                </span>
                {emAberto && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
                    em aberto
                  </span>
                )}
                {p.status_anterior && (
                  <span className="text-[10px] text-slate-400">veio de {p.status_anterior}</span>
                )}
                <button
                  onClick={() => excluir(p.id)}
                  className="ml-auto text-slate-300 hover:text-red-500 px-1"
                  title="Excluir registro"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="text-[11px] border border-slate-300 rounded px-2 py-1 bg-white"
                  value={p.motivo || ''}
                  onChange={(e) => atualizar(p.id, { motivo: e.target.value || null })}
                >
                  <option value="">Sem motivo definido</option>
                  {MOTIVOS_PENDENCIA.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-slate-500">
                  Previsão de retorno
                  <input
                    type="date"
                    className="border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                    value={p.previsao_retorno || ''}
                    onChange={(e) => atualizar(p.id, { previsao_retorno: e.target.value || null })}
                  />
                </label>
                {emAberto && p.previsao_retorno && p.previsao_retorno < new Date().toISOString().slice(0, 10) && (
                  <span className="text-[10px] font-semibold text-red-600">previsão vencida</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Justificativa</label>
                <textarea
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px]"
                  rows={2}
                  value={p.justificativa}
                  onChange={(e) =>
                    setLista((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, justificativa: e.target.value } : x))
                    )
                  }
                  onBlur={(e) => atualizar(p.id, { justificativa: e.target.value })}
                />
              </div>

              {!emAberto && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                    Como foi resolvido <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px]"
                    rows={2}
                    placeholder="O que destravou o projeto?"
                    value={p.observacao_encerramento || ''}
                    onChange={(e) =>
                      setLista((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, observacao_encerramento: e.target.value } : x
                        )
                      )
                    }
                    onBlur={(e) => atualizar(p.id, { observacao_encerramento: e.target.value || null })}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
