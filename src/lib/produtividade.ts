import { supabase } from './supabase'

/**
 * Quanto cada pessoa produz por hora, pelo que ela ja fez.
 *
 * A conta reparte cada projeto entre quem lancou hora nele, na proporcao das
 * horas: quem fez 60% das horas leva 60% dos pontos, da area e do valor do
 * contrato. Depois divide pelo total de horas da pessoa.
 *
 * Pontos, area e valor so entram quando o projeto esta concluido — antes
 * disso o trabalho ainda nao virou entrega, e o numero ficaria otimista.
 */
export type ProducaoPorHora = {
  colaborador: string
  horas: number
  horas_estimadas: number
  lancamentos: number
  projetos_tocados: number
  projetos_equivalentes: number
  pontos: number
  m2: number
  valor: number
  pontos_por_hora: number | null
  m2_por_hora: number | null
  valor_por_hora: number | null
  custo_hora: number | null
  margem_por_hora: number | null
}

export async function producaoPorHora(
  de?: string,
  ate?: string,
  soReais = false
): Promise<ProducaoPorHora[]> {
  const { data, error } = await supabase.rpc('rh_producao_por_hora', {
    p_de: de || null,
    p_ate: ate || null,
    p_so_reais: soReais,
  })
  if (error) throw new Error(error.message)
  return ((data as ProducaoPorHora[]) || []).map((r) => ({
    ...r,
    horas: Number(r.horas) || 0,
    horas_estimadas: Number(r.horas_estimadas) || 0,
    pontos: Number(r.pontos) || 0,
    m2: Number(r.m2) || 0,
    valor: Number(r.valor) || 0,
    projetos_equivalentes: Number(r.projetos_equivalentes) || 0,
    pontos_por_hora: r.pontos_por_hora === null ? null : Number(r.pontos_por_hora),
    m2_por_hora: r.m2_por_hora === null ? null : Number(r.m2_por_hora),
    valor_por_hora: r.valor_por_hora === null ? null : Number(r.valor_por_hora),
    custo_hora: r.custo_hora === null ? null : Number(r.custo_hora),
    margem_por_hora: r.margem_por_hora === null ? null : Number(r.margem_por_hora),
  }))
}

/** Horas medias por tipo de servico, para orcar prazo com base no que ja foi. */
export async function horasPorTipo(): Promise<
  { tipo: string; projetos: number; horas_media: number; pontos_media: number }[]
> {
  const { data, error } = await supabase.rpc('rh_horas_por_tipo')
  if (error) throw new Error(error.message)
  return (data as { tipo: string; projetos: number; horas_media: number; pontos_media: number }[]) || []
}
