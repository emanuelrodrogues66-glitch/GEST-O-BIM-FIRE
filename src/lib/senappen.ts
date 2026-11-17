import { useEffect } from 'react'
import { supabase } from './supabase'

/**
 * SENAPPEN — checklist de revisão por bloco.
 *
 * Veio de um app separado, que rodava num servidor Node com os dados num
 * arquivo JSON e uma senha única compartilhada por toda a equipe. Aqui ele
 * passa a usar o que o sistema já tem: login individual, permissão por
 * perfil e o banco. A diferença que mais importa é a autoria — antes o nome
 * de quem fez e de quem revisou dependia da pessoa escolher o próprio nome
 * numa caixinha, e qualquer um podia escolher qualquer um.
 *
 * O tempo real que antes era uma conexão aberta com o servidor (SSE) agora é
 * o Realtime do Postgres: a marcação de um aparece na tela do outro sozinha.
 */

export type ItemModelo = { k: string; t: string }

export type Modelo = {
  id: string
  nome: string
  itens: ItemModelo[]
  ordem: number
}

export type Bloco = {
  id: string
  codigo: string
  nome: string
  /** Quais checklists estão aplicados neste bloco. */
  modelos: string[]
  ordem: number
}

export type Situacao = 'p' | 'f' | 'r' | 'c'

export type Marcacao = {
  bloco_id: string
  chave: string
  modelo_id: string | null
  status: Situacao
  feito_por: string | null
  feito_em: string | null
  revisado_por: string | null
  revisado_em: string | null
  nota: string | null
}

export type Sessao = {
  id: string
  bloco_id: string | null
  pessoa: string
  tipo: string | null
  inicio: string
  fim: string | null
  motivo: string | null
  editado: boolean
}

export type Registro = {
  id: string
  quando: string
  pessoa: string | null
  bloco_id: string | null
  texto: string | null
}

export type Presente = {
  id: string
  pessoa: string
  bloco_id: string | null
  modelo_id: string | null
  ativo: boolean
  visto_em: string
}

export const SITUACOES: Record<Situacao, string> = {
  p: 'Pendente',
  f: 'Feito',
  r: 'Revisado',
  c: 'Corrigir',
}

export function nomeDoBloco(b: Bloco): string {
  return 'BL ' + b.codigo + ' - ' + b.nome
}

/**
 * Chave da marcação.
 *
 * É a mesma do app antigo de propósito: k puro no checklist interno e
 * m:<modelo>:<k> nos demais. Assim o backup .json que a equipe já tem
 * continua valendo quando for restaurado aqui.
 */
export function chaveDoItem(modeloId: string, k: string): string {
  return modeloId === 'internal' ? k : 'm:' + modeloId + ':' + k
}

// ----------------------------------------------------------------- carregar

/** Busca de mil em mil: o PostgREST corta em 1000 linhas sem avisar. */
async function todos<T>(tabela: string, ordem: string, crescente = true): Promise<T[]> {
  const PAGINA = 1000
  const lista: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .order(ordem, { ascending: crescente })
      .range(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    const lote = (data as T[]) || []
    lista.push(...lote)
    if (lote.length < PAGINA) break
  }
  return lista
}

export type Tudo = {
  modelos: Modelo[]
  blocos: Bloco[]
  marcacoes: Marcacao[]
  sessoes: Sessao[]
  registros: Registro[]
}

export async function carregarTudo(): Promise<Tudo> {
  const [modelos, blocos, marcacoes, sessoes, registros] = await Promise.all([
    todos<Modelo>('sen_modelos', 'ordem'),
    todos<Bloco>('sen_blocos', 'ordem'),
    todos<Marcacao>('sen_itens', 'bloco_id'),
    todos<Sessao>('sen_sessoes', 'inicio', false),
    todos<Registro>('sen_log', 'quando', false),
  ])
  return { modelos, blocos, marcacoes, sessoes, registros }
}

// ----------------------------------------------------------------- escrever

export async function registrar(pessoa: string, blocoId: string | null, texto: string) {
  await supabase.from('sen_log').insert({ pessoa, bloco_id: blocoId, texto })
}

export async function marcar(
  blocoId: string,
  chave: string,
  modeloId: string,
  campos: Partial<Marcacao>
) {
  const { error } = await supabase.from('sen_itens').upsert(
    {
      bloco_id: blocoId,
      chave,
      modelo_id: modeloId,
      atualizado_em: new Date().toISOString(),
      ...campos,
    },
    { onConflict: 'bloco_id,chave' }
  )
  if (error) throw new Error(error.message)
}

