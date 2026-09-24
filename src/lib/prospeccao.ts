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
  perfil: string | null
  tipo: string | null
  titulo_whatsapp: string | null
  /** Cliente, parceiro ou negociação que já existe na casa. */
  ja_na_base: string | null
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

/**
 * A forma unica do numero: so digitos, sem o 55 na frente.
 *
 * O banco guarda assim. Se a planilha vier com DDI e a fila sem, o mesmo
 * telefone vira dois contatos e a carencia de 30 dias deixa de reconhecer
 * quem ja foi procurado.
 */
export function numeroDaLista(v: string) {
  const d = soDigitos(v)
  if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') return d.slice(2)
  return d
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

export type Resumo = {
  total: number
  fila: number
  enviados: number
  falharam: number
  responderam: number
  no_funil: number
  bloqueados: number
  ja_na_base: number
}

/**
 * Contagem feita no banco.
 *
 * Campanha de dez mil contatos não cabe no navegador, e a consulta volta
 * cortada em mil sem avisar — somar linha carregada daria números errados
 * com cara de certos.
 */
export async function carregarResumo(campanhaId: string): Promise<Resumo> {
  const vazio: Resumo = {
    total: 0, fila: 0, enviados: 0, falharam: 0,
    responderam: 0, no_funil: 0, bloqueados: 0, ja_na_base: 0,
  }
  const { data, error } = await supabase.rpc('prospeccao_resumo', { p_campanha: campanhaId })
  if (error) return vazio
  const linha = ((data as Resumo[]) || [])[0]
  return linha ? { ...vazio, ...linha } : vazio
}

/** Só uma janela da campanha: o resumo é quem sabe o tamanho real. */
/** Volta a campanha inteira para a fila, sem apagar o histórico. */
export async function reiniciarCampanha(campanhaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('prospeccao_reiniciar_campanha', {
    p_campanha: campanhaId,
  })
  if (error) throw error
  return Number(data) || 0
}

/**
 * Apaga a campanha e a lista dela.
 *
 * Exige o nome digitado porque não tem volta: são milhares de contatos, e a
 * campanha errada no seletor é um clique de distância.
 */
export async function apagarCampanha(campanhaId: string, nomeDigitado: string): Promise<number> {
  const { data, error } = await supabase.rpc('prospeccao_apagar_campanha', {
    p_campanha: campanhaId,
    p_nome_confirmacao: nomeDigitado,
  })
  if (error) throw error
  return Number(data) || 0
}

export async function carregarContatos(
  campanhaId: string,
  situacao?: string,
  limite = 300
): Promise<Contato[]> {
  let q = supabase
    .from('prospeccao_contatos')
    .select('*')
    .eq('campanha_id', campanhaId)
  if (situacao && situacao !== 'todos') q = q.eq('situacao', situacao)
  const { data, error } = await q.order('created_at', { ascending: true }).limit(limite)
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
    const tel = numeroDaLista(linha.telefone)
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

const DDD_UF: Record<string, string> = {
  '11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP',
  '21':'RJ','22':'RJ','24':'RJ','27':'ES','28':'ES',
  '31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG',
  '41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR',
  '47':'SC','48':'SC','49':'SC',
  '51':'RS','53':'RS','54':'RS','55':'RS',
  '61':'DF','62':'GO','64':'GO','63':'TO','65':'MT','66':'MT','67':'MS','68':'AC','69':'RO',
  '71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','79':'SE',
  '81':'PE','87':'PE','82':'AL','83':'PB','84':'RN','85':'CE','88':'CE','86':'PI','89':'PI',
  '91':'PA','93':'PA','94':'PA','92':'AM','97':'AM','95':'RR','96':'AP','98':'MA','99':'MA',
}

/** O estado sai do DDD. Lista comprada não traz cidade, mas traz o número. */
export function ufDoTelefone(tel: string): string | null {
  const d = numeroDaLista(tel)
  if (d.length < 10) return null
  return DDD_UF[d.slice(0, 2)] || null
}

export type AndamentoImportacao = {
  feitos: number
  total: number
  campanha: string
}

export type ResultadoPorEstado = {
  inseridos: number
  semTelefone: number
  bloqueados: number
  jaEstavam: number
  porCampanha: { nome: string; quantos: number }[]
}

/**
 * Importa uma lista grande distribuindo por estado.
 *
 * Lista comprada vem toda junta, com número de Rondônia no meio do de São
 * Paulo. Separar na mão é inviável; o DDD já diz o estado. Cada estado vira
 * (ou reaproveita) a campanha "UF — sufixo", e quem já está na campanha não
 * entra de novo.
 */
export async function importarPorEstado(
  linhas: ContatoBruto[],
  sufixo: string,
  aoAndar?: (a: AndamentoImportacao) => void
): Promise<ResultadoPorEstado> {
  const r: ResultadoPorEstado = { inseridos: 0, semTelefone: 0, bloqueados: 0, jaEstavam: 0, porCampanha: [] }
  const rotulo = sufixo.trim() || 'Importados'

  // Quem já está em qualquer campanha, ou pediu para não receber, fica de
  // fora — a peneira roda no banco, que é quem conhece as outras campanhas.
  const candidatos = Array.from(
    new Set(linhas.map((l) => numeroDaLista(l.telefone)).filter((t) => t.length >= 10))
  )
  const novos = new Set<string>()
  for (let i = 0; i < candidatos.length; i += 1000) {
    const pedaco = candidatos.slice(i, i + 1000)
    const { data, error } = await supabase.rpc('prospeccao_filtrar_novos', { p_telefones: pedaco })
    if (error) throw error
    for (const x of (data as { telefone: string }[]) || []) novos.add(x.telefone)
  }
  r.jaEstavam = candidatos.length - novos.size

  // Agrupa por estado antes de falar com o banco.
  const porUf = new Map<string, Map<string, ContatoBruto>>()
  for (const linha of linhas) {
    const tel = numeroDaLista(linha.telefone)
    const uf = ufDoTelefone(tel)
    if (!uf || tel.length < 10) {
      r.semTelefone++
      continue
    }
    // Já contado em jaEstavam, lá em cima.
    if (!novos.has(tel)) continue
    if (!porUf.has(uf)) porUf.set(uf, new Map())
    porUf.get(uf)!.set(tel, linha)
  }

  const total = Array.from(porUf.values()).reduce((s, m) => s + m.size, 0)
  let feitos = 0

  for (const [uf, mapa] of Array.from(porUf.entries()).sort()) {
    const nome = uf + ' — ' + rotulo
    if (aoAndar) aoAndar({ feitos, total, campanha: nome })

    const { data: achada } = await supabase
      .from('prospeccao_campanhas')
      .select('id')
      .eq('nome', nome)
      .maybeSingle()

    let campanhaId = (achada as { id: string } | null)?.id
    if (!campanhaId) {
      const { data: criada, error } = await supabase
        .from('prospeccao_campanhas')
        .insert({ nome, modelo: '', responsavel: null, status: 'aberta' })
        .select('id')
        .single()
      if (error) throw error
      campanhaId = (criada as { id: string }).id
    }

    const novos = Array.from(mapa.entries()).map(([tel, linha]) => ({
      campanha_id: campanhaId,
      telefone: tel,
      nome: linha.nome || null,
      empresa: linha.empresa || null,
      cidade: linha.cidade || null,
      tipo: tel.length === 11 ? 'celular' : 'fixo',
    }))

    // Em pedaços: quarenta mil linhas numa requisição só derruba o navegador.
    for (let i = 0; i < novos.length; i += 500) {
      const pedaco = novos.slice(i, i + 500)
      const { error } = await supabase
        .from('prospeccao_contatos')
        .upsert(pedaco, { onConflict: 'campanha_id,telefone', ignoreDuplicates: true })
      if (error) throw error
      feitos += pedaco.length
      if (aoAndar) aoAndar({ feitos, total, campanha: nome })
    }
    r.porCampanha.push({ nome, quantos: mapa.size })
  }

  r.inseridos = feitos
  return r
}

export type LinhaPainel = {
  campanha_id: string
  nome: string
  status: string
  total: number
  fila: number
  enviados: number
  falharam: number
  responderam: number
  no_funil: number
  ja_na_base: number
  trabalhados: number
  percentual: number
  primeiro_envio: string | null
  ultimo_envio: string | null
}

export async function carregarPainel(): Promise<LinhaPainel[]> {
  const { data, error } = await supabase.rpc('prospeccao_painel')
  if (error) throw error
  return (data as LinhaPainel[]) || []
}

export type DiaDeEnvio = { dia: string; enviados: number; responderam: number }

export async function carregarEnviosPorDia(dias = 30): Promise<DiaDeEnvio[]> {
  const { data, error } = await supabase.rpc('prospeccao_envios_por_dia', { p_dias: dias })
  if (error) return []
  return (data as DiaDeEnvio[]) || []
}

export type Vinculos = {
  negociacoes: { id: string; nome: string; valor: number | null; responsavel: string | null; funil: string | null; etapa: string | null }[]
  clientes: { id: string; nome: string; cidade: string | null }[]
  parceiros: { id: string; nome: string }[]
  projetos: { id: string; numero: number | null; nome: string; status: string | null; responsavel: string | null }[]
}

export const SEM_VINCULO: Vinculos = { negociacoes: [], clientes: [], parceiros: [], projetos: [] }

/** O que a casa já tem sobre esse número: negociação, cliente, parceiro, projeto. */
export async function carregarVinculos(telefone: string): Promise<Vinculos> {
  const { data, error } = await supabase.rpc('prospeccao_vinculos', { p_telefone: telefone })
  if (error) return SEM_VINCULO
  const linha = ((data as Vinculos[]) || [])[0]
  return linha ? { ...SEM_VINCULO, ...linha } : SEM_VINCULO
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
