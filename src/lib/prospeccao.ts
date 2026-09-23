import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { exportarParaExcel } from './exportarExcel'

/**
 * Prospecção ativa.
 *
 * A lista é do escritório, não do celular de quem vende: fica no sistema,
 * respeita quem pediu para não receber mais, não repete o mesmo número em
 * 30 dias e — o que importa de verdade — transforma cada conversa aberta em
 * negociação no funil. O envio continua com a pessoa: a tela abre o WhatsApp
 * com o texto pronto, quem aperta enviar é quem está falando.
 */

export type Campanha = {
  id: string
  nome: string
  modelo: string
  responsavel: string | null
  status: string
  created_at: string
}

export type Contato = {
  id: string
  campanha_id: string
  telefone: string
  nome: string | null
  empresa: string | null
  cidade: string | null
  cliente_id: string | null
  situacao: string
  abordado_em: string | null
  abordado_por: string | null
  respondeu_em: string | null
  observacao: string | null
  lead_id: string | null
  mensagem: string | null
  erro: string | null
}

export const SITUACOES: Record<string, string> = {
  fila: 'Na fila',
  enviado: 'Enviado',
  falhou: 'Erro no envio',
  abordado: 'Abordado',
  respondeu: 'Respondeu',
  sem_retorno: 'Sem retorno',
  descartado: 'Descartado',
  bloqueado: 'Não quer receber',
}

export const CORES: Record<string, string> = {
  fila: 'bg-slate-100 text-slate-600',
  enviado: 'bg-sky-100 text-sky-700',
  falhou: 'bg-rose-100 text-rose-700',
  abordado: 'bg-amber-100 text-amber-700',
  respondeu: 'bg-emerald-100 text-emerald-700',
  sem_retorno: 'bg-slate-100 text-slate-400',
  descartado: 'bg-slate-100 text-slate-400',
  bloqueado: 'bg-rose-100 text-rose-700',
}

export function soDigitos(v: string | null | undefined) {
  return (v || '').replace(/[^0-9]/g, '')
}

/** Telefone do jeito que o WhatsApp entende: com o 55 na frente. */
export function comDdi(v: string) {
  const d = soDigitos(v)
  if (d.length > 11 && d.slice(0, 2) === '55') return d
  return '55' + d
}

export function telefoneBonito(v: string) {
  let d = soDigitos(v)
  if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2)
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 3) + ' ' + d.slice(3, 7) + '-' + d.slice(7)
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return v
}

/** Troca os campos do modelo pelos dados do contato. */
export function mensagem(modelo: string, c: Contato) {
  const primeiro = (c.nome || '').trim().split(' ')[0]
  return (modelo || '')
    .split('{{nome}}')
    .join(primeiro)
    .split('{{empresa}}')
    .join(c.empresa || '')
    .split('{{cidade}}')
    .join(c.cidade || '')
    .trim()
}

export function linkWhatsapp(c: Contato, modelo: string) {
  return 'https://wa.me/' + comDdi(c.telefone) + '?text=' + encodeURIComponent(mensagem(modelo, c))
}

export async function nomeDoUsuario(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return ''
  const { data: p } = await supabase
    .from('user_profiles')
    .select('nome, email')
    .eq('user_id', data.user.id)
    .maybeSingle()
  const perfil = p as { nome: string | null; email: string | null } | null
  return (perfil && perfil.nome) || data.user.email || ''
}

export async function carregarCampanhas(): Promise<Campanha[]> {
  const { data, error } = await supabase
    .from('prospeccao_campanhas')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Campanha[]) || []
}

export async function criarCampanha(nome: string, modelo: string, responsavel: string) {
  const { data, error } = await supabase
    .from('prospeccao_campanhas')
    .insert({ nome, modelo, responsavel: responsavel || null, status: 'aberta' })
    .select()
    .single()
  if (error) throw error
  return data as Campanha
}

export async function mudarCampanha(id: string, patch: Partial<Campanha>) {
  const { error } = await supabase.from('prospeccao_campanhas').update(patch).eq('id', id)
  if (error) throw error
}

export async function carregarContatos(campanhaId: string): Promise<Contato[]> {
  const { data, error } = await supabase
    .from('prospeccao_contatos')
    .select('*')
    .eq('campanha_id', campanhaId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as Contato[]) || []
}

export type ContatoBruto = {
  telefone: string
  nome?: string
  empresa?: string
  cidade?: string
}

export type ResultadoImportacao = {
  inseridos: number
  semTelefone: number
  repetidos: number
  bloqueados: number
}

function chaveDaColuna(k: string) {
  return String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Lê a planilha do jeito que ela veio.
 *
 * Ninguém monta arquivo pensando no sistema: a coluna vem como "Telefone",
 * "Celular", "WhatsApp" ou "Fone", e o que importa é achar o número. Por isso
 * a leitura procura pelo título da coluna, não pela posição dela.
 */
export async function lerPlanilha(arquivo: File): Promise<ContatoBruto[]> {
  const buffer = await arquivo.arrayBuffer()
  const pasta = XLSX.read(buffer, { type: 'array', raw: false })
  const aba = pasta.Sheets[pasta.SheetNames[0]]
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '' })
  return linhas.map((linha) => {
    const campos: Record<string, string> = {}
    for (const k of Object.keys(linha)) campos[chaveDaColuna(k)] = String(linha[k] ?? '').trim()
    const achar = (...nomes: string[]) => {
      for (const n of nomes) if (campos[n]) return campos[n]
      return ''
    }
    return {
      telefone: achar('telefone', 'celular', 'whatsapp', 'fone', 'numero', 'contato', 'phone'),
      nome: achar('nome', 'responsavel', 'name'),
      empresa: achar('empresa', 'razao social', 'nome fantasia', 'company'),
      cidade: achar('cidade', 'municipio', 'city'),
    }
  })
}

