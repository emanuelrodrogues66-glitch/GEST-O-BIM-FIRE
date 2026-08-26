/**
 * Financeiro do escritório.
 *
 * Tudo aqui é visível só para o ADM — a proteção real está nas políticas de
 * acesso do banco, e não na tela: esconder o botão não impediria alguém de ler
 * o dado por fora. Como todos usam o mesmo login no dia a dia, o salário de
 * cada um ficaria à vista sem isso.
 */

export type TeamCost = {
  id: string
  colaborador: string
  vinculo: string
  vigencia_inicio: string
  vigencia_fim: string | null
  salario_base: number | null
  encargos_pct: number | null
  custo_mensal: number
  dias_uteis_mes: number
  observacao: string | null
}

export type ProjectFinance = {
  project_id: string
  valor_contrato: number | null
  sem_custo_apurado: boolean
  observacao: string | null
}

export type ProjectInstallment = {
  id: string
  project_id: string
  ordem: number
  descricao: string
  gatilho: Gatilho
  percentual: number | null
  valor: number
  data_prevista: string | null
  data_recebimento: string | null
  observacao: string | null
}

export type ProjectExpense = {
  id: string
  project_id: string
  data: string
  categoria: string
  descricao: string | null
  valor: number
}

export type Gatilho =
  | 'entrada'
  | 'protocolo'
  | 'aprovacao'
  | 'entrega'
  | 'vistoria'
  | 'avista'
  | 'outro'

/**
 * O que precisa acontecer para a parcela poder ser cobrada.
 * `campo` aponta a data que o sistema já registra e que dispara o gatilho
 * sozinho; sem ela, a liberação é no olho.
 */
export const GATILHOS: {
  valor: Gatilho
  rotulo: string
  campo: 'data_contrato' | 'data_protocolo' | 'data_aprovacao' | null
}[] = [
  { valor: 'entrada', rotulo: 'Entrada (assinatura)', campo: 'data_contrato' },
  { valor: 'protocolo', rotulo: 'Protocolo', campo: 'data_protocolo' },
  { valor: 'aprovacao', rotulo: 'Aprovação', campo: 'data_aprovacao' },
  { valor: 'entrega', rotulo: 'Entrega ao cliente', campo: null },
  { valor: 'vistoria', rotulo: 'Vistoria', campo: null },
  { valor: 'avista', rotulo: 'À vista', campo: 'data_contrato' },
  { valor: 'outro', rotulo: 'Outro', campo: null },
]

export function rotuloDoGatilho(g: string): string {
  return GATILHOS.find((x) => x.valor === g)?.rotulo || g
}

/** O padrão da casa. Varia por cliente, então é só o ponto de partida. */
export const PARCELAMENTO_PADRAO: { descricao: string; gatilho: Gatilho; percentual: number }[] = [
  { descricao: 'Entrada', gatilho: 'entrada', percentual: 30 },
  { descricao: 'Protocolo', gatilho: 'protocolo', percentual: 30 },
  { descricao: 'Aprovação', gatilho: 'aprovacao', percentual: 40 },
]

export const CATEGORIAS_DESPESA = [
  'ART / RRT',
  'Taxa do Corpo de Bombeiros',
  'Deslocamento',
  'Terceirizado',
  'Cartório',
  'Outros',
]

export const VINCULOS = ['CLT', 'PJ', 'Sócio', 'Estágio']

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function reais(v: number | null | undefined): string {
  return BRL.format(Number(v) || 0)
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`
}

/** Salário + encargos. Quem já tem o custo cheio do contador ignora isto. */
export function custoComEncargos(salario: number, encargosPct: number): number {
  return salario * (1 + encargosPct / 100)
}

/** Custo de um dia de trabalho da pessoa, na tabela vigente. */
export function custoPorDia(c: TeamCost): number {
  const dias = Number(c.dias_uteis_mes) || 21
  return Number(c.custo_mensal) / dias
}

/**
 * Custo/dia da pessoa na data pedida.
 * Aumento não reescreve o passado: cada dia usa a faixa que valia nele.
 */
export function custoNaData(custos: TeamCost[], colaborador: string, data: string): number | null {
  const nome = colaborador.trim().toLowerCase()
  const faixa = custos.find(
    (c) =>
      c.colaborador.trim().toLowerCase() === nome &&
      c.vigencia_inicio <= data &&
      (!c.vigencia_fim || c.vigencia_fim >= data)
  )
  return faixa ? custoPorDia(faixa) : null
}

export function vigente(c: TeamCost, hoje = new Date().toISOString().slice(0, 10)): boolean {
  return c.vigencia_inicio <= hoje && (!c.vigencia_fim || c.vigencia_fim >= hoje)
}
