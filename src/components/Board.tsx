import { useState } from 'react'
import type { Project } from '../types'
import { STATUS_COLUNAS, normalizeStatus } from '../types'
import ProjectCard from './ProjectCard'

const COLUNA_COLOR: Record<string, string> = {
  Pendente: 'border-t-slate-400',
  Tramitando: 'border-t-amber-400',
  'CORREÇÃO': 'border-t-orange-500',
  Executando: 'border-t-indigo-500',
  Zstandby: 'border-t-purple-400',
  'Concluído': 'border-t-emerald-500',
}

export default function Board({
  projects,
  onCardClick,
  onDropCard,
}: {
  projects: Project[]
  onCardClick: (p: Project) => void
  onDropCard?: (projectId: string, status: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_COLUNAS.map((col) => {
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
              className={`bg-slate-100 rounded-xl border-t-4 ${COLUNA_COLOR[col]} p-3 transition ${
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
  )
}
