import { supabase } from './supabase'

export type ProjectMeeting = {
  id: string
  project_id: string | null
  titulo: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  local: string | null
  participantes: string[]
  ata: string | null
  encaminhamentos: string | null
  realizada: boolean
  created_at: string
  updated_at: string
}

/** Reunião com o nome do projeto junto, para o calendário mostrar de onde é. */
export type ReuniaoDaAgenda = ProjectMeeting & {
  projects: { nome: string; numero: number | null } | null
}

export async function carregarReunioes(): Promise<ReuniaoDaAgenda[]> {
  const { data, error } = await supabase
    .from('project_meetings')
    .select('*, projects(nome, numero)')
    .order('data', { ascending: true })
  if (error) throw error
  return (data as ReuniaoDaAgenda[]) || []
}

export async function carregarReunioesDoProjeto(projectId: string): Promise<ProjectMeeting[]> {
  const { data, error } = await supabase
    .from('project_meetings')
    .select('*')
    .eq('project_id', projectId)
    .order('data', { ascending: false })
  if (error) throw error
  return (data as ProjectMeeting[]) || []
}

/** Reunião que já passou e ninguém escreveu a ata — é o que costuma se perder. */
export function ataPendente(r: ProjectMeeting, hoje = new Date().toISOString().slice(0, 10)): boolean {
  return r.data <= hoje && !(r.ata || '').trim()
}
