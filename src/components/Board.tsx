import { useState } from 'react'
import type { Project } from '../types'
import { STATUS_COLUNAS, normalizeStatus, statusColor } from '../types'
import ProjectCard from './ProjectCard'

export default function Board({
  projects,
  onCardClick,
  onDropCard,
  colunas,
}: {
  projects: Project[]
  onCardClick: (p: Project) => void
  onDropCard?: (projectId: string, status: string) => void
  colunas?: readonly string[]
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const colunasVisiveis = colunas && colunas.length > 0 ? colunas : STATUS_COLUNAS

  // Quando o quadro mostra só algumas colunas, avisa se sobrou projeto de fora
  // para que nada desapareça sem o usuário perceber.
  const foraDasColunas = projects.filter((p) => !colunasVisiveis.includes(normalizeStatus(p.status)))

  return (
    <>
      {foraDasColunas.length > 0 && (
        <div className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {foraDasColunas.length} projeto{foraDasColunas.length !== 1 ? 's' : ''} desta categoria ainda não
          {foraDasColunas.length !== 1 ? ' estão' : ' está'} com status "Concluído" e por isso não aparece
          {foraDasColunas.length !== 1 ? 'm' : ''} aqui. Use a visão <b>Lista</b> para vê-
          {foraDasColunas.length !== 1 ? 'los' : 'lo'}: {foraDasColunas.map((p) => p.nome).join(', ')}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
      {colunasVisiveis.map((col) => {
        const items = projects.filter((p) => normalizeStatus(p.status) === col)
        return (
          <div key={col} className="flex-shrink-0 w-72">
            <div
              onDragOver={(e) => {
                if (!onDropCard) return
                e.preventDefault()
                setDragOverCol(col)
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
              onDrop={(e) => {
                if (!onDropCard) return
                e.preventDefault()
                const projectId = e.dataTransfer.getData('text/plain')
                setDragOverCol(null)
                setDraggingId(null)
                if (projectId) onDropCard(projectId, col)
              }}
              className={`bg-slate-100 rounded-xl border-t-4 ${statusColor(col).borderTop} p-3 transition ${
                dragOverCol === col ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{col}</h3>
                <span className="text-xs bg-white text-slate-500 rounded-full px-2 py-0.5 font-medium">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 min-h-[40px] max-h-[70vh] overflow-y-auto pr-0.5">
                {items.map((p) => (
                  <div
                    key={p.id}
                    draggable={!!onDropCard}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(p.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverCol(null)
                    }}
                    className={`${onDropCard ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      draggingId === p.id ? 'opacity-40' : ''
                    }`}
                  >
                    <ProjectCard project={p} onClick={() => onCardClick(p)} />
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">
                    {dragOverCol === col ? 'Solte aqui' : 'Nenhum projeto'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </>
  )
}
