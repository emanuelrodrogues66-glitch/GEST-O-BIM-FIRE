import { supabase } from './supabase'
import { travaDoProjeto } from './arquivosCliente'
import type { MotivoTrava } from './arquivosCliente'
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
  | { ok: false; reason: 'arquivos_cliente'; detalhe: MotivoTrava }

/**
 * Troca o status do projeto aplicando as duas regras do negócio:
 * — Concluído exige dados do cliente completos e anexos obrigatórios.
 * — Pendente exige uma justificativa, que abre o registro de pendência.
 * Sair de Pendente encerra a pendência aberta automaticamente.
 */
/**
 * Servicos da carteira nao tem aprovacao separada: concluir E a aprovacao.
 *
 * O ranking so conta o ponto do mes em que o projeto foi aprovado. Vistoria,
 * SPDA e TCAC nao passam por aprovacao no Corpo de Bombeiros como um projeto
 * passa — ninguem tinha o que escrever naquele campo, e o ponto da renovacao
 * sumia do ranking sem ninguem perceber. Aqui a data de conclusao vira a data
 * de aprovacao, e so quando o campo esta vazio: quem preencheu a mao manda.
 */
const SERVICOS_SEM_APROVACAO_PROPRIA = ['Vistoria', 'SPDA', 'TCAC']

export async function carimbarAprovacaoDeServico(projectId: string) {
  const { data: projeto } = await supabase
    .from('projects')
    .select('tipo')
    .eq('id', projectId)
    .maybeSingle()
  const tipo = (projeto as { tipo: string | null } | null)?.tipo || ''
  if (!SERVICOS_SEM_APROVACAO_PROPRIA.includes(tipo)) return

  const { data: ficha } = await supabase
    .from('project_clients')
    .select('data_aprovacao')
    .eq('project_id', projectId)
    .maybeSingle()
  if ((ficha as { data_aprovacao: string | null } | null)?.data_aprovacao) return

  const hoje = new Date().toISOString().slice(0, 10)
  await supabase
    .from('project_clients')
    .upsert({ project_id: projectId, data_aprovacao: hoje }, { onConflict: 'project_id' })
}

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

  // Sair de Pendente exige saber se o cliente mandou arquivos e, se mandou,
  // que eles ja estejam anexados no cartao.
  if (status !== 'Pendente') {
    const trava = await travaDoProjeto(projectId)
    if (trava) return { ok: false, reason: 'arquivos_cliente', detalhe: trava }
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

  if (status === 'Concluído') await carimbarAprovacaoDeServico(projectId)

  await syncDailyProgressForStatus(projectId, status)
  return { ok: true }
}
