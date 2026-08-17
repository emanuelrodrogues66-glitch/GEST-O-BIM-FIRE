import { supabase } from './supabase'
import { STATUS_TO_LETRA, isClientDataComplete, type ProjectClient } from '../types'

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
export async function checkClientDataComplete(projectId: string): Promise<boolean> {
  const { data } = await supabase
    .from('project_clients')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  return isClientDataComplete(data as Partial<ProjectClient> | null)
}

// Troca o status de um projeto, sincronizando o progresso diário do dia.
// Bloqueia a troca para "Concluído" se os dados do cliente não estiverem completos.
export async function changeProjectStatus(
  projectId: string,
  status: string
): Promise<{ ok: true } | { ok: false; reason: 'dados_incompletos' }> {
  if (status === 'Concluído') {
    const completo = await checkClientDataComplete(projectId)
    if (!completo) {
      return { ok: false, reason: 'dados_incompletos' }
    }
  }
  const { error } = await supabase.from('projects').update({ status }).eq('id', projectId)
  if (error) throw error
  await syncDailyProgressForStatus(projectId, status)
  return { ok: true }
}