/** Marca vários itens de uma vez e devolve quantos mudaram de verdade. */
export async function marcarEmLote(linhas: Partial<Marcacao>[]) {
  if (!linhas.length) return 0
  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('sen_itens')
    .upsert(linhas.map((l) => ({ ...l, atualizado_em: agora })), { onConflict: 'bloco_id,chave' })
  if (error) throw new Error(error.message)
  return linhas.length
}

export async function iniciarSessao(blocoId: string, pessoa: string, tipo: string) {
  const { error } = await supabase
    .from('sen_sessoes')
    .insert({ bloco_id: blocoId, pessoa, tipo, inicio: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function pararSessao(id: string, motivo: string) {
  const { error } = await supabase
    .from('sen_sessoes')
    .update({ fim: new Date().toISOString(), motivo })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function salvarSessao(id: string, inicio: string, fim: string | null) {
  const { error } = await supabase
    .from('sen_sessoes')
    .update({ inicio, fim, editado: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirSessao(id: string) {
  const { error } = await supabase.from('sen_sessoes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function salvarModelo(m: Partial<Modelo> & { id: string }) {
  const { error } = await supabase.from('sen_modelos').upsert(
    { ...m, atualizado_em: new Date().toISOString() },
    { onConflict: 'id' }
  )
  if (error) throw new Error(error.message)
}

export async function excluirModelo(id: string) {
  const { error } = await supabase.from('sen_modelos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function criarBloco(codigo: string, nome: string, modelo: string, ordem: number) {
  const { error } = await supabase.from('sen_blocos').insert({
    id: 'bl' + codigo.toLowerCase(),
    codigo,
    nome,
    modelos: [modelo],
    ordem,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('Já existe um bloco com esse número.')
    throw new Error(error.message)
  }
}

export async function definirModelosDoBloco(id: string, modelos: string[]) {
  const { error } = await supabase.from('sen_blocos').update({ modelos }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirBloco(id: string) {
  const { error } = await supabase.from('sen_blocos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ----------------------------------------------------------------- presença

/**
 * Quem está na tela agora, e em qual bloco.
 *
 * Some sozinho: quem fecha a página para de bater, e a lista só mostra quem
 * deu sinal nos últimos 45 segundos. Sem isso o painel enche de gente que foi
 * embora ontem.
 */
export async function baterPresenca(p: Omit<Presente, 'visto_em'>) {
  await supabase.from('sen_presenca').upsert(
    { ...p, visto_em: new Date().toISOString() },
    { onConflict: 'id' }
  )
}

export async function sairDaPresenca(id: string) {
  await supabase.from('sen_presenca').delete().eq('id', id)
}

export async function carregarPresenca(): Promise<Presente[]> {
  const corte = new Date(Date.now() - 45000).toISOString()
  const { data } = await supabase
    .from('sen_presenca')
    .select('*')
    .gte('visto_em', corte)
    .order('pessoa')
  return (data as Presente[]) || []
}

// --------------------------------------------------------------- tempo real

const TABELAS = ['sen_modelos', 'sen_blocos', 'sen_itens', 'sen_sessoes', 'sen_log', 'sen_presenca']

/**
 * Avisa quando qualquer coisa muda no banco, de quem quer que seja.
 *
 * Uma assinatura só para as seis tabelas. O componente decide o que recarregar
 * — aqui não se tenta adivinhar o que mudou, porque errar isso deixa duas
 * pessoas vendo telas diferentes, que é exatamente o que este app existe para
 * evitar.
 */
export function useTempoReal(aoMudar: () => void) {
  useEffect(() => {
    const canal = supabase.channel('senappen')
    for (const tabela of TABELAS) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, aoMudar)
    }
    canal.subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ------------------------------------------------------------------ formato

export function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/** 01:23:45 — para o cronômetro correndo na tela. */
export function relogio(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  return doisDigitos(Math.floor(s / 3600)) + ':' + doisDigitos(Math.floor(s / 60) % 60) + ':' + doisDigitos(s % 60)
}

/** 2h05min — para texto corrido, onde o relógio cheio atrapalha a leitura. */
export function duracao(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const s = t % 60
  if (h) return h + 'h' + doisDigitos(m) + 'min'
  if (m) return m + 'min' + doisDigitos(s) + 's'
  return s + 's'
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function horaCheia(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function dataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') + ' ' + hora(iso) : ''
}
