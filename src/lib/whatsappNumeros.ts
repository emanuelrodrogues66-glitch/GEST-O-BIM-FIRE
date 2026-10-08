import { supabase } from './supabase'

/**
 * Os chips de onde saem as mensagens, e quando cada um caiu.
 *
 * Ate aqui tudo saia do mesmo numero e ninguem anotava nada: quando o WhatsApp
 * bloqueava, sobrava a lembranca de que parou naquele dia. Com o numero gravado
 * em cada envio da para descobrir qual e o volume seguro, por chip.
 */
export type NumeroEnvio = {
  id: string
  numero: string
  apelido: string | null
  responsavel: string | null
  ativo: boolean
  observacao: string | null
}

export type LinhaPainelNumero = {
  numero: string
  apelido: string | null
  responsavel: string | null
  ativo: boolean
  envios_hoje: number
  envios_7dias: number
  envios_30dias: number
  envios_total: number
  quedas: number
  ultima_queda: string | null
  dias_desde_a_queda: number | null
}

export type Queda = {
  id: string
  numero: string
  tipo: string
  inicio: string
  fim: string | null
  mensagens_no_dia: number | null
  mensagens_7dias: number | null
  observacao: string | null
  registrado_por: string | null
}

export const TIPOS_DE_QUEDA = [
  { valor: 'aviso', rotulo: 'Aviso do WhatsApp' },
  { valor: 'limitado', rotulo: 'Limitado (não envia para quem não é contato)' },
  { valor: 'banido', rotulo: 'Banido' },
]

export function rotuloDaQueda(v: string) {
  return TIPOS_DE_QUEDA.find((t) => t.valor === v)?.rotulo || v
}

/** (43) 9 9843-9725 */
export function numeroBonito(n: string) {
  const d = String(n || '').replace(/\D/g, '')
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d[2] + ' ' + d.slice(3, 7) + '-' + d.slice(7)
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return n
}

export async function carregarNumeros(): Promise<NumeroEnvio[]> {
  const { data, error } = await supabase.from('whatsapp_numeros').select('*').order('ativo', { ascending: false }).order('numero')
  if (error) throw new Error(error.message)
  return (data as NumeroEnvio[]) || []
}

export async function salvarNumero(n: Partial<NumeroEnvio>) {
  const campos = {
    numero: String(n.numero || '').replace(/\D/g, ''),
    apelido: n.apelido || null,
    responsavel: n.responsavel || null,
    ativo: n.ativo !== false,
    observacao: n.observacao || null,
    updated_at: new Date().toISOString(),
  }
  if (!campos.numero) throw new Error('Digite o número com DDD.')
  const { error } = n.id
    ? await supabase.from('whatsapp_numeros').update(campos).eq('id', n.id)
    : await supabase.from('whatsapp_numeros').insert(campos)
  if (error) throw new Error(error.message)
}

export async function painelDeNumeros(): Promise<LinhaPainelNumero[]> {
  const { data, error } = await supabase.rpc('whatsapp_painel')
  if (error) throw new Error(error.message)
  return (data as LinhaPainelNumero[]) || []
}

export async function carregarQuedas(): Promise<Queda[]> {
  const { data, error } = await supabase
    .from('whatsapp_quedas')
    .select('*')
    .order('inicio', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as Queda[]) || []
}

export async function salvarQueda(q: Partial<Queda>) {
  const campos = {
    numero: String(q.numero || '').replace(/\D/g, ''),
    tipo: q.tipo || 'limitado',
    inicio: q.inicio,
    fim: q.fim || null,
    mensagens_no_dia: q.mensagens_no_dia ?? null,
    observacao: q.observacao || null,
  }
  const { error } = q.id
    ? await supabase.from('whatsapp_quedas').update(campos).eq('id', q.id)
    : await supabase.from('whatsapp_quedas').insert(campos)
  if (error) throw new Error(error.message)
}

export async function apagarQueda(id: string) {
  const { error } = await supabase.from('whatsapp_quedas').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function enviosPorDia(dias = 60): Promise<{ dia: string; numero: string; envios: number; caiu: boolean }[]> {
  const { data, error } = await supabase.rpc('whatsapp_envios_por_dia', { p_dias: dias })
  if (error) throw new Error(error.message)
  return (data as { dia: string; numero: string; envios: number; caiu: boolean }[]) || []
}
