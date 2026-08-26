/**
 * Anexos de tarefa no Google Drive.
 *
 * A regra de onde o arquivo cai vive aqui, e não na tela, porque três lugares
 * precisam dela: quem cria a tarefa, quem edita, e quem muda a tarefa de
 * projeto (e aí os arquivos precisam acompanhar).
 */

import { supabase } from './supabase'
import { encontrarOuCriarPasta, enviarArquivo, moverArquivo, obterToken } from './googleDrive'

/** Onde ficam os anexos das tarefas que não pertencem a nenhum projeto. */
export const PASTA_TAREFAS_GERAIS = 'Tarefas Gerais'
/** Subpasta dentro da pasta do projeto. */
export const PASTA_TAREFAS_DO_PROJETO = 'Tarefas'

export type AnexoDaTarefa = {
  id: string
  nome: string
  drive_link: string | null
  drive_file_id: string | null
  mime_type: string | null
}

export function ehImagem(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith('image/')
}

export function urlMiniatura(driveFileId: string, largura = 320): string {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${largura}`
}

/** Nome de arquivo para print colado, com carimbo de data para não repetir. */
function nomeDoPrint(mime: string): string {
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `print-${carimbo}.${ext}`
}

/** Extrai as imagens de um Ctrl+V, já com nome de arquivo decente. */
export function imagensDaAreaDeTransferencia(e: React.ClipboardEvent): File[] {
  const arquivos: File[] = []
  for (const item of Array.from(e.clipboardData?.items || [])) {
    if (!item.type.startsWith('image/')) continue
    const bruto = item.getAsFile()
    if (bruto) arquivos.push(new File([bruto], nomeDoPrint(item.type), { type: item.type }))
  }
  return arquivos
}

/** Nome da pasta do projeto no Drive: o mesmo do cartão. */
async function nomeDaPastaDoProjeto(projectId: string): Promise<string> {
  const { data: cliente } = await supabase
    .from('project_clients')
    .select('nome_pasta')
    .eq('project_id', projectId)
    .maybeSingle()

  const daFicha = ((cliente as any)?.nome_pasta || '').trim()
  if (daFicha) return daFicha

  // Sem linha de cliente ainda, o nome do cartão serve de pasta do mesmo jeito.
  const { data: projeto } = await supabase
    .from('projects')
    .select('nome')
    .eq('id', projectId)
    .maybeSingle()
  return ((projeto as any)?.nome || '').trim() || 'Projeto sem nome'
}

/**
 * Descobre a pasta de destino no Drive.
 *
 * Tarefa de projeto vai para <pasta do projeto>/Tarefas. Tarefa geral vai toda
 * para a mesma pasta, porque não há projeto a que se prender.
 */
export async function pastaDeDestino(token: string, projectId: string | null): Promise<string> {
  if (!projectId) return encontrarOuCriarPasta(token, PASTA_TAREFAS_GERAIS)
  const pastaProjeto = await encontrarOuCriarPasta(token, await nomeDaPastaDoProjeto(projectId))
  return encontrarOuCriarPasta(token, PASTA_TAREFAS_DO_PROJETO, pastaProjeto)
}

/**
 * Sobe os arquivos e registra cada um como anexo da tarefa.
 * Devolve os anexos gravados, na ordem em que subiram.
 */
export async function subirAnexos(
  taskId: string,
  projectId: string | null,
  arquivos: File[],
  onProgresso?: (texto: string) => void
): Promise<AnexoDaTarefa[]> {
  if (arquivos.length === 0) return []

  const token = await obterToken(true)
  const destino = await pastaDeDestino(token, projectId)
  const gravados: AnexoDaTarefa[] = []

  for (let i = 0; i < arquivos.length; i++) {
    onProgresso?.(
      arquivos.length === 1
        ? `Enviando ${arquivos[i].name}...`
        : `Enviando ${i + 1} de ${arquivos.length}...`
    )
    const enviado = await enviarArquivo(token, destino, arquivos[i])
    const { data, error } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        task_id: taskId,
        categoria: 'outros',
        nome: enviado.name || arquivos[i].name,
        drive_file_id: enviado.id,
        drive_link: enviado.webViewLink || `https://drive.google.com/file/d/${enviado.id}/view`,
        mime_type: enviado.mimeType || arquivos[i].type,
        tamanho: Number(enviado.size) || arquivos[i].size,
      })
      .select('id, nome, drive_link, drive_file_id, mime_type')
      .single()
    if (error) throw new Error(error.message)
    if (data) gravados.push(data as AnexoDaTarefa)
  }

  onProgresso?.('')
  return gravados
}

/**
 * Leva os anexos da tarefa para a pasta certa depois que ela mudou de projeto.
 * Devolve quantos arquivos foram movidos.
 */
export async function moverAnexos(
  taskId: string,
  projectId: string | null,
  onProgresso?: (texto: string) => void
): Promise<number> {
  const { data: arquivos } = await supabase
    .from('project_files')
    .select('id, drive_file_id')
    .eq('task_id', taskId)

  const lista = ((arquivos as { id: string; drive_file_id: string | null }[]) || []).filter(
    (a) => a.drive_file_id
  )
  if (lista.length === 0) return 0

  const token = await obterToken(true)
  const destino = await pastaDeDestino(token, projectId)

  for (let i = 0; i < lista.length; i++) {
    onProgresso?.(`Movendo ${i + 1} de ${lista.length}...`)
    await moverArquivo(token, lista[i].drive_file_id as string, destino)
    // O vínculo com o projeto acompanha o arquivo, senão ele some do cartão.
    await supabase.from('project_files').update({ project_id: projectId }).eq('id', lista[i].id)
  }

  onProgresso?.('')
  return lista.length
}
