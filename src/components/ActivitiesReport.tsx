import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectActivity } from '../types'

type ActivityRow = ProjectActivity & { projects: { nome: string; numero: number | null } | null }

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function ActivitiesReport() {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [colaborador, setColaborador] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_activities')
      .select('*, projects(nome, numero)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) alert(error.message)
    setRows((data as ActivityRow[]) || [])
    setLoading(false)
  }

  const colaboradores = useMemo(() => {
    const set = new Set(rows.map((r) => r.responsavel).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (colaborador && r.responsavel !== colaborador) return false
      if (busca) {
        const alvo = `${r.projects?.nome || ''} ${r.responsavel} ${r.descricao || ''}`.toLowerCase()
        if (!alvo.includes(busca.toLowerCase())) return false
      }
      return true
    })
  }, [rows, busca, colaborador])

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando atividades...</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Registros de atividade" value={rows.length} />
        <StatCard label="Colaboradores ativos" value={colaboradores.length} />
        <StatCard
          label="Hoje"
          value={rows.filter((r) => r.data === new Date().toISOString().slice(0, 10)).length}
          accent="text-indigo-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Buscar por projeto, colaborador ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[200px] max-w-sm"
        />
        <select
          value={colaborador}
          onChange={(e) => setColaborador(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">Todos os colaboradores</option>
          {colaboradores.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nenhuma atividade registrada ainda.
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
        {filtered.map((a) => (
          <div key={a.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
            <span className="text-xs text-slate-400 w-16 shrink-0 pt-0.5">{formatDate(a.data)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800">
                <span className="font-medium">{a.responsavel}</span>{' '}
                <span className="text-slate-400">assumiu</span>{' '}
                <span className="font-medium text-indigo-700">
                  {a.projects?.numero ? `${a.projects.numero} · ` : ''}
                  {a.projects?.nome || 'Projeto'}
                </span>
              </p>
              {a.descricao && <p className="text-xs text-slate-500 mt-0.5">{a.descricao}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
