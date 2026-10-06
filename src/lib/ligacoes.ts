import { supabase } from './supabase'

/**
 * Registro de ligacoes.
 *
 * Ligar era o unico trabalho comercial que nao deixava rastro: quem ligou,
 * quantas vezes, quem atendeu e o que ficou combinado viviam na cabeca de
 * quem ligou. Sem isso nao da para saber se o problema e falta de ligacao ou
 * falta de interesse do mercado.
 */
export type Ligacao = {
  id: string
  lead_id: string | null
  contato_id: string | null
  telefone: string
  nome: string | null
  quem: string | null
  quando: string
  resultado: string
  duracao_segundos: number
  observacao: string | null
  proximo_passo: string | null
  origem: string
}

export const RESULTADOS: { valor: string; rotulo: string; cor: string }[] = [
  { valor: 'atendeu', rotulo: 'Atendeu', cor: 'bg-emerald-100 text-emerald-700' },
  { valor: 'nao_atendeu', rotulo: 'Não atendeu', cor: 'bg-slate-100 text-slate-600' },
  { valor: 'caixa', rotulo: 'Caixa postal', cor: 'bg-sky-100 text-sky-700' },
  { valor: 'ocupado', rotulo: 'Ocupado', cor: 'bg-amber-100 text-amber-700' },
  { valor: 'numero_errado', rotulo: 'Número errado', cor: 'bg-rose-100 text-rose-700' },
  { valor: 'sem_interesse', rotulo: 'Sem interesse', cor: 'bg-rose-100 text-rose-700' },
]

export function rotuloDoResultado(v: string) {
  return RESULTADOS.find((r) => r.valor === v)?.rotulo || v
}
export function corDoResultado(v: string) {
  return RESULTADOS.find((r) => r.valor === v)?.cor || 'bg-slate-100 text-slate-600'
}

/** Segundos em algo que se le: 95 vira 1min35. */
export function duracaoBonita(s: number) {
  const seg = Math.max(0, Math.round(s || 0))
  if (seg < 60) return seg + 's'
  const min = Math.floor(seg / 60)
  const resto = seg % 60
  return resto ? min + 'min' + String(resto).padStart(2, '0') : min + 'min'
}

export type NovaLigacao = {
  telefone: string
  resultado: string
  leadId?: string | null
  contatoId?: string | null
  nome?: string | null
  duracaoSegundos?: number
  observacao?: string | null
  proximoPasso?: string | null
  quem?: string | null
  origem?: 'crm' | 'plugin'
}

export async function registrarLigacao(d: NovaLigacao): Promise<string> {
  const { data, error } = await supabase.rpc('crm_registrar_ligacao', {
    p_telefone: d.telefone,
    p_resultado: d.resultado,
    p_lead: d.leadId || null,
    p_contato: d.contatoId || null,
    p_nome: d.nome || null,
    p_duracao: Math.max(0, Math.round(d.duracaoSegundos || 0)),
    p_observacao: d.observacao || null,
    p_proximo: d.proximoPasso || null,
    p_quem: d.quem || null,
    p_origem: d.origem || 'crm',
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function ligacoesDoLead(leadId: string): Promise<Ligacao[]> {
  const { data, error } = await supabase
    .from('crm_ligacoes')
    .select('*')
    .eq('lead_id', leadId)
    .order('quando', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as Ligacao[]) || []
}

export async function carregarLigacoes(de?: string, ate?: string): Promise<Ligacao[]> {
  let q = supabase.from('crm_ligacoes').select('*').order('quando', { ascending: false }).limit(2000)
  if (de) q = q.gte('quando', de + 'T00:00:00')
  if (ate) q = q.lte('quando', ate + 'T23:59:59')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as Ligacao[]) || []
}

export type ResumoLigacoes = {
  total: number
  atendidas: number
  minutos: number
  pessoas_faladas: number
  por_dia: { dia: string; total: number; atendidas: number }[]
  por_pessoa: { quem: string; total: number; atendidas: number; minutos: number }[]
  por_resultado: { resultado: string; total: number }[]
}

export async function resumoLigacoes(de?: string, ate?: string): Promise<ResumoLigacoes> {
  const { data, error } = await supabase.rpc('crm_ligacoes_resumo', {
    p_de: de || null,
    p_ate: ate || null,
  })
  if (error) throw new Error(error.message)
  return data as ResumoLigacoes
}
