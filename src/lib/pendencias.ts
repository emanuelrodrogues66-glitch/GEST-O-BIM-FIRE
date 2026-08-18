import { supabase } from './supabase'
import type { ProjectPendency } from '../types'

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

export type DadosPendencia = {
  motivo?: string | null
  justificativa: string
  previsao_retorno?: string | null
  responsavel?: string | null
}

/** A pendência ainda aberta do projeto, se houver. */
export async function pendenciaAberta(projectId: string): Promise<ProjectPendency | null> {
  const { data } = await supabase
    .from('project_pendencies')
    .select('*')
    .eq('project_id', projectId)
    .is('data_fim', null)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ProjectPendency) || null
}

/**
 * Registra o início de uma pendência.
 * Se já existir uma aberta, não cria outra — evita duplicar o registro quando
 * o projeto é salvo mais de uma vez sem sair do status Pendente.
 */
export async function abrirPendencia(
  projectId: string,
  statusAnterior: string | null,
  dados: DadosPendencia
): Promise<void> {
  const jaAberta = await pendenciaAberta(projectId)
  if (jaAberta) return

  const { error } = await supabase.from('project_pendencies').insert({
    project_id: projectId,
    data_inicio: hoje(),
    motivo: dados.motivo || null,
    justificativa: dados.justificativa.trim(),
    status_anterior: statusAnterior,
    previsao_retorno: dados.previsao_retorno || null,
    responsavel: dados.responsavel || null,
  })
  if (error) throw error
}

/** Encerra a pendência aberta, registrando quantos dias o projeto ficou parado. */
export async function fecharPendencia(projectId: string, observacao?: string): Promise<void> {
  const aberta = await pendenciaAberta(projectId)
  if (!aberta) return

  const { error } = await supabase
    .from('project_pendencies')
    .update({
      data_fim: hoje(),
      observacao_encerramento: observacao?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', aberta.id)
  if (error) throw error
}

/** Nome de quem está usando o sistema, para carimbar o registro. */
export async function nomeDoUsuario(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const meta = data.session?.user.user_metadata as any
  return meta?.nome || data.session?.user.email?.split('@')[0] || null
}
