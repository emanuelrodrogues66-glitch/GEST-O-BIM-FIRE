import { supabase } from './supabase'

/**
 * MEF — instalação e manutenção.
 *
 * A MEF vende produto e mão de obra; a BIM Fire vende projeto. Por isso o
 * catálogo vive aqui e não se mistura com o financeiro do projeto: o custo de
 * uma obra é material mais hora mais despesa, não só hora de gente.
 */

export type Categoria = {
  id: string
  nome: string
  ordem: number
  ativo: boolean
}

export type Produto = {
  id: string
  categoria_id: string
  codigo: string | null
  nome: string
  descricao: string | null
  unidade: string
  preco: number
  custo: number
  minutos_instalacao: number | null
  ativo: boolean
}

export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'cancelado'

export type Orcamento = {
  id: string
  lead_id: string | null
  cliente_id: string | null
  numero: number
  versao: number
  nome_cliente: string | null
  contato: string | null
  endereco_obra: string | null
  validade: string | null
  condicoes: string | null
  observacoes: string | null
  desconto_pct: number
  status: StatusOrcamento
  responsavel: string | null
  enviado_em: string | null
  decidido_em: string | null
  created_at: string
}

export type ItemOrcamento = {
  id: string
  orcamento_id: string
  produto_id: string | null
  categoria_nome: string | null
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  desconto_pct: number
  ordem: number
  sem_correspondencia: boolean
}

export const UNIDADES = ['un', 'm', 'm²', 'h', 'cj', 'serviço']

export const ROTULO_STATUS: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
}

export const COR_STATUS: Record<StatusOrcamento, string> = {
  rascunho: 'bg-slate-100 text-slate-600',
  enviado: 'bg-amber-100 text-amber-800',
  aprovado: 'bg-emerald-100 text-emerald-800',
  recusado: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-400',
}

export function reais(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function dataBR(d: string | null): string {
  if (!d) return '—'
  const p = d.slice(0, 10).split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

export async function carregarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('mef_categorias')
    .select('*')
    .order('ordem')
    .order('nome')
  if (error) throw new Error(error.message)
  return (data as Categoria[]) || []
}

export async function carregarProdutos(): Promise<Produto[]> {
  const { data, error } = await supabase.from('mef_produtos').select('*').order('nome')
  if (error) throw new Error(error.message)
  return (data as Produto[]) || []
}

export async function carregarOrcamentos(): Promise<Orcamento[]> {
  const { data, error } = await supabase
    .from('mef_orcamentos')
    .select('*')
    .order('numero', { ascending: false })
    .order('versao', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as Orcamento[]) || []
}

export async function carregarItens(orcamentoId: string): Promise<ItemOrcamento[]> {
  const { data, error } = await supabase
    .from('mef_orcamento_itens')
    .select('*')
    .eq('orcamento_id', orcamentoId)
    .order('ordem')
  if (error) throw new Error(error.message)
  return (data as ItemOrcamento[]) || []
}

/** Orçamento novo pega o próximo número do escritório. */
export async function criarOrcamento(campos: Partial<Orcamento>): Promise<Orcamento> {
  const { data: numero, error: erroNumero } = await supabase.rpc('mef_proximo_numero')
  if (erroNumero) throw new Error(erroNumero.message)
  const { data, error } = await supabase
    .from('mef_orcamentos')
    .insert({ ...campos, numero, versao: 1 })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Orcamento
}

/**
 * Nova versão em vez de sobrescrever.
 *
 * Cliente pede para tirar um item e refazer: nasce a versão seguinte e a
 * anterior fica no histórico. Sem isso ninguém explica por que o valor mudou
 * entre uma conversa e outra.
 */
export async function novaVersao(
  orcamento: Orcamento,
  itens: ItemOrcamento[]
): Promise<Orcamento> {
  const { data, error } = await supabase
    .from('mef_orcamentos')
    .insert({
      lead_id: orcamento.lead_id,
      cliente_id: orcamento.cliente_id,
      numero: orcamento.numero,
      versao: orcamento.versao + 1,
      nome_cliente: orcamento.nome_cliente,
      contato: orcamento.contato,
      endereco_obra: orcamento.endereco_obra,
      validade: orcamento.validade,
      condicoes: orcamento.condicoes,
      observacoes: orcamento.observacoes,
      desconto_pct: orcamento.desconto_pct,
      responsavel: orcamento.responsavel,
      status: 'rascunho',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  const novo = data as Orcamento
  if (itens.length > 0) {
    const copias = itens.map((i) => ({
      orcamento_id: novo.id,
      produto_id: i.produto_id,
      categoria_nome: i.categoria_nome,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      custo_unitario: i.custo_unitario,
      desconto_pct: i.desconto_pct,
      ordem: i.ordem,
      sem_correspondencia: i.sem_correspondencia,
    }))
    const { error: erroItens } = await supabase.from('mef_orcamento_itens').insert(copias)
    if (erroItens) throw new Error(erroItens.message)
  }
  return novo
}

export type Totais = {
  subtotal: number
  desconto: number
  total: number
  custo: number
  margem: number
  margemPct: number | null
}

export function totalDoItem(i: {
  quantidade: number
  preco_unitario: number
  desconto_pct: number
}): number {
  const q = Number(i.quantidade) || 0
  const p = Number(i.preco_unitario) || 0
  const d = Number(i.desconto_pct) || 0
  return q * p * (1 - d / 100)
}

export function totais(itens: ItemOrcamento[], descontoPct: number): Totais {
  let subtotal = 0
  let custo = 0
  for (const i of itens) {
    subtotal += totalDoItem(i)
    custo += (Number(i.quantidade) || 0) * (Number(i.custo_unitario) || 0)
  }
  const desconto = subtotal * ((Number(descontoPct) || 0) / 100)
  const total = subtotal - desconto
  const margem = total - custo
  return {
    subtotal,
    desconto,
    total,
    custo,
    margem,
    margemPct: total > 0 ? (margem / total) * 100 : null,
  }
}
