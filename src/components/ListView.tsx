import { useEffect, useMemo, useRef, useState } from 'react'
import { changeProjectStatus } from '../lib/statusSync'
import { nomeDoUsuario, type DadosPendencia } from '../lib/pendencias'
import { alertarCorrecao, comemorarConclusao } from '../lib/celebracao'
import PendencyDialog from './PendencyDialog'
import type { Project } from '../types'
import { prazoColor, STATUS_COLUNAS, statusColor, tipoColor } from '../types'

type SortKey = 'numero' | 'nome' | 'responsavel' | 'status' | 'pts' | 'm2' | 'data_prazo'

function formatDate(d: string | null) {
  if (!d) return '—'
  const parts = d.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-06-14" -> "jun/26" */
function mesCurto(data: string | null): string {
  if (!data) return '—'
  const [ano, mes] = data.split('-')
  return `${MESES_CURTO[Number(mes) - 1]}/${ano.slice(2)}`
}

export default function ListView({
  projects,
  onRowClick,
  onBulkUpdated,
  mostrarMes,
}: {
  projects: Project[]
  onRowClick: (p: Project) => void
  onBulkUpdated?: () => void
  /** Com projetos de vários meses na lista, mostra de qual mês cada um é. */
  mostrarMes?: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>('numero')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>(STATUS_COLUNAS[0])
  const [applying, setApplying] = useState(false)
  // Cada projeto que for para Pendente precisa da sua propria justificativa,
  // entao a aplicacao em massa pausa e pergunta um de cada vez.
  const [perguntandoPara, setPerguntandoPara] = useState<Project | null>(null)
  const loteRef = useRef<{
    restantes: string[]
    justificativas: Record<string, DadosPendencia>
    bloqueados: string[]
    concluidos: number
    correcoes: number
    primeiraCorrecao: string | null
    responsavel: string | null
  } | null>(null)

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
    loteRef.current = {
      restantes: Array.from(selected),
      justificativas: {},
      bloqueados: [],
      concluidos: 0,
      correcoes: 0,
      primeiraCorrecao: null,
      responsavel: bulkStatus === 'Pendente' ? await nomeDoUsuario() : null,
    }
    await processarLote()
  }

  /**
   * Percorre os projetos selecionados. Ao encontrar um que exige justificativa
   * de pendência, para e abre o diálogo para aquele projeto específico —
   * cada um recebe o seu próprio motivo.
   */
  async function processarLote() {
    const lote = loteRef.current
    if (!lote) return

    try {
      while (lote.restantes.length > 0) {
        const id = lote.restantes[0]
        const projeto = projects.find((p) => p.id === id)

        const result = await changeProjectStatus(id, bulkStatus, {
          statusAnterior: projeto?.status ?? null,
          pendencia: lote.justificativas[id]
            ? { ...lote.justificativas[id], responsavel: lote.responsavel }
            : undefined,
        })

        if (!result.ok && result.reason === 'justificativa_pendencia') {
          // Mantém este projeto na fila e pergunta o motivo dele.
          setPerguntandoPara(projeto || null)
          return
        }

        if (!result.ok) lote.bloqueados.push(projeto?.nome || id)
        else if (bulkStatus === 'Concluído' && projeto?.status !== 'Concluído') lote.concluidos += 1
        else if (bulkStatus === 'CORREÇÃO' && projeto?.status !== 'CORREÇÃO') {
          lote.correcoes += 1
          if (!lote.primeiraCorrecao) lote.primeiraCorrecao = projeto?.nome || null
        }
        lote.restantes.shift()
      }

      finalizarLote()
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar os projetos selecionados.')
      encerrarLote()
    }
  }

  function finalizarLote() {
    const bloqueados = loteRef.current?.bloqueados || []
    const concluidos = loteRef.current?.concluidos || 0
    const correcoes = loteRef.current?.correcoes || 0
    const primeiraCorrecao = loteRef.current?.primeiraCorrecao || undefined
    encerrarLote()

    if (concluidos > 0) comemorarConclusao(concluidos)
    if (correcoes > 0) alertarCorrecao(primeiraCorrecao, correcoes)
    setSelected(new Set())
    onBulkUpdated?.()

    if (bloqueados.length > 0) {
      alert(
        `${bloqueados.length} projeto(s) não foram concluídos porque faltam dados do cliente ou anexos obrigatórios: ${bloqueados.join(
          ', '
        )}. Abra cada um e verifique a aba "Dados do cliente".`
      )
    }
  }

  function encerrarLote() {
    loteRef.current = null
    setPerguntandoPara(null)
    setApplying(false)
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
      {perguntandoPara && (
        <PendencyDialog
          titulo={`${perguntandoPara.nome}${
            loteRef.current ? `  ·  ${loteRef.current.restantes.length} de ${selected.size} restante(s)` : ''
          }`}
          onCancelar={encerrarLote}
          onConfirmar={(dados) => {
            const lote = loteRef.current
            if (!lote) return
            lote.justificativas[perguntandoPara.id] = dados
            setPerguntandoPara(null)
            processarLote()
          }}
        />
      )}

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
                {mostrarMes && (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Mês
                  </th>
                )}
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
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${statusColor(p.status).badge}`}
                    >
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
                  {mostrarMes && (
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {mesCurto(p.data_inicio)}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {p.tipo && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${tipoColor(p.tipo)}`}>{p.tipo}</span>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={mostrarMes ? 10 : 9} className="text-center text-slate-400 py-8 text-sm">
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
