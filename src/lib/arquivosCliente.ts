import { supabase } from './supabase'

/**
 * Projeto novo so anda depois que alguem responder se o cliente mandou
 * arquivos. Se mandou, esses arquivos precisam estar anexados no cartao antes
 * de o projeto sair de Pendente — assim ninguem comeca a desenhar em cima de
 * material que nao foi guardado em lugar nenhum.
 *
 * A regra nasceu junto com a coluna exige_arquivos_cliente: os projetos que ja
 * existiam ficaram de fora, senao o quadro inteiro travaria de uma vez.
 */
export type MotivoTrava = 'sem_resposta' | 'sem_arquivos'
export type TravaArquivos = MotivoTrava | null

export const AVISO_TRAVA: Record<MotivoTrava, string> = {
  sem_resposta:
    'Antes de tirar o projeto de Pendente, responda no cartao se o cliente mandou arquivos.',
  sem_arquivos:
    'Voce marcou que o cliente mandou arquivos. Anexe esses arquivos na aba "Dados do cliente", em "Arquivos recebidos do cliente", antes de seguir.',
}

/** A conta em si, sem ir ao banco — serve para a tela reagir na hora. */
export function travaDosArquivos(
  exige: boolean,
  resposta: boolean | null | undefined,
  temArquivos: boolean
): TravaArquivos {
  if (!exige) return null
  if (resposta === null || resposta === undefined) return 'sem_resposta'
  if (resposta && !temArquivos) return 'sem_arquivos'
  return null
}

/** Ja existe algum anexo do que o cliente mandou? */
export async function temArquivosDoCliente(projectId: string): Promise<boolean> {
  const { count } = await supabase
    .from('project_files')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('categoria', 'cliente')
  return (count || 0) > 0
}

/** A mesma pergunta conferida no banco — vale para o quadro e para a lista. */
export async function travaDoProjeto(projectId: string): Promise<TravaArquivos> {
  const { data } = await supabase
    .from('projects')
    .select('exige_arquivos_cliente, recebeu_arquivos_cliente')
    .eq('id', projectId)
    .maybeSingle()
  if (!data) return null
  const p = data as { exige_arquivos_cliente: boolean | null; recebeu_arquivos_cliente: boolean | null }
  if (!p.exige_arquivos_cliente) return null
  if (p.recebeu_arquivos_cliente === null) return 'sem_resposta'
  if (p.recebeu_arquivos_cliente && !(await temArquivosDoCliente(projectId))) return 'sem_arquivos'
  return null
}
