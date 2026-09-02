/**
 * Comercial.
 *
 * O lead e o projeto são o mesmo negócio em duas fases. Enquanto não vende, o
 * cartão só tem ferramenta comercial; ao vender, ele ganha um cartão de projeto
 * e os dois passam a dividir o mesmo cliente e o mesmo parceiro, por id.
 * Corrigir um telefone vale nos dois lados — era isso que se perdia mantendo
 * RD e planilha em paralelo.
 */

import { supabase } from './supabase'

export type Funil = {
  id: string
  nome: string
  tipo: 'cliente_final' | 'parceiro' | 'recorrencia'
  ordem: number
  ativo: boolean
}

export type Etapa = {
  id: string
  funnel_id: string
  nome: string
  ordem: number
  tipo: 'aberta' | 'ganho' | 'perdido'
  cor: string | null
}

export type Lead = {
  id: string
  nome: string
  funnel_id: string | null
  stage_id: string | null
  estado: 'aberta' | 'ganho' | 'perdido'
  tipo_cliente: string | null
  cliente_id: string | null
  parceiro_id: string | null
  nome_cliente: string | null
  nome_parceiro: string | null
  contato: string | null
  email: string | null
  cidade: string | null
  nome_projeto: string | null
  area_m2: number | null
  valor: number | null
  valor_fechado: number | null
  numero_orcamento: string | null
  observacoes: string | null
  responsavel: string | null
  fonte: string | null
  motivo_perda: string | null
  anotacao_perda: string | null
  previsao_fechamento: string | null
  data_fechamento: string | null
  retorno_em: string | null
  criado_em: string
  origem: 'app' | 'rd' | 'planilha'
  origem_id: string | null
  project_id: string | null
  tipo_venda: 'novo' | 'recompra' | 'memorial' | null
  comissao_percentual: number | null
  comissao_valor: number | null
  comissao_manual: boolean
  comissao_paga_em: string | null
}

export type AtividadeLead = {
  id: string
  lead_id: string
  tipo: string
  texto: string | null
  quem: string | null
  quando: string
}

export const TIPOS_ATIVIDADE = [
  { valor: 'nota', rotulo: 'Anotação', emoji: '📝' },
  { valor: 'ligacao', rotulo: 'Ligação', emoji: '📞' },
  { valor: 'whatsapp', rotulo: 'WhatsApp', emoji: '💬' },
  { valor: 'email', rotulo: 'E-mail', emoji: '✉️' },
  { valor: 'reuniao', rotulo: 'Reunião', emoji: '🤝' },
  { valor: 'proposta', rotulo: 'Proposta', emoji: '📄' },
] as const

export const MOTIVOS_PERDA = [
  'Preço',
  'Fechou com outra empresa',
  'Demora no follow',
  'Cliente optou por não realizar o projeto',
  'Outros',
]

