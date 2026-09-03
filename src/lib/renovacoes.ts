/**
 * Serviços derivados e renovações anuais.
 *
 * Um projeto aprovado costuma gerar filhos: vistoria, funcionamento, habite-se,
 * SPDA. E vistoria e SPDA vencem todo ano — cada vencimento é um cliente que
 * precisa contratar de novo. Sem acompanhar a data, a renovação só acontece
 * quando o cliente lembra, o que na prática quer dizer quase nunca.
 */

import { supabase } from './supabase'
import type { Project, ProjectClient } from '../types'
import { RENOVACAO_MESES, categoriaDoTipo, diasAte, somarMeses, suggestedPoints } from '../types'

export type VencimentoProximo = {
  projeto: Project
  cliente: Partial<ProjectClient> | null
  dias: number
}

/** Campos do cliente que acompanham o serviço derivado. */
const CAMPOS_HERDADOS: (keyof ProjectClient)[] = [
  'nome_parceiro',
  'contato_parceiro',
  'endereco_parceiro',
  'cnpj',
  'nome_responsavel',
  'contato_responsavel',
  'email_cliente',
  'nome_dono_imovel',
  'contato_dono',
  'endereco_completo',
  'cidade',
  'estado',
  'link_localizacao',
  'ocupacao',
  'numero_processo',
  'numero_re',
]

/**
 * Cria um serviço a partir de um projeto existente.
 *
 * Copia o que é do imóvel e do cliente, e deixa em branco o que é do processo
 * novo: protocolo, datas e aprovação. Devolve o id do cartão criado.
 */
export async function duplicarParaServico(params: {
  origem: Project
  tipo: string
  nome?: string
}): Promise<string> {
  const { origem, tipo } = params

  const hoje = new Date().toISOString().slice(0, 10)
  const nome = (params.nome || `${tipo} ${origem.nome}`).trim()

  const { data: novo, error } = await supabase
    .from('projects')
    .insert({
      nome,
      tipo,
      responsavel: origem.responsavel,
      // Vistoria, SPDA e TCAC têm quadro próprio; o resto vai para a fila.
      categoria: categoriaDoTipo(tipo),
      status: 'Pendente',
      m2: origem.m2,
      pts: suggestedPoints(tipo, origem.m2),
      data_inicio: hoje,
      renovacao_meses: RENOVACAO_MESES[tipo] ?? null,
      projeto_origem_id: origem.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  const novoId = (novo as { id: string }).id

  // Leva os dados do imóvel e do cliente; o processo novo começa sem protocolo.
  const { data: clienteOrigem } = await supabase
    .from('project_clients')
    .select('*')
    .eq('project_id', origem.id)
    .maybeSingle()

  if (clienteOrigem) {
    const herdado: Record<string, unknown> = { project_id: novoId }
    for (const campo of CAMPOS_HERDADOS) {
      const valor = (clienteOrigem as Record<string, unknown>)[campo]
      if (valor !== null && valor !== undefined && valor !== '') herdado[campo] = valor
    }
    await supabase.from('project_clients').upsert(herdado, { onConflict: 'project_id' })
  }

  return novoId
}

/**
 * Renova um serviço vencido ou a vencer.
 *
 * Cria um cartão novo em vez de empurrar a data do antigo: renovar é trabalho
 * novo, com hora, ponto e aprovação próprios. O cartão velho fica no histórico
 * mostrando quando venceu.
 */
export async function renovarServico(origem: Project): Promise<string> {
  const meses = origem.renovacao_meses || 12
  const ano = origem.data_vencimento
    ? origem.data_vencimento.slice(0, 4)
    : new Date().getFullYear().toString()

  const novoId = await duplicarParaServico({
    origem,
    tipo: origem.tipo || 'Vistoria',
    // O nome ganha o ano para os cartões da mesma série não se confundirem.
    nome: `${origem.nome.replace(/\s*\(\d{4}\)\s*$/, '')} (${Number(ano) + 1})`,
  })

  await supabase
    .from('projects')
    .update({ renovacao_meses: meses })
    .eq('id', novoId)

  // O cartão antigo deixa de cobrar renovação: quem cobra agora é o novo.
  await supabase.from('projects').update({ data_vencimento: null }).eq('id', origem.id)

  return novoId
}

/** Recalcula o vencimento a partir da aprovação, quando o serviço renova. */
export function vencimentoPelaAprovacao(
  tipo: string | null,
  aprovacao: string | null,
  renovacaoMeses: number | null
): string | null {
  const meses = renovacaoMeses ?? (tipo ? RENOVACAO_MESES[tipo] : undefined)
  if (!meses || !aprovacao) return null
  return somarMeses(aprovacao, meses)
}

/**
 * O que vence dentro da janela pedida, incluindo o que já passou.
 * Vencido primeiro: é o que corre risco de o cliente ficar irregular.
 */
export async function carregarVencimentos(dias: number): Promise<VencimentoProximo[]> {
  const limite = somarMeses(new Date().toISOString().slice(0, 10), 0)
  const ate = new Date()
  ate.setDate(ate.getDate() + dias)
  const ateIso = ate.toISOString().slice(0, 10)

  const { data: projetos } = await supabase
    .from('projects')
    .select('*')
    .not('data_vencimento', 'is', null)
    .lte('data_vencimento', ateIso)
    .order('data_vencimento')

  const lista = (projetos as Project[]) || []
  if (lista.length === 0) return []

  const { data: clientes } = await supabase
    .from('project_clients')
    .select('project_id, nome_responsavel, contato_responsavel, email_cliente, nome_parceiro, contato_parceiro')
    .in('project_id', lista.map((p) => p.id))

  const porProjeto = new Map(
    ((clientes as (Partial<ProjectClient> & { project_id: string })[]) || []).map((c) => [
      c.project_id,
      c,
    ])
  )

  void limite
  return lista.map((p) => ({
    projeto: p,
    cliente: porProjeto.get(p.id) || null,
    dias: diasAte(p.data_vencimento as string),
  }))
}

/** "vence em 42 dias" · "vence hoje" · "venceu há 8 dias". */
export function descreverVencimento(dias: number): string {
  if (dias === 0) return 'vence hoje'
  if (dias > 0) return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
  const atraso = Math.abs(dias)
  return `venceu há ${atraso} dia${atraso === 1 ? '' : 's'}`
}
