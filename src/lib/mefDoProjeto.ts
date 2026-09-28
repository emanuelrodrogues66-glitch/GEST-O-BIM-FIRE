import { supabase } from './supabase'
import { criarOrcamento } from './mef'
import { criarLead, registrarAtividade } from './crm'
import type { Project, ProjectClient } from '../types'

/**
 * Do projeto aprovado para a MEF.
 *
 * Projeto aprovado no Corpo de Bombeiros vira obra: alguem precisa instalar
 * extintor, hidrante, alarme. Ate aqui esse repasse era conversa de corredor e
 * se perdia pelo caminho. O botao abre a negociacao no funil da MEF e ja deixa
 * um orcamento em rascunho com os dados do cliente, para o orcamentista so
 * precisar por os itens.
 */
export type EnvioParaMef = {
  leadId: string
  orcamentoId: string
  numero: number
}

/** O orcamento da MEF que ja existe para este projeto, se alguem ja mandou. */
export async function orcamentoDoProjeto(
  projectId: string
): Promise<{ id: string; numero: number; status: string; lead_id: string | null } | null> {
  const { data } = await supabase
    .from('mef_orcamentos')
    .select('id, numero, status, lead_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
  const lista =
    (data as { id: string; numero: number; status: string; lead_id: string | null }[]) || []
  return lista[0] || null
}

export async function enviarParaMef(
  projeto: Project,
  ficha: Partial<ProjectClient>
): Promise<EnvioParaMef> {
  const { data: funil } = await supabase
    .from('crm_funnels')
    .select('id')
    .eq('tipo', 'mef_execucao')
    .maybeSingle()
  if (!funil) throw new Error('O funil da MEF nao foi encontrado no CRM.')
  const funnelId = (funil as { id: string }).id

  // Primeira etapa do funil: ORCAMENTO SOLICITADO.
  const { data: etapas } = await supabase
    .from('crm_stages')
    .select('id')
    .eq('funnel_id', funnelId)
    .order('ordem')
    .limit(1)
  const stageId = ((etapas as { id: string }[]) || [])[0]?.id || null

  const nomeCliente = (ficha.nome_responsavel || ficha.nome_obra || '').trim() || null
  const obra = (ficha.nome_obra || projeto.nome || '').trim() || null

  const lead = await criarLead({
    nome: obra || projeto.nome,
    funnel_id: funnelId,
    stage_id: stageId,
    estado: 'aberta',
    cliente_id: ficha.cliente_id || null,
    nome_cliente: nomeCliente,
    contato: ficha.contato_responsavel || null,
    email: ficha.email_cliente || null,
    cidade: ficha.cidade || null,
    nome_projeto: obra,
    endereco_obra: ficha.endereco_completo || null,
    area_m2: projeto.m2,
    project_id: projeto.id,
    origem: 'app',
    origem_id: projeto.id,
    responsavel: projeto.responsavel,
    criado_em: new Date().toISOString().slice(0, 10),
  })

  const orcamento = await criarOrcamento({
    status: 'rascunho',
    desconto_pct: 0,
    lead_id: lead.id,
    project_id: projeto.id,
    cliente_id: ficha.cliente_id || null,
    nome_cliente: nomeCliente,
    contato: ficha.contato_responsavel || null,
    endereco_obra: ficha.endereco_completo || null,
  })

  await registrarAtividade(
    lead.id,
    'nota',
    'Projeto aprovado e enviado para a MEF orcar. Orcamento no ' + orcamento.numero + '.'
  )

  return { leadId: lead.id, orcamentoId: orcamento.id, numero: orcamento.numero }
}
