import { supabase } from './supabase'

/**
 * Como os colegas veem cada pessoa.
 *
 * O check-in proprio continua: o que esta tela acrescenta e a percepcao de
 * quem trabalha ao lado. O dado util e a diferenca entre os dois — quem diz
 * que esta bem e e visto mal e justamente quem merece uma conversa.
 *
 * Ninguem le voto individual, nem o ADM: tudo vem somado pelas funcoes do
 * banco. O nome de quem votou existe so para impedir voto repetido e deixar a
 * pessoa corrigir o que respondeu no mesmo dia.
 */
export type ColegaParaVotar = {
  colega: string
  ja_votei: boolean
  humor: string | null
  nota: number | null
}

export async function colegasDoDia(colaborador: string, pin: string): Promise<ColegaParaVotar[]> {
  const { data, error } = await supabase.rpc('humor_colegas_do_dia', {
    p_colaborador: colaborador,
    p_pin: pin,
  })
  if (error) throw new Error(error.message)
  return (data as ColegaParaVotar[]) || []
}

export async function votarNoColega(params: {
  colaborador: string
  pin: string
  colega: string
  humor: string
  nota: number
  comentario?: string
}) {
  const { error } = await supabase.rpc('humor_votar', {
    p_colaborador: params.colaborador,
    p_pin: params.pin,
    p_colega: params.colega,
    p_humor: params.humor,
    p_nota: params.nota,
    p_comentario: params.comentario || null,
  })
  if (error) throw new Error(error.message)
}

export type MeuResumo = { votos: number; media: number | null; mostra: boolean }

export async function meuResumo(colaborador: string, pin: string): Promise<MeuResumo | null> {
  const { data, error } = await supabase.rpc('humor_meu_resumo', {
    p_colaborador: colaborador,
    p_pin: pin,
  })
  if (error) throw new Error(error.message)
  const lista = (data as MeuResumo[]) || []
  return lista[0] || null
}

export type LinhaPercepcao = {
  colaborador: string
  dias_com_checkin: number
  media_propria: number | null
  votos_recebidos: number
  media_colegas: number | null
  diferenca: number | null
}

export async function percepcaoDaEquipe(de?: string, ate?: string): Promise<LinhaPercepcao[]> {
  const { data, error } = await supabase.rpc('humor_percepcao', {
    p_de: de || null,
    p_ate: ate || null,
  })
  if (error) throw new Error(error.message)
  return (data as LinhaPercepcao[]) || []
}
