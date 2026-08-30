import type { Project } from '../types'
import { prazoColor, tipoColor } from '../types'

function initials(name: string | null) {
  if (!name) return '?'
  return name.trim().slice(0, 2).toUpperCase()
}

function formatDate(d: string | null) {
  if (!d) return null
  const parts = d.split('-')
  return `${parts[2]}/${parts[1]}`
}

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-06-14" vira "jun/26". */
function mesCurto(data: string | null): string {
  if (!data) return ''
  const [ano, mes] = data.split('-')
  return `${MESES_CURTO[Number(mes) - 1]}/${ano.slice(2)}`
}

export default function ProjectCard({
  project,
  onClick,
  mostrarMes,
}: {
  project: Project
  onClick: () => void
  mostrarMes?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-xl shadow-sm p-3 shadow-sm hover:shadow-md hover:border-indigo-300 transition group"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-800 leading-snug group-hover:text-indigo-700">
          {project.nome}
        </h3>
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 text-white text-[10px] font-semibold flex items-center justify-center">
          {initials(project.responsavel)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {project.tipo && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tipoColor(project.tipo)}`}>
            {project.tipo}
          </span>
        )}
        {project.pts != null && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {project.pts} pts
          </span>
        )}
        {project.m2 != null && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {project.m2.toLocaleString('pt-BR')} m²
          </span>
        )}
        {mostrarMes && project.data_inicio && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100"
            title="Mês de início do projeto"
          >
            {mesCurto(project.data_inicio)}
          </span>
        )}
      </div>
      {project.prazo_categoria && (
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${prazoColor(project.prazo_categoria)}`}>
            {project.prazo_categoria}
          </span>
          {project.data_prazo && (
            <span className="text-[10px] text-slate-400">{formatDate(project.data_prazo)}</span>
          )}
        </div>
      )}
    </button>
  )
}