export function reais(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// ------------------------------------------------------------------ carregar

export async function carregarFunis(): Promise<Funil[]> {
  const { data } = await supabase.from('crm_funnels').select('*').eq('ativo', true).order('ordem')
  return (data as Funil[]) || []
}

export async function carregarEtapas(): Promise<Etapa[]> {
  const { data } = await supabase.from('crm_stages').select('*').order('ordem')
  return (data as Etapa[]) || []
}

/** Paginado: são 730 leads e o PostgREST corta em 1000 sem avisar. */
export async function carregarLeads(filtro?: {
  funnel_id?: string
  estado?: Lead['estado'][]
}): Promise<Lead[]> {
  const PAGINA = 1000
  const todos: Lead[] = []
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from('crm_leads').select('*')
    if (filtro?.funnel_id) q = q.eq('funnel_id', filtro.funnel_id)
    if (filtro?.estado?.length) q = q.in('estado', filtro.estado)
    const { data, error } = await q
      .order('criado_em', { ascending: false })
      .range(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    const lote = (data as Lead[]) || []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

export async function carregarAtividades(leadId: string): Promise<AtividadeLead[]> {
  const { data } = await supabase
    .from('crm_lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('quando', { ascending: false })
  return (data as AtividadeLead[]) || []
}

// ------------------------------------------------------------------ escrever

export async function salvarLead(id: string, patch: Partial<Lead>) {
  const { error } = await supabase
    .from('crm_leads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function criarLead(lead: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase.from('crm_leads').insert(lead).select('*').single()
  if (error) throw new Error(error.message)
  return data as Lead
}

/**
 * Move o lead de etapa.
 *
 * Toda mudança fica no histórico: sem isso não dá para saber quanto tempo um
 * negócio ficou parado em "orçamento enviado", que é a pergunta que o funil
 * existe para responder.
 */
export async function moverEtapa(lead: Lead, etapa: Etapa, etapaAntiga?: Etapa) {
  await salvarLead(lead.id, {
    stage_id: etapa.id,
    estado: etapa.tipo === 'aberta' ? 'aberta' : etapa.tipo,
    ...(etapa.tipo === 'ganho' && !lead.data_fechamento
      ? { data_fechamento: new Date().toISOString().slice(0, 10) }
      : {}),
  })
  await registrarAtividade(
    lead.id,
    'etapa',
    `${etapaAntiga?.nome || '—'} → ${etapa.nome}`
  )
}

export async function registrarAtividade(leadId: string, tipo: string, texto: string) {
  const email = (await supabase.auth.getUser()).data.user?.email
  const { error } = await supabase
    .from('crm_lead_activities')
    .insert({ lead_id: leadId, tipo, texto, quem: email })
  if (error) throw new Error(error.message)
}

export async function converterEmProjeto(params: {
  leadId: string
  tipo: string
  categoria: string
  responsavel: string | null
  dataPrazo: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('converter_lead_em_projeto', {
    p_lead: params.leadId,
    p_tipo: params.tipo,
    p_categoria: params.categoria,
    p_responsavel: params.responsavel,
    p_data_prazo: params.dataPrazo,
  })
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
  return data as string
}

export type Sugestao = { id: string; numero: number | null; nome: string; semelhanca: number }

/**
 * Projetos parecidos com o lead.
 *
 * Casar automaticamente pelo nome não funciona aqui: "JAIME GALPÃO COMERCIAL"
 * casaria com o projeto chamado "Comercial". Então o sistema sugere e quem
 * confirma é uma pessoa.
 */
export async function sugerirProjetos(leadId: string): Promise<Sugestao[]> {
  const { data } = await supabase.rpc('sugerir_projetos', { p_lead: leadId, p_limite: 6 })
  return ((data as Sugestao[]) || []).filter((s) => s.semelhanca > 0.1)
}

export async function ligarAoProjeto(leadId: string, projectId: string | null) {
  await salvarLead(leadId, { project_id: projectId })
  await registrarAtividade(
    leadId,
    'sistema',
    projectId ? 'Ligado a um projeto da gestão.' : 'Desligado do projeto.'
  )
}

/**
 * Traz para o funil de recorrência os vencimentos que já existem na gestão.
 *
 * Não cria lista paralela: vistoria, SPDA e funcionamento continuam vencendo lá,
 * com a data no cartão. Aqui vira só a conversa de renovar.
 */
export async function sincronizarRecorrencias(dias = 90): Promise<number> {
  const { data, error } = await supabase.rpc('sincronizar_recorrencias', { p_dias: dias })
  if (error) throw new Error(error.message)
  return (data as number) || 0
}

export async function recalcularComissoes(): Promise<number> {
  const { data, error } = await supabase.rpc('recalcular_comissoes')
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
  return (data as number) || 0
}

/**
 * Apaga negociações.
 *
 * Não tem desfazer, então o banco recusa apagar lead que já virou projeto —
 * o cartão da gestão ficaria órfão. Nesse caso é preciso desligar do projeto
 * antes, o que obriga a pessoa a pensar duas vezes.
 */
export async function excluirLeads(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('excluir_leads', { p_ids: ids })
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
  return (data as number) || 0
}

/** Ajuste manual: trava o valor para o cálculo automático não sobrescrever. */
export async function ajustarComissao(leadId: string, valor: number | null) {
  await salvarLead(leadId, {
    comissao_valor: valor,
    comissao_manual: valor !== null,
  } as Partial<Lead>)
  await registrarAtividade(
    leadId,
    'sistema',
    valor === null ? 'Comissão voltou ao cálculo automático.' : `Comissão ajustada à mão: ${reais(valor)}.`
  )
}
