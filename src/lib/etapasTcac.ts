/**
 * Cronograma físico-financeiro do TCAC.
 *
 * O termo de compromisso lista as etapas que o cliente vai executar, cada uma
 * com prazo e custo. Atrasar aqui não atrasa entrega nenhuma do escritório —
 * deixa o cliente irregular perante o Corpo de Bombeiros. Por isso a etapa
 * vencendo precisa aparecer com a mesma força de uma renovação.
 */

import { supabase } from './supabase'
import { somarMeses } from '../types'

export type EtapaTcac = {
  id: string
  project_id: string
  ordem: number
  descricao: string
  data_inicio: string | null
  data_termino: string | null
  custo: number | null
  concluida: boolean
  data_conclusao: string | null
  observacao: string | null
}

export async function carregarEtapas(projectId: string): Promise<EtapaTcac[]> {
  const { data } = await supabase
    .from('project_stages')
    .select('*')
    .eq('project_id', projectId)
    .order('ordem')
  return (data as EtapaTcac[]) || []
}

/** Prazo em dias corridos entre início e término, como no termo. */
export function prazoEmDias(e: EtapaTcac): number | null {
  if (!e.data_inicio || !e.data_termino) return null
  const ms =
    new Date(`${e.data_termino}T00:00:00`).getTime() -
    new Date(`${e.data_inicio}T00:00:00`).getTime()
  return Math.round(ms / 86400000)
}

/**
 * Cria as etapas encadeadas a partir de uma data.
 *
 * O padrão do TCAC é anual e em sequência: o término de uma etapa é o início da
 * próxima. Foi assim no exemplo de 730 dias — 11/11/2025 a 11/11/2026, depois
 * até 11/11/2027. Gerar assim poupa digitar seis datas sem errar nenhuma.
 */
export async function gerarEtapas(params: {
  projectId: string
  inicio: string
  quantidade: number
  mesesPorEtapa: number
  custoTotal?: number
  substituir?: boolean
}): Promise<void> {
  const { projectId, inicio, quantidade, mesesPorEtapa, custoTotal, substituir } = params

  if (substituir) {
    await supabase.from('project_stages').delete().eq('project_id', projectId)
  }

  const { data: existentes } = await supabase
    .from('project_stages')
    .select('ordem')
    .eq('project_id', projectId)
    .order('ordem', { ascending: false })
    .limit(1)
  const base = ((existentes as { ordem: number }[])?.[0]?.ordem || 0) + 1

  // O custo total divide igual; a sobra de centavos vai para a última etapa,
  // senão a soma das linhas não bate com o total do termo.
  const linhas = []
  let acumulado = 0
  let dataInicio = inicio

  for (let i = 0; i < quantidade; i++) {
    const termino = somarMeses(dataInicio, mesesPorEtapa)
    let custo: number | null = null
    if (custoTotal && custoTotal > 0) {
      custo =
        i === quantidade - 1
          ? Number((custoTotal - acumulado).toFixed(2))
          : Number((custoTotal / quantidade).toFixed(2))
      acumulado += custo
    }

    linhas.push({
      project_id: projectId,
      ordem: base + i,
      descricao: `Etapa ${base + i}`,
      data_inicio: dataInicio,
      data_termino: termino,
      custo,
    })
    dataInicio = termino
  }

  const { error } = await supabase.from('project_stages').insert(linhas)
  if (error) throw new Error(error.message)
}

/**
 * Lê a tabela colada do termo.
 *
 * O cronograma vem num Word ou PDF; copiar e colar a tabela é mais rápido e
 * menos sujeito a erro do que redigitar linha por linha. Aceita separação por
 * tabulação (Word e Excel) ou por ponto e vírgula.
 */
export function lerTabelaColada(texto: string): {
  descricao: string
  inicio: string | null
  termino: string | null
  custo: number | null
}[] {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const resultado = []
  for (const linha of linhas) {
    const celulas = linha.split(/\t|;/).map((c) => c.trim())
    if (celulas.length < 2) continue

    // Cabeçalho da tabela do termo: pula.
    if (/^(etapa|n[ºo°]?)$/i.test(celulas[0]) && /descri/i.test(celulas[1] || '')) continue

    const datas = celulas.map(paraIso).filter(Boolean) as string[]
    const custo = celulas.map(paraNumero).filter((n) => n !== null && n > 1000)[0] ?? null

    // A descrição é a célula mais longa que não é data nem valor.
    const descricao =
      celulas
        .filter((c) => !paraIso(c) && paraNumero(c) === null)
        .sort((a, b) => b.length - a.length)[0] || 'Etapa'

    resultado.push({
      descricao,
      inicio: datas[0] || null,
      termino: datas[1] || null,
      custo: custo as number | null,
    })
  }
  return resultado
}

/** "11/11/2025" -> "2025-11-11". Devolve nulo quando não é data. */
function paraIso(texto: string): string | null {
  const m = texto.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (!m) return null
  const [, d, mes, a] = m
  const ano = a.length === 2 ? `20${a}` : a
  return `${ano}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** "R$ 40.000,00" -> 40000. Devolve nulo quando não é número. */
function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/r\$|\s/gi, '')
  if (!/^[\d.,]+$/.test(limpo) || !limpo) return null
  const n = Number(limpo.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

/** Etapas em aberto que vencem dentro da janela, com o projeto junto. */
export async function carregarEtapasAVencer(dias: number) {
  const ate = new Date()
  ate.setDate(ate.getDate() + dias)

  const { data } = await supabase
    .from('project_stages')
    .select('*, projects(id, nome, numero, tipo, responsavel)')
    .eq('concluida', false)
    .not('data_termino', 'is', null)
    .lte('data_termino', ate.toISOString().slice(0, 10))
    .order('data_termino')

  return (data as (EtapaTcac & {
    projects: { id: string; nome: string; numero: number | null; tipo: string | null; responsavel: string | null } | null
  })[]) || []
}
