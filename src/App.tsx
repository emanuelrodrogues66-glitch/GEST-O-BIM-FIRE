import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { changeProjectStatus } from './lib/statusSync'
import { nomeDoUsuario, type DadosPendencia } from './lib/pendencias'
import { alertarCorrecao, comemorarConclusao } from './lib/celebracao'
import type { Project } from './types'
import { CATEGORIAS } from './types'
import Login from './components/Login'
import NovaSenha from './components/NovaSenha'
import Board from './components/Board'
import ListView from './components/ListView'
import Dashboard from './components/Dashboard'
import ProjectModal from './components/ProjectModal'
import PdfExportModal from './components/PdfExportModal'
import PdfExportAllModal from './components/PdfExportAllModal'
import GanttGlobal from './components/GanttGlobal'
import ReportsView from './components/ReportsView'
import TasksBoard from './components/TasksBoard'
import ActivitiesReport from './components/ActivitiesReport'
import PendencyDialog from './components/PendencyDialog'
import CelebrationSettings from './components/CelebrationSettings'
import type { MonthRef } from './lib/month'
import { addMonths, dateInMonth, monthLabel } from './lib/month'

type ViewMode = 'kanban' | 'lista' | 'dashboard' | 'gantt' | 'relatorio' | 'tarefas' | 'atividades'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Chegou pelo link de recuperação: antes de entrar, define a senha nova.
  const [redefinindoSenha, setRedefinindoSenha] = useState(false)
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
  const [dragOverCategoria, setDragOverCategoria] = useState<string | null>(null)
  // No Kanban, permite ver projetos de todos os meses (trabalho em andamento
  // nao se encerra na virada do mes).
  const [verTodosMeses, setVerTodosMeses] = useState(false)
  // Projeto que está indo para Pendente e precisa de justificativa.
  const [pedirPendencia, setPedirPendencia] = useState<{ projeto: Project; status: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      if (evento === 'PASSWORD_RECOVERY') setRedefinindoSenha(true)
    })
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

  function passaNosFiltros(p: Project): boolean {
    if (categoria && p.categoria !== categoria) return false
    if (responsavelFiltro && p.responsavel !== responsavelFiltro) return false
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  }

  // Lista e relatórios continuam agrupados por mês.
  const filtered = useMemo(
    () => projectsDoMes.filter(passaNosFiltros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectsDoMes, categoria, responsavelFiltro, busca]
  )

  /**
   * Kanban e Lista podem ignorar o mês: um projeto iniciado em junho continua
   * em andamento hoje e precisa aparecer no quadro de trabalho.
   */
  const filteredTodosMeses = useMemo(
    () => (verTodosMeses ? projects.filter(passaNosFiltros) : filtered),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verTodosMeses, projects, filtered, categoria, responsavelFiltro, busca]
  )

  // O botão "Todos os meses" vale para o quadro e para a lista.
  const aceitaTodosMeses = viewMode === 'kanban' || viewMode === 'lista'

  // Os contadores do topo seguem o que está de fato na tela.
  const listaVisivel = aceitaTodosMeses ? filteredTodosMeses : filtered

  // Para o Gantt global não faz sentido restringir ao mês selecionado (é uma
  // visão de linha do tempo), então aplica os outros filtros sobre todos os projetos.
  const stats = useMemo(() => {
    const atrasados = listaVisivel.filter((p) => p.prazo_categoria === 'ATRASADO').length
    const essaSemana = listaVisivel.filter((p) => p.prazo_categoria === 'ESSA SEMANA').length
    return { total: listaVisivel.length, atrasados, essaSemana }
  }, [listaVisivel])

  function openNew() {
    setModalProject(null)
    setIsNew(true)
    setModalOpen(true)
  }

  /** Abre o cartão a partir de telas que só conhecem o id (tarefas, relatórios). */
  function openEditById(projectId: string) {
    const p = projects.find((x) => x.id === projectId)
    if (p) openEdit(p)
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

  /**
   * Move o projeto para outra categoria arrastando o cartão sobre a aba.
   * "PROJETOS FINALIZADOS" fica de fora: o projeto vai para lá sozinho
   * quando o status muda para Concluído.
   */
  async function handleDropCategoria(projectId: string, novaCategoria: string) {
    const projeto = projects.find((p) => p.id === projectId)
    if (!projeto || projeto.categoria === novaCategoria) return
    try {
      const { error } = await supabase
        .from('projects')
        .update({ categoria: novaCategoria })
        .eq('id', projectId)
      if (error) throw error
      fetchProjects()
    } catch (err: any) {
      alert(err.message || 'Erro ao mover o projeto de categoria.')
    }
  }

  async function handleDropCard(projectId: string, status: string, pendencia?: DadosPendencia) {
    const projeto = projects.find((p) => p.id === projectId)
    if (!projeto || projeto.status === status) return
    try {
      const result = await changeProjectStatus(projectId, status, {
        statusAnterior: projeto.status,
        pendencia: pendencia
          ? { ...pendencia, responsavel: await nomeDoUsuario() }
          : undefined,
      })

      if (!result.ok) {
        if (result.reason === 'justificativa_pendencia') {
          // Abre o diálogo e refaz a mudança com a justificativa preenchida.
          setPedirPendencia({ projeto, status })
          return
        }
        alert(
          `Não é possível concluir "${projeto.nome}" ainda: faltam dados ou anexos obrigatórios. ` +
            'Abra o cartão do projeto para ver o que está pendente.'
        )
        return
      }
      setPedirPendencia(null)
      if (status === 'Concluído') comemorarConclusao()
      else if (status === 'CORREÇÃO') alertarCorrecao(projeto.nome)
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

  if (redefinindoSenha) {
    return <NovaSenha onPronto={() => setRedefinindoSenha(false)} />
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
            <CelebrationSettings />
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
            <span
              className={`text-xs font-semibold px-2 min-w-[110px] text-center ${
                verTodosMeses && aceitaTodosMeses ? 'text-slate-300 line-through' : 'text-slate-700'
              }`}
            >
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

          {/* O trabalho em andamento não termina na virada do mês */}
          {aceitaTodosMeses && (
            <button
              onClick={() => setVerTodosMeses((v) => !v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                verTodosMeses
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
              title="Mostra os projetos desta categoria de todos os meses, não só do mês selecionado"
            >
              Todos os meses
            </button>
          )}

          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
            {CATEGORIAS.map((c) => {
              // Só as duas primeiras aceitam cartão arrastado; a de finalizados
              // é preenchida automaticamente ao concluir o projeto.
              const aceitaSolta = viewMode === 'kanban' && c !== 'PROJETOS FINALIZADOS'
              const arrastandoSobre = dragOverCategoria === c
              return (
                <button
                  key={c}
                  onClick={() => setCategoria(c)}
                  onDragOver={(e) => {
                    if (!aceitaSolta) return
                    e.preventDefault()
                    setDragOverCategoria(c)
                  }}
                  onDragLeave={() => setDragOverCategoria((v) => (v === c ? null : v))}
                  onDrop={(e) => {
                    if (!aceitaSolta) return
                    e.preventDefault()
                    setDragOverCategoria(null)
                    const projectId = e.dataTransfer.getData('text/plain')
                    if (projectId) handleDropCategoria(projectId, c)
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                    arrastandoSobre
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400'
                      : categoria === c
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  title={aceitaSolta ? 'Arraste um cartão até aqui para mover de categoria' : undefined}
                >
                  {c}
                </button>
              )
            })}
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
          <Board
            projects={filteredTodosMeses}
            mostrarMes={verTodosMeses}
            onCardClick={openEdit}
            onDropCard={handleDropCard}
            colunas={categoria === 'PROJETOS FINALIZADOS' ? ['Concluído'] : undefined}
          />
        ) : viewMode === 'lista' ? (
          <ListView
            projects={filteredTodosMeses}
            mostrarMes={verTodosMeses}
            onRowClick={openEdit}
            onBulkUpdated={fetchProjects}
          />
        ) : viewMode === 'dashboard' ? (
          // O Dashboard recebe tudo e aplica os próprios filtros de status e mês.
          <Dashboard projects={projects} month={month} />
        ) : viewMode === 'gantt' ? (
          <GanttGlobal projects={projects} onProjectClick={openEdit} />
        ) : viewMode === 'tarefas' ? (
          <TasksBoard onProjectClick={openEditById} />
        ) : viewMode === 'atividades' ? (
          <ActivitiesReport />
        ) : (
          <ReportsView onProjectClick={openEditById} />
        )}
      </div>

      {pdfModalOpen && (
        <PdfExportModal categoria={categoria} projects={filtered} month={month} onClose={() => setPdfModalOpen(false)} />
      )}

      {pdfAllModalOpen && (
        <PdfExportAllModal projects={projectsDoMes} month={month} onClose={() => setPdfAllModalOpen(false)} />
      )}

      {pedirPendencia && (
        <PendencyDialog
          titulo={pedirPendencia.projeto.nome}
          onCancelar={() => setPedirPendencia(null)}
          onConfirmar={(dados) =>
            handleDropCard(pedirPendencia.projeto.id, pedirPendencia.status, dados)
          }
        />
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
