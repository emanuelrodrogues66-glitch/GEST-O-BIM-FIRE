/**
 * Divisão dos pontos de um projeto entre quem trabalhou nele.
 *
 * Um projeto tocado por duas pessoas dava 5 pontos inteiros para uma só. Aqui
 * os pontos são repartidos na proporção das horas que cada um lançou no
 * "assumir projeto".
 *
 * Três regras seguram o resultado de pé:
 *
 * 1. Vale só a partir da data de corte. Meses já fechados não podem mudar de
 *    ranking depois que a equipe viu o número.
 * 2. Sem hora lançada, o responsável cadastrado leva tudo — ponto de trabalho
 *    feito não pode sumir por falha de registro.
 * 3. O ADM pode sobrescrever a divisão de um projeto, e fica registrado.
 */

import { supabase } from './supabase'

/**
 * A partir daqui a divisão proporcional vale.
 *
 * Antes disso as horas do banco eram estimativa do preenchimento retroativo,
 * não medida de esforço — repartir ponto com base nelas seria repartir chute.
 */
export const CORTE_RATEIO = '2026-09-01'

export type FatiaDoProjeto = {
  colaborador: string
  /** Fração de 0 a 1. */
  fracao: number
  /** Pontos já arredondados, somando exatamente a pontuação do projeto. */
  pontos: number
  horas: number
}

export type RateioDoProjeto = {
  fatias: FatiaDoProjeto[]
  /** Como a divisão foi decidida — muda a mensagem mostrada no cartão. */
  origem: 'horas' | 'responsavel' | 'manual' | 'antes-do-corte'
  totalHoras: number
  /** Verdadeiro quando alguma hora usada veio do preenchimento automático. */
  temHoraEstimada: boolean
}

export type LancamentoDeHora = {
  responsavel: string
  horas: number | null
  horas_estimadas: boolean
}

/**
 * Reparte um total em fatias que somam exatamente o total.
 *
 * Arredondar cada fatia isolada faz 5 pontos virarem 5,01 ou 4,99. Aqui a
 * sobra do arredondamento vai para quem tem o maior resto — método do maior
 * resto, o mesmo usado para distribuir cadeiras por proporção de votos.
 */
export function repartirExato(total: number, pesos: number[], casas = 2): number[] {
  const somaPesos = pesos.reduce((s, p) => s + p, 0)
  if (somaPesos <= 0 || pesos.length === 0) return pesos.map(() => 0)

  const fator = Math.pow(10, casas)
  const alvo = Math.round(total * fator)

  const brutos = pesos.map((p) => (p / somaPesos) * alvo)
  const baixo = brutos.map((b) => Math.floor(b))
  let sobra = alvo - baixo.reduce((s, b) => s + b, 0)

  // Quem tem a maior parte fracionária recebe a sobra, um centésimo por vez.
  const ordem = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto)

  for (let k = 0; k < ordem.length && sobra > 0; k++, sobra--) {
    baixo[ordem[k].i] += 1
  }

  return baixo.map((b) => b / fator)
}

/**
 * Calcula a divisão de um projeto.
 *
 * `aprovacao` decide se a regra nova se aplica; sem data de aprovação, o
 * projeto ainda não pontuou e a divisão é só uma prévia pelas horas.
 */
export function calcularRateio(params: {
  pontos: number
  responsavelCadastrado: string | null
  aprovacao: string | null
  lancamentos: LancamentoDeHora[]
  manual?: { colaborador: string; fracao: number }[]
}): RateioDoProjeto {
  const { pontos, responsavelCadastrado, aprovacao, lancamentos, manual } = params

  // --- Ajuste manual do ADM tem prioridade sobre tudo ---
  if (manual && manual.length > 0) {
    const pesos = manual.map((m) => m.fracao)
    const valores = repartirExato(pontos, pesos)
    const somaFracoes = pesos.reduce((s, p) => s + p, 0) || 1
    return {
      origem: 'manual',
      totalHoras: 0,
      temHoraEstimada: false,
      fatias: manual.map((m, i) => ({
        colaborador: m.colaborador,
        fracao: m.fracao / somaFracoes,
        pontos: valores[i],
        horas: 0,
      })),
    }
  }

  const tudoDoResponsavel = (origem: RateioDoProjeto['origem']): RateioDoProjeto => ({
    origem,
    totalHoras: 0,
    temHoraEstimada: false,
    fatias: responsavelCadastrado
      ? [{ colaborador: responsavelCadastrado, fracao: 1, pontos, horas: 0 }]
      : [],
  })

  // --- Projeto aprovado antes do corte segue a regra antiga ---
  if (aprovacao && aprovacao < CORTE_RATEIO) return tudoDoResponsavel('antes-do-corte')

  // --- Soma as horas por pessoa ---
  const porPessoa = new Map<string, { horas: number; estimada: boolean }>()
  for (const l of lancamentos) {
    const h = Number(l.horas) || 0
    if (h <= 0) continue
    const nome = l.responsavel.trim()
    const atual = porPessoa.get(nome) || { horas: 0, estimada: false }
    atual.horas += h
    if (l.horas_estimadas) atual.estimada = true
    porPessoa.set(nome, atual)
  }

  if (porPessoa.size === 0) return tudoDoResponsavel('responsavel')

  const nomes = Array.from(porPessoa.keys())
  const horas = nomes.map((n) => porPessoa.get(n)!.horas)
  const totalHoras = horas.reduce((s, h) => s + h, 0)
  const valores = repartirExato(pontos, horas)

  return {
    origem: 'horas',
    totalHoras,
    temHoraEstimada: nomes.some((n) => porPessoa.get(n)!.estimada),
    fatias: nomes
      .map((nome, i) => ({
        colaborador: nome,
        fracao: horas[i] / totalHoras,
        pontos: valores[i],
        horas: horas[i],
      }))
      .sort((a, b) => b.pontos - a.pontos),
  }
}

/** Lançamentos de hora de um projeto, para a prévia no cartão. */
export async function carregarLancamentos(projectId: string): Promise<LancamentoDeHora[]> {
  const { data } = await supabase
    .from('project_activities')
    .select('responsavel, horas, horas_estimadas')
    .eq('project_id', projectId)
  return (data as LancamentoDeHora[]) || []
}

export async function carregarRateioManual(
  projectId: string
): Promise<{ colaborador: string; fracao: number }[]> {
  const { data } = await supabase
    .from('project_point_shares')
    .select('colaborador, fracao')
    .eq('project_id', projectId)
  return (data as { colaborador: string; fracao: number }[]) || []
}

/** "0.4032" -> "40,3%". */
export function porcentagem(fracao: number): string {
  return `${(fracao * 100).toFixed(1).replace('.', ',')}%`
}

/** Pontos com duas casas, sem zeros à toa: 3,74 · 5 · 2,5. */
export function pontosLegiveis(v: number): string {
  const arredondado = Math.round(v * 100) / 100
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
}
