import { supabase } from './supabase'
import type { ProjectTask, TaskCategory, TaskRecurrence } from '../types'

/** Tarefa com o nome do projeto e da categoria já resolvidos. */
export type TarefaDaAgenda = ProjectTask & {
  projects: { nome: string; numero: number | null } | null
  task_categories: { nome: string; cor: string } | null
}

export function hojeStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** "2026-08-21" -> Date local, sem o deslocamento de fuso do parser ISO. */
export function paraData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function paraIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function somarDias(d: Date, n: number): Date {
  const novo = new Date(d)
  novo.setDate(novo.getDate() + n)
  return novo
}

/** Domingo da semana em que a data cai. */
export function inicioDaSemana(d: Date): Date {
  return somarDias(d, -d.getDay())
}

export async function carregarCategorias(): Promise<TaskCategory[]> {
  const { data } = await supabase
    .from('task_categories')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  return (data as TaskCategory[]) || []
}

export async function carregarRecorrencias(): Promise<TaskRecurrence[]> {
  const { data } = await supabase
    .from('task_recurrences')
    .select('*')
    .order('nome', { ascending: true })
  return (data as TaskRecurrence[]) || []
}

export async function carregarTarefas(): Promise<TarefaDaAgenda[]> {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('*, projects(nome, numero), task_categories(nome, cor)')
    .order('data_prazo', { ascending: true })
  if (error) throw error
  return (data as TarefaDaAgenda[]) || []
}

/**
 * Materializa as próximas ocorrências das tarefas recorrentes.
 * Roda ao abrir a agenda; repetir é inofensivo, pois o banco ignora
 * ocorrências que já existem.
 */
export async function gerarOcorrencias(horizonteDias = 60): Promise<number> {
  const { data, error } = await supabase.rpc('gerar_ocorrencias_recorrentes', {
    horizonte_dias: horizonteDias,
  })
  if (error) {
    console.warn('Não foi possível gerar as tarefas recorrentes:', error.message)
    return 0
  }
  return (data as number) ?? 0
}

/**
 * Reaplica uma regra editada: apaga as ocorrências futuras ainda pendentes
 * e gera de novo com os dados novos. O que já passou ou foi concluído fica.
 */
export async function reaplicarRecorrencia(regraId: string): Promise<void> {
  const { error } = await supabase.rpc('reaplicar_recorrencia', { regra_id: regraId })
  if (error) throw error
}

/** Paleta estável por responsável, para o calendário não trocar de cor a cada carga. */
const CORES_RESPONSAVEL = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
]

/**
 * Cor fixa de cada pessoa da equipe.
 *
 * Antes a cor saía de um hash do nome, então mudava de pessoa a cada colega
 * novo e ninguém conseguia associar cor a rosto. Definidas à mão, o calendário
 * e o Gantt passam a ser lidos pela cor sem precisar da legenda.
 */
export const CORES_DA_EQUIPE: Record<string, string> = {
  aimee: '#38bdf8', // azul claro
  breno: '#f97316', // laranja
  samuel: '#16a34a', // verde
  samira: '#ec4899', // rosa
  emanuel: '#0891b2', // ciano
  matheus: '#8b5cf6', // roxo
}

export function corDoResponsavel(nome: string | null | undefined): string {
  const chave = (nome || 'Sem responsável').trim().toLowerCase()

  const fixa = CORES_DA_EQUIPE[chave]
  if (fixa) return fixa

  // Primeiro nome resolve "Samira Souza" e afins.
  const primeiro = chave.split(/\s+/)[0]
  if (CORES_DA_EQUIPE[primeiro]) return CORES_DA_EQUIPE[primeiro]

  // Quem não está na lista continua ganhando uma cor estável pelo nome.
  let soma = 0
  for (let i = 0; i < chave.length; i++) soma = (soma + chave.charCodeAt(i)) % 9973
  return CORES_RESPONSAVEL[soma % CORES_RESPONSAVEL.length]
}