/** O mesmo, para quem prefere colar a lista na mão. */
export function linhasDoTexto(texto: string): ContatoBruto[] {
  return (texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linha) => {
      const campos = linha.split(/[;\t,]/).map((c) => c.trim())
      return { telefone: campos[0] || '', nome: campos[1], empresa: campos[2], cidade: campos[3] }
    })
}

/** Planilha com os títulos certos, para quem quiser começar do zero. */
export function baixarModeloPlanilha() {
  exportarParaExcel<ContatoBruto>({
    nomeArquivo: 'modelo-prospeccao.xlsx',
    nomeAba: 'Contatos',
    colunas: [
      { titulo: 'Telefone', valor: (l) => l.telefone, largura: 18 },
      { titulo: 'Nome', valor: (l) => l.nome || '', largura: 22 },
      { titulo: 'Empresa', valor: (l) => l.empresa || '', largura: 30 },
      { titulo: 'Cidade', valor: (l) => l.cidade || '', largura: 18 },
    ],
    linhas: [
      { telefone: '43999998888', nome: 'João', empresa: 'Metalúrgica Alfa', cidade: 'Londrina' },
    ],
  })
}

/**
 * Entra na fila quem tem telefone, não está repetido na campanha e não pediu
 * para não receber mais.
 */
export async function importarContatos(
  campanhaId: string,
  linhas: ContatoBruto[]
): Promise<ResultadoImportacao> {
  const r: ResultadoImportacao = { inseridos: 0, semTelefone: 0, repetidos: 0, bloqueados: 0 }
  if (!linhas.length) return r

  const [jaTem, recusaram] = await Promise.all([
    supabase.from('prospeccao_contatos').select('telefone').eq('campanha_id', campanhaId),
    supabase.from('prospeccao_optout').select('telefone'),
  ])
  const existentes = new Set(((jaTem.data as { telefone: string }[]) || []).map((x) => x.telefone))
  const bloqueados = new Set(((recusaram.data as { telefone: string }[]) || []).map((x) => x.telefone))

  const novos: Record<string, unknown>[] = []
  for (const linha of linhas) {
    const tel = soDigitos(linha.telefone)
    if (tel.length < 10) {
      r.semTelefone++
      continue
    }
    if (bloqueados.has(tel)) {
      r.bloqueados++
      continue
    }
    if (existentes.has(tel)) {
      r.repetidos++
      continue
    }
    existentes.add(tel)
    novos.push({
      campanha_id: campanhaId,
      telefone: tel,
      nome: linha.nome || null,
      empresa: linha.empresa || null,
      cidade: linha.cidade || null,
    })
  }
  if (novos.length) {
    const { error } = await supabase.from('prospeccao_contatos').insert(novos)
    if (error) throw error
    r.inseridos = novos.length
  }
  return r
}

/** Cadência: o banco responde se esse número pode ser procurado agora. */
export async function podeAbordar(telefone: string): Promise<{ pode: boolean; motivo: string }> {
  const { data, error } = await supabase.rpc('prospeccao_pode_abordar', { p_telefone: telefone })
  if (error) return { pode: true, motivo: '' }
  const linha = ((data as { pode: boolean; motivo: string }[]) || [])[0]
  return linha || { pode: true, motivo: '' }
}

/** Abriu a conversa: o contato vira negociação no funil de cliente final. */
export async function registrarNoCrm(contatoId: string, por: string) {
  const { data, error } = await supabase.rpc('prospeccao_registrar_no_crm', {
    p_contato: contatoId,
    p_por: por || null,
  })
  if (error) throw error
  return ((data as { lead_id: string; criou_lead: boolean }[]) || [])[0]
}

/**
 * Conversa aberta na mao, sem o plugin. Marca o contato, mas nao cria lead:
 * quem decide se vira negociacao e a pessoa, no botao Virar lead.
 */
export async function marcarAbordado(c: Contato, por: string) {
  const { error } = await supabase
    .from('prospeccao_contatos')
    .update({
      situacao: c.situacao === 'fila' ? 'abordado' : c.situacao,
      abordado_em: c.abordado_em || new Date().toISOString(),
      abordado_por: c.abordado_por || por || null,
    })
    .eq('id', c.id)
  if (error) throw error
}

export async function descartar(id: string) {
  await mudarSituacao(id, 'descartado')
}

export async function mudarSituacao(id: string, situacao: string) {
  const patch: Record<string, unknown> = { situacao }
  if (situacao === 'respondeu') patch.respondeu_em = new Date().toISOString()
  const { error } = await supabase.from('prospeccao_contatos').update(patch).eq('id', id)
  if (error) throw error
}

/** Pediu para não receber mais: sai da fila e não volta em campanha nenhuma. */
export async function naoQuerReceber(c: Contato, motivo: string) {
  await supabase.from('prospeccao_optout').upsert({ telefone: c.telefone, motivo: motivo || null })
  await mudarSituacao(c.id, 'bloqueado')
}

export function resumo(contatos: Contato[]) {
  const conta = (s: string) => contatos.filter((c) => c.situacao === s).length
  return {
    total: contatos.length,
    fila: conta('fila'),
    enviados: conta('enviado'),
    falharam: conta('falhou'),
    abordados: contatos.filter((c) => c.abordado_em).length,
    responderam: conta('respondeu'),
    bloqueados: conta('bloqueado'),
    negociacoes: contatos.filter((c) => c.lead_id).length,
  }
}
