import { useEffect, useMemo, useState } from 'react'
import { changeProjectStatus } from '../lib/statusSync'
import type { Project } from '../types'
import { prazoColor, STATUS_COLUNAS, tipoColor } from '../types'

type SortKey = 'numero' | 'nome' | 'responsavel' | 'status' | 'pts' | 'm2' | 'data_prazo'

function formatDate(d: string | null) {
  if (!d) return '—'
  const parts = d.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export default function ListView({
  projects,
  onRowClick,
  onBulkUpdated,
}: {
  projects: Project[]
  onRowClick: (p: Project) => void
  onBulkUpdated?: () => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('numero')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>(STATUS_COLUNAS[0])
  const [applying, setApplying] = useState(false)

  const sorted = useMemo(() => {
    const arr = [...projects]
    arr.sort((a, b) => {
      let av: any = a[sortKey]
      let bv: any = b[sortKey]
      if (av == null) av = sortDir === 1 ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 1 ? Infinity : -Infinity
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir
      return (av - bv) * sortDir
    })
    return arr
  }, [projects, sortKey, sortDir])

  // Se a lista de projetos mudar (troca de filtro/categoria/mês), descarta seleções
  // que não existem mais na visão atual.
  useEffect(() => {
    setSelected((prev) => {
      const visibleIds = new Set(projects.map((p) => p.id))
      const next = new Set<string>()
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id)
      })
      return next
    })
  }, [projects])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  function toggleOne(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === sorted.length) return new Set()
      return new Set(sorted.map((p) => p.id))
    })
  }

  async function applyBulkStatus() {
    if (selected.size === 0) return
    setApplying(true)
    try {
      const ids = Array.from(selected)
      const bloqueados: string[] = []
      for (const id of ids) {
        const projeto = projects.find((p) => p.id === id)
        const result = await changeProjectStatus(id, bulkStatus)
        if (!result.ok) {
          bloqueados.push(projeto?.nome || id)
        }
      }
      setSelected(new Set())
      onBulkUpdated?.()
      if (bloqueados.length > 0) {
        alert(
          `${bloqueados.length} projeto(s) não foram concluídos porque faltam dados do cliente: ${bloqueados.join(
            ', '
          )}. Abra cada um e preencha a aba "Dados do cliente".`
        )
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar os projetos selecionados.')
    } finally {
      setApplying(false)
    }
  }

  const columns: { key: SortKey; label: string; align?: string }[] = [
    { key: 'numero', label: 'Nº' },
    { key: 'nome', label: 'Projeto' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'status', label: 'Status' },
    { key: 'pts', label: 'Pts', align: 'text-right' },
    { key: 'm2', label: 'm²', align: 'text-right' },
    { key: 'data_prazo', label: 'Prazo' },
  ]

  const allSelected = sorted.length > 0 && selected.size === sorted.length

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
          <span className="text-indigo-700 font-medium">
            {selected.size} projeto{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">Alterar status para</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1 bg-white"
          >
            {STATUS_COLUNAS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={applying}
            className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
          >
            {applying ? 'Aplicando...' : 'Aplicar'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="cursor-pointer"
                    title="Selecionar todos"
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-indigo-600 ${col.align || ''}`}
                  >
                    {col.label} {sortKey === col.key && (sortDir === 1 ? '▲' : '▼')}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tipo
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p)}
                  className={`border-b border-slate-100 hover:bg-indigo-50 cursor-pointer transition ${
                    selected.has(p.id) ? 'bg-indigo-50/60' : ''
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => toggleOne(p.id, e)}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}} className="cursor-pointer" />
                  </td>
                  <td className="px-3 py-2 text-slate-400">{p.numero ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.nome}</td>
                  <td className="px-3 py-2 text-slate-600">{p.responsavel || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{p.pts ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {p.m2 != null ? p.m2.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {p.prazo_categoria ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${prazoColor(p.prazo_categoria)}`}>
                        {p.prazo_categoria}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">{formatDate(p.data_prazo)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {p.tipo && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${tipoColor(p.tipo)}`}>{p.tipo}</span>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-400 py-8 text-sm">
                    Nenhum projeto encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
