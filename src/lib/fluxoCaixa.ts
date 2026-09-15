import { supabase } from './supabase'

/**
 * Fluxo de caixa: quando o dinheiro dos contratos deve entrar.
 *
 * Boa parte dos pagamentos daqui não tem data marcada — tem fase. "Metade na
 * aprovação" não é dia 10, é quando aprovar. Como o planejamento do projeto já
 * diz quando cada fase deve acontecer, é dele que sai a previsão; o banco faz
 * essa conta na view `v_fluxo_caixa`, para a tela e qualquer relatório futuro
 * enxergarem o mesmo número.
 *
 * Data combinada com o cliente sempre vence a previsão do planejamento:
 * planejamento é estimativa, combinado é combinado.
 */

export type OrigemPrevisao = 'combinada' | 'planejamento' | 'sem_data'

export type LinhaFluxo = {
  id: string
  project_id: string
  projeto_numero: number | null
  projeto_nome: string
  projeto_status: string
  projeto_categoria: string
  parceiro: string | null
  cliente: string | null
  ordem: number
  descricao: string
  gatilho: string
  valor: number
  /** Data acertada à mão, quando existe. */
  data_combinada: string | null
  /** A que vale: a combinada, ou a que veio do planejamento. */
  data_prevista: string | null
  origem_previsao: OrigemPrevisao
  data_recebimento: string | null
  recebida: boolean
  observacao: string | null
}

export async function carregarFluxo(): Promise<LinhaFluxo[]> {
  const PAGINA = 1000
  const todas: LinhaFluxo[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('v_fluxo_caixa')
      .select('*')
      .order('data_prevista', { nullsFirst: false })
      .range(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    const lote = (data as LinhaFluxo[]) || []
    todas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todas
}

/**
 * O mês em que a parcela conta.
 *
 * Já recebida conta no mês em que caiu — é fato. Em aberto conta no mês da
 * previsão. Sem previsão não conta em mês nenhum: entra numa lista à parte,
 * porque somar num mês qualquer seria inventar.
 */
export function mesDaLinha(l: LinhaFluxo): string | null {
  const d = l.recebida ? l.data_recebimento : l.data_prevista
  return d ? d.slice(0, 7) : null
}

export type MesDoFluxo = {
  mes: string
  previsto: number
  recebido: number
  linhas: LinhaFluxo[]
}

export function agruparPorMes(linhas: LinhaFluxo[]): MesDoFluxo[] {
  const mapa = new Map<string, MesDoFluxo>()
  for (const l of linhas) {
    const mes = mesDaLinha(l)
    if (!mes) continue
    if (!mapa.has(mes)) mapa.set(mes, { mes, previsto: 0, recebido: 0, linhas: [] })
    const m = mapa.get(mes)!
    m.linhas.push(l)
    if (l.recebida) m.recebido += Number(l.valor) || 0
    else m.previsto += Number(l.valor) || 0
  }
  return Array.from(mapa.values()).sort((a, b) => a.mes.localeCompare(b.mes))
}

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-')
  const nomes = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  return `${nomes[Number(m) - 1]} de ${a}`
}

export function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** De onde veio a data, em palavras — o número vale pelo que se sabe dele. */
export const ROTULO_ORIGEM: Record<OrigemPrevisao, string> = {
  combinada: 'data combinada',
  planejamento: 'pelo planejamento',
  sem_data: 'sem previsão',
}

// ------------------------------------------------------------------ comissão

export type ComissaoLiberada = {
  lead_id: string
  project_id: string
  primeiro_recebimento: string | null
  total_recebido: number
  parcelas: number
  parcelas_recebidas: number
  liberada: boolean
}

/**
 * Quais comissões já podem ser pagas.
 *
 * A regra do escritório: a comissão sai depois que o cliente paga a primeira
 * vez. Quem lança o recebimento é o financeiro, no cartão do projeto — aqui
 * só se lê, para o comercial não precisar abrir cartão por cartão.
 */
export async function carregarComissoesLiberadas(): Promise<Map<string, ComissaoLiberada>> {
  const { data } = await supabase.from('v_comissoes_liberadas').select('*')
  const mapa = new Map<string, ComissaoLiberada>()
  for (const c of (data as ComissaoLiberada[]) || []) mapa.set(c.lead_id, c)
  return mapa
}
