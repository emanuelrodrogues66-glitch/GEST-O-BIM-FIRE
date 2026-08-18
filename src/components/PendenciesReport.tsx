import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectPendency } from '../types'
import { MOTIVOS_PENDENCIA, diasDePendencia, gravidadePendencia } from '../types'

type PendencyRow = ProjectPendency & {
  projects: { nome: string; numero: number | null; responsavel: string | null } | null
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function PendenciesReport({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
} = {}) {
  const [rows, setRows] = useState<PendencyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [motivoFiltro, setMotivoFiltro] = useState('')
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_pendencies')
      .select('*, projects(nome, numero, responsavel)')
      .order('data_inicio', { ascending: true })
    if (error) alert(error.message)
    setRows((data as PendencyRow[]) || [])
    setLoading(false)
  }

  async function salvarJustificativa(id: string, texto: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, justificativa: texto } : r)))
    const { error } = await supabase
      .from('project_pendencies')
      .update({ justificativa: texto, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) alert(error.message)
  }

  const motivos = useMemo(() => {
    const set = new Set(rows.map((r) => r.motivo).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [rows])

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (!mostrarEncerradas && r.data_fim) return false
      if (motivoFiltro && r.motivo !== motivoFiltro) return false
      if (busca) {
        const alvo = `${r.projects?.nome || ''} ${r.justificativa} ${r.motivo || ''} ${
          r.projects?.responsavel || ''
        }`.toLowerCase()
        if (!alvo.includes(busca.toLowerCase())) return false
      }
      return true
    })
  }, [rows, busca, motivoFiltro, mostrarEncerradas])

  const abertas = rows.filter((r) => !r.data_fim)
  const criticas = abertas.filter((r) => diasDePendencia(r) >= 30).length
  const previsaoVencida = abertas.filter(
    (r) => r.previsao_retorno && r.previsao_retorno < new Date().toISOString().slice(0, 10)
  ).length
  const mediaDias = abertas.length
    ? Math.round(abertas.reduce((s, r) => s + diasDePendencia(r), 0) / abertas.length)
    : 0

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando pendências...</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pendências abertas" value={abertas.length} accent="text-amber-600" />
        <StatCard label="Paradas há 30+ dias" value={criticas} accent="text-red-600" />
        <StatCard label="Previsão vencida" value={previsaoVencida} accent="text-red-600" />
        <StatCard label="Média de dias parados" value={mediaDias} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar por projeto, motivo ou justificativa..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[200px] max-w-sm"
        />
        <select
          value={motivoFiltro}
          onChange={(e) => setMotivoFiltro(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">Todos os motivos</option>
          {(motivos.length ? motivos : [...MOTIVOS_PENDENCIA]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={mostrarEncerradas}
            onChange={(e) => setMostrarEncerradas(e.target.checked)}
          />
          Mostrar encerradas
        </label>
        <span className="text-xs text-slate-400 ml-auto">{filtradas.length} pendência(s)</span>
      </div>

      {filtradas.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
          {mostrarEncerradas
            ? 'Nenhuma pendência encontrada com os filtros atuais.'
            : 'Nenhum projeto parado no momento. 🎉'}
        </p>
      )}

      <div className="space-y-2">
        {filtradas.map((r) => {
          const dias = diasDePendencia(r)
          const g = gravidadePendencia(dias)
          const emAberto = !r.data_fim
          const vencida =
            emAberto && r.previsao_retorno && r.previsao_retorno < new Date().toISOString().slice(0, 10)

          return (
            <div
              key={r.id}
              className={`bg-white border rounded-xl p-3 ${
                emAberto && dias >= 30 ? 'border-red-300' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button
                  onClick={() => onProjectClick?.(r.project_id)}
                  disabled={!onProjectClick}
                  className={`text-sm font-semibold text-slate-800 text-left ${
                    onProjectClick ? 'hover:text-indigo-700 hover:underline cursor-pointer' : ''
                  }`}
                  title={onProjectClick ? 'Abrir o cartão do projeto' : undefined}
                >
                  {r.projects?.numero ? `${r.projects.numero} · ` : ''}
                  {r.projects?.nome || 'Projeto'}
                </button>

                {r.projects?.responsavel && (
                  <span className="text-xs text-slate-500">· {r.projects.responsavel}</span>
                )}

                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${g.badge}`}>
                  {dias} dia{dias !== 1 ? 's' : ''} {emAberto ? 'parado' : 'parado (encerrada)'}
                </span>

                {vencida && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-300">
                    previsão vencida
                  </span>
                )}

                <span className="text-[10px] text-slate-400 ml-auto">
                  desde {formatDate(r.data_inicio)}
                  {r.data_fim ? ` · até ${formatDate(r.data_fim)}` : ''}
                  {r.previsao_retorno ? ` · previsão ${formatDate(r.previsao_retorno)}` : ''}
                </span>
              </div>

              {r.motivo && (
                <p className="text-xs text-slate-600 mb-1.5">
                  <span className="font-medium text-slate-700">Motivo:</span> {r.motivo}
                </p>
              )}

              <textarea
                className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                rows={2}
                placeholder="Justificativa da pendência"
                defaultValue={r.justificativa}
                onBlur={(e) => salvarJustificativa(r.id, e.target.value)}
              />

              {r.observacao_encerramento && (
                <p className="text-[11px] text-emerald-700 mt-1.5">
                  <span className="font-medium">Resolvido:</span> {r.observacao_encerramento}
                </p>
              )}
            </div>
          )
        })}
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
