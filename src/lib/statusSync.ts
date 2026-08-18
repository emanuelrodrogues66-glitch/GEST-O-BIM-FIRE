import { supabase } from './supabase'
import { abrirPendencia, fecharPendencia, pendenciaAberta, type DadosPendencia } from './pendencias'
import {
  STATUS_TO_LETRA,
  anexosObrigatoriosFaltando,
  isClientDataComplete,
  type ProjectClient,
} from '../types'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Grava/atualiza a letra do progresso diário do dia informado (padrão: hoje)
// de acordo com o status do projeto.
export async function syncDailyProgressForStatus(projectId: string, status: string, data?: string) {
  const letra = STATUS_TO_LETRA[status]
  if (!letra) return
  const dia = data || todayStr()
  await supabase.from('daily_progress').upsert(
    { project_id: projectId, data: dia, letra },
    { onConflict: 'project_id,data' }
  )
}

// Busca os dados do cliente de um projeto e informa se estão completos
// (todos os campos da aba "Dados do cliente" preenchidos).
/**
 * Um projeto só pode ser concluído com os dados do cliente completos
 * E com os anexos obrigatórios enviados.
 */
export async function checkClientDataComplete(projectId: string): Promise<boolean> {
  const [{ data: client }, { data: arquivos }] = await Promise.all([
    supabase.from('project_clients').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('project_files').select('categoria').eq('project_id', projectId),
  ])

  const cliente = client as Partial<ProjectClient> | null
  if (!isClientDataComplete(cliente)) return false

  const faltando = anexosObrigatoriosFaltando(cliente, (arquivos as { categoria: string | null }[]) || [])
  return faltando.length === 0
}

// Troca o status de um projeto, sincronizando o progresso diário do dia.
// Bloqueia a troca para "Concluído" se os dados do cliente não estiverem completos.
export type ResultadoStatus =
  | { ok: true }
  | { ok: false; reason: 'dados_incompletos' }
  | { ok: false; reason: 'justificativa_pendencia' }

/**
 * Troca o status do projeto aplicando as duas regras do negócio:
 * — Concluído exige dados do cliente completos e anexos obrigatórios.
 * — Pendente exige uma justificativa, que abre o registro de pendência.
 * Sair de Pendente encerra a pendência aberta automaticamente.
 */
export async function changeProjectStatus(
  projectId: string,
  status: string,
  opcoes?: { statusAnterior?: string | null; pendencia?: DadosPendencia }
): Promise<ResultadoStatus> {
  if (status === 'Concluído') {
    const completo = await checkClientDataComplete(projectId)
    if (!completo) {
      return { ok: false, reason: 'dados_incompletos' }
    }
  }

  const anterior = opcoes?.statusAnterior ?? null
  const entrandoEmPendente = status === 'Pendente' && anterior !== 'Pendente'

  if (entrandoEmPendente) {
    const jaAberta = await pendenciaAberta(projectId)
    if (!jaAberta && !opcoes?.pendencia?.justificativa?.trim()) {
      return { ok: false, reason: 'justificativa_pendencia' }
    }
  }

  const { error } = await supabase.from('projects').update({ status }).eq('id', projectId)
  if (error) throw error

  if (entrandoEmPendente && opcoes?.pendencia) {
    await abrirPendencia(projectId, anterior, opcoes.pendencia)
  }
  // Saiu de Pendente: fecha o período e registra a duração.
  if (status !== 'Pendente') {
    await fecharPendencia(projectId)
  }

  await syncDailyProgressForStatus(projectId, status)
  return { ok: true }
}
