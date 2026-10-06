import { supabase } from './supabase'

/**
 * O que sustenta a tela 'Meu dia' e os indicadores de tempo do funil.
 *
 * Negocio nao morre de uma vez: ele para numa etapa e ninguem percebe. Aqui
 * se descobre quando cada negociacao entrou na etapa em que esta — pelo
 * proprio historico de movimentacoes, sem coluna nova.
 */
export async function entradasNaEtapa(leadIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (leadIds.length === 0) return mapa

  // Em lotes: a lista de ids vai na URL, e URL tem limite de tamanho.
  const lote = 200
  for (let i = 0; i < leadIds.length; i += lote) {
    const { data } = await supabase
      .from('crm_lead_activities')
      .select('lead_id, quando')
      .eq('tipo', 'etapa')
      .in('lead_id', leadIds.slice(i, i + lote))
      .order('quando', { ascending: false })
    for (const a of (data as { lead_id: string; quando: string }[]) || []) {
      if (!mapa.has(a.lead_id)) mapa.set(a.lead_id, a.quando)
    }
  }
  return mapa
}

/** Dias corridos desde uma data; nulo vira nulo. */
export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

export type Meta = {
  id?: string
  ano: number
  mes: number
  pessoa: string
  meta_valor: number
  meta_ligacoes: number
}

export async function carregarMetas(ano: number, mes: number): Promise<Meta[]> {
  const { data, error } = await supabase
    .from('crm_metas')
    .select('*')
    .eq('ano', ano)
    .eq('mes', mes)
    .order('pessoa')
  if (error) throw new Error(error.message)
  return (data as Meta[]) || []
}

export async function salvarMeta(m: Meta) {
  const { error } = await supabase.from('crm_metas').upsert(
    {
      ano: m.ano,
      mes: m.mes,
      pessoa: m.pessoa.trim(),
      meta_valor: Number(m.meta_valor) || 0,
      meta_ligacoes: Number(m.meta_ligacoes) || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ano,mes,pessoa' }
  )
  if (error) throw new Error(error.message)
}

export type Duplicada = {
  chave: string
  tipo: 'telefone' | 'cliente'
  quantas: number
  detalhe: {
    id: string
    nome: string
    cliente: string | null
    etapa: string | null
    valor: number | null
    responsavel: string | null
    criado_em: string
  }[]
}

export async function negociacoesDuplicadas(): Promise<Duplicada[]> {
  const { data, error } = await supabase.rpc('crm_negociacoes_duplicadas')
  if (error) throw new Error(error.message)
  return (data as Duplicada[]) || []
}
