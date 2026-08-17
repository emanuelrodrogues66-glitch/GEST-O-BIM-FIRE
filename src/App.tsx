import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { changeProjectStatus } from './lib/statusSync'
import type { Project } from './types'
import { CATEGORIAS } from './types'
import Login from './components/Login'
import Board from './components/Board'
import ListView from './components/ListView'
import Dashboard from './components/Dashboard'
import ProjectModal from './components/ProjectModal'
import PdfExportModal from './components/PdfExportModal'
import PdfExportAllModal from './components/PdfExportAllModal'
import GanttGlobal from './components/GanttGlobal'
import TasksReport from './components/TasksReport'
import TasksBoard from './components/TasksBoard'
import ActivitiesReport from './components/ActivitiesReport'
import type { MonthRef } from './lib/month'
import { addMonths, dateInMonth, monthLabel } from './lib/month'

type ViewMode = 'kanban' | 'lista' | 'dashboard' | 'gantt' | 'relatorio' | 'tarefas' | 'atividades'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [nome, setNome] = useState<string>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0])
  const [responsavelFiltro, setResponsavelFiltro] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [modalProject, setModalProject] = useState<Project | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfAllModalOpen, setPdfAllModalOpen] = useState(false)
  const [month, setMonth] = useState<MonthRef>({ year: 2026, month: 8 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const meta = session.user.user_metadata as any
    setNome(meta?.nome || session.user.email?.split('@')[0] || '')
    fetchProjects()

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  async function fetchProjects() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('numero', { ascending: true })
    setProjects((data as Project[]) || [])
    setLoading(false)
  }

  const responsaveis = useMemo(() => {
    const set = new Set(projects.map((p) => p.responsavel).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [projects])

  const projectsDoMes = useMemo(() => {
    return projects.filter((p) => dateInMonth(p.data_inicio, month))
  }, [projects, month])

  const filtered = useMemo(() => {
    return projectsDoMes.filter((p) => {
      if (categoria && p.categoria !== categoria) return false
      if (responsavelFiltro && p.responsavel !== responsavelFiltro) return false
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [projectsDoMes, categoria, responsavelFiltro, busca])

  // Para o Gantt global não faz sentido restringir ao mês selecionado (é uma
  // visão de linha do tempo), então aplica os outros filtros sobre todos os projetos.
  const filteredSemMes = useMemo(() => {
    return projects.filter((p) => {
      if (categoria && p.categoria !== categoria) return false
      if (responsavelFiltro && p.responsavel !== responsavelFiltro) return false
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [projects, categoria, responsavelFiltro, busca])

  const stats = useMemo(() => {
    const atrasados = filtered.filter((p) => p.prazo_categoria === 'ATRASADO').length
    const essaSemana = filtered.filter((p) => p.prazo_categoria === 'ESSA SEMANA').length
    return { total: filtered.length, atrasados, essaSemana }
  }, [filtered])

  function openNew() {
    setModalProject(null)
    setIsNew(true)
    setModalOpen(true)
  }

  function openEdit(p: Project) {
    setModalProject(p)
    setIsNew(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalProject(null)
  }

  function handleSaved() {
    closeModal()
    fetchProjects()
  }

  async function handleDropCard(projectId: string, status: string) {
    const projeto = projects.find((p) => p.id === projectId)
    if (!projeto || projeto.status === status) return
    try {
      const result = await changeProjectStatus(projectId, status)
      if (!result.ok) {
        alert(
          `Não é possível concluir "${projeto.nome}" ainda: preencha todos os campos da aba "Dados do cliente" primeiro (abra o cartão do projeto).`
        )
        return
      }
      fetchProjects()
    } catch (err: any) {
      alert(err.message || 'Erro ao mover o projeto.')
    }
  }

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Carregando...</div>
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-800">Gestão de Projetos</h1>
            <p className="text-xs text-slate-400">Olá, {nome}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPdfModalOpen(true)}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              Gerar PDF
            </button>
            <button
              onClick={() => setPdfAllModalOpen(true)}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              Gerar todos os PDFs
            </button>
            <button
              onClick={openNew}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              + Novo projeto
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-slate-500 hover:text-slate-800 px-2 py-1.5"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
            <button
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
              title="Mês anterior"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-slate-700 px-2 min-w-[110px] text-center">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
              title="Próximo mês"
            >
              ›
            </button>
          </div>

          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  categoria === c ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={responsavelFiltro}
            onChange={(e) => setResponsavelFiltro(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <input
            placeholder="Buscar projeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[160px] max-w-xs"
          />

          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {(
              [
                ['kanban', 'Kanban'],
                ['lista', 'Lista'],
                ['dashboard', 'Dashboard'],
                ['gantt', 'Gantt'],
                ['tarefas', 'Tarefas'],
                ['atividades', 'Atividades'],
                ['relatorio', 'Relatório'],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  viewMode === mode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto text-xs">
            <span className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600">
              Total: <b>{stats.total}</b>
            </span>
            <span className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-red-600">
              Atrasados: <b>{stats.atrasados}</b>
            </span>
            <span className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-amber-600">
              Essa semana: <b>{stats.essaSemana}</b>
            </span>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Carregando projetos...</p>
        ) : viewMode === 'kanban' ? (
          <Board projects={filtered} onCardClick={openEdit} onDropCard={handleDropCard} />
        ) : viewMode === 'lista' ? (
          <ListView projects={filtered} onRowClick={openEdit} onBulkUpdated={fetchProjects} />
        ) : viewMode === 'dashboard' ? (
          <Dashboard projects={filtered} month={month} />
        ) : viewMode === 'gantt' ? (
          <GanttGlobal projects={filteredSemMes} />
        ) : viewMode === 'tarefas' ? (
          <TasksBoard />
        ) : viewMode === 'atividades' ? (
          <ActivitiesReport />
        ) : (
          <TasksReport />
        )}
      </div>

      {pdfModalOpen && (
        <PdfExportModal categoria={categoria} projects={filtered} month={month} onClose={() => setPdfModalOpen(false)} />
      )}

      {pdfAllModalOpen && (
        <PdfExportAllModal projects={projectsDoMes} month={month} onClose={() => setPdfAllModalOpen(false)} />
      )}

      {modalOpen && (
        <ProjectModal
          project={modalProject}
          isNew={isNew}
          responsaveis={responsaveis}
          month={month}
          onClose={closeModal}
          onSaved={handleSaved}
          onDeleted={handleSaved}
        />
      )}
    </div>
  )
}
