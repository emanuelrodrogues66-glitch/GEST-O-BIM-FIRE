import { supabase } from './supabase'

/**
 * Cadastro de parceiros que se oferecem.
 *
 * O formulário é público e só escreve. A leitura fica trancada no comercial,
 * pelas políticas do banco — quem descobrir o endereço da página consegue se
 * cadastrar, não consegue ver a lista de quem já se cadastrou.
 */

export type Fornecedor = {
  id: string
  nome: string
  profissao: string | null
  tipos_projeto: string[] | null
  ja_trabalhou: string | null
  telefone: string | null
  email: string | null
  estado: string | null
  cidade: string | null
  comentarios: string | null
  origem: string | null
  situacao: string
  observacao_interna: string | null
  parceiro_id: string | null
  criado_em: string
}

export const SITUACOES_FORNECEDOR: Record<string, string> = {
  novo: 'Novo',
  avaliando: 'Avaliando',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export const CORES_FORNECEDOR: Record<string, string> = {
  novo: 'bg-sky-100 text-sky-700',
  avaliando: 'bg-amber-100 text-amber-700',
  aprovado: 'bg-emerald-100 text-emerald-700',
  recusado: 'bg-slate-100 text-slate-400',
}

export const PROFISSOES = [
  'Engenheiro Civil',
  'Arquiteto',
  'Engenheiro Mecânico',
  'Engenheiro Eletricista',
  'Engenheiro de Segurança do Trabalho',
  'Engenheiro Ambiental',
  'Técnico em Edificações',
  'Técnico em Eletrotécnica',
  'Designer de Interiores',
  'Construtor',
  'Topógrafo',
  'Contador',
]

export const TIPOS_DE_PROJETO = [
  'Arquitetônico',
  'Estrutural',
  'Hidrossanitário',
  'Elétrico - baixa tensão',
  'Elétrico - alta tensão',
  'SPDA',
  'Ar-condicionado',
  'Prevenção a incêndio',
  'Interiores',
  'Paisagismo',
  'Gás',
  'Laudos e perícias',
  'Regularização de imóveis',
  'Execução de obra',
  'Topografia',
]

export const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export const RELACAO = ['Não', 'Sim', 'Pretendemos Fazer']

export type EnvioDoFormulario = {
  nome: string
  profissao: string
  tipos_projeto: string[]
  ja_trabalhou: string
  telefone: string
  email: string
  estado: string
  cidade: string
  comentarios: string
}

function soDigitos(v: string) {
  return (v || '').replace(/[^0-9]/g, '')
}

/** Mesma forma do resto do sistema: dígitos, sem o 55 na frente. */
export function normalizarTelefone(v: string) {
  let d = soDigitos(v)
  if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') d = d.slice(2)
  if (d.length === 10 && d[2] === '9') d = d.slice(0, 2) + '9' + d.slice(2)
  return d
}

export async function enviarFormulario(dados: EnvioDoFormulario) {
  const tel = normalizarTelefone(dados.telefone)
  if (!dados.nome.trim()) throw new Error('Escreva o seu nome.')
  if (tel.length < 10) throw new Error('O telefone precisa do DDD. Exemplo: (43) 99999-8888.')

  const { error } = await supabase.from('fornecedores').insert({
    nome: dados.nome.trim(),
    profissao: dados.profissao.trim() || null,
    tipos_projeto: dados.tipos_projeto.length ? dados.tipos_projeto : null,
    ja_trabalhou: dados.ja_trabalhou || null,
    telefone: tel,
    email: dados.email.trim() || null,
    estado: dados.estado || null,
    cidade: dados.cidade.trim() || null,
    comentarios: dados.comentarios.trim() || null,
    origem: 'formulario',
  })
  if (error) throw error
}

export async function carregarFornecedores(): Promise<Fornecedor[]> {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(2000)
  if (error) throw error
  return (data as Fornecedor[]) || []
}

export async function mudarFornecedor(id: string, patch: Partial<Fornecedor>) {
  const { error } = await supabase
    .from('fornecedores')
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Copia para o cadastro de parceiros, onde o resto do sistema enxerga. */
export async function virarParceiro(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('fornecedor_para_parceiro', { p_fornecedor: id })
  if (error) throw error
  return String(data)
}

export function telefoneBonito(v: string | null) {
  const d = normalizarTelefone(v || '')
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 3) + ' ' + d.slice(3, 7) + '-' + d.slice(7)
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return v || ''
}
