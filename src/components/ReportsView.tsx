import { useState } from 'react'
import TasksReport from './TasksReport'
import PendenciesReport from './PendenciesReport'

type Aba = 'tarefas' | 'pendencias'

/** A visão Relatório reúne os acompanhamentos de atraso e de projeto parado. */
export default function ReportsView({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
} = {}) {
  const [aba, setAba] = useState<Aba>('tarefas')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {(
          [
            ['tarefas', 'Tarefas atrasadas'],
            ['pendencias', 'Projetos pendentes'],
          ] as [Aba, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
              aba === key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'tarefas' ? (
        <TasksReport onProjectClick={onProjectClick} />
      ) : (
        <PendenciesReport onProjectClick={onProjectClick} />
      )}
    </div>
  )
}
