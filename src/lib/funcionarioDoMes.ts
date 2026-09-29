import { supabase } from './supabase'

/**
 * O quadro do funcionario do mes.
 *
 * Era uma planilha com figurinhas que a equipe imprimia e colava na parede.
 * Aqui ele vira historico: cada mes guarda quem ganhou e com quantos pontos.
 *
 * Ate julho/2026 o numero era digitado a mao, porque o sistema ainda nao
 * rodava. De agosto em diante ele vem do ranking de pontos do mes, e so muda
 * se alguem corrigir por cima.
 */
export type MesPremiado = {
  id: string
  ano: number
  mes: number
  colaborador: string
  pontos: number | null
  pontos_manual: boolean
  observacao: string | null
}

export const MESES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
]

/** Quando o sistema passou a ter os pontos de verdade. */
export const INICIO_DO_SISTEMA = { ano: 2026, mes: 8 }

export function pontosVemDoSistema(ano: number, mes: number) {
  if (ano > INICIO_DO_SISTEMA.ano) return true
  if (ano < INICIO_DO_SISTEMA.ano) return false
  return mes >= INICIO_DO_SISTEMA.mes
}

/** Figurinhas que a equipe ja usava na planilha. */
const FIGURINHAS: Record<string, string> = {
  samira: '/equipe/samira.png',
  samuel: '/equipe/samuel.png',
  aimee: '/equipe/aimee.png',
}

function primeiroNome(nome: string) {
  return (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)[0]
}

/** Caminho da figurinha, ou nulo quando a pessoa ainda nao tem uma. */
export function figurinha(nome: string): string | null {
  return FIGURINHAS[primeiroNome(nome)] || null
}

/** Duas letras para quem nao tem figurinha. */
export function iniciais(nome: string) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export async function carregarAno(ano: number): Promise<MesPremiado[]> {
  const { data, error } = await supabase
    .from('funcionario_do_mes')
    .select('*')
    .eq('ano', ano)
    .order('mes')
  if (error) throw new Error(error.message)
  return (data as MesPremiado[]) || []
}

export async function salvarMes(dados: {
  ano: number
  mes: number
  colaborador: string
  pontos: number | null
  pontosManual: boolean
  registradoPor?: string | null
}) {
  const { error } = await supabase.from('funcionario_do_mes').upsert(
    {
      ano: dados.ano,
      mes: dados.mes,
      colaborador: dados.colaborador.trim(),
      pontos: dados.pontos,
      pontos_manual: dados.pontosManual,
      registrado_por: dados.registradoPor || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ano,mes' }
  )
  if (error) throw new Error(error.message)
}

export async function limparMes(ano: number, mes: number) {
  const { error } = await supabase
    .from('funcionario_do_mes')
    .delete()
    .eq('ano', ano)
    .eq('mes', mes)
  if (error) throw new Error(error.message)
}
