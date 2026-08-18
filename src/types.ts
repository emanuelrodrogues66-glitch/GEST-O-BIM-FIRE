export type Project = {
  id: string
  numero: number | null
  categoria: string | null
  nome: string
  responsavel: string | null
  status: string
  tipo: string | null
  pts: number | null
  m2: number | null
  prazo_categoria: string | null
  data_prazo: string | null
  data_inicio: string
  observacoes: string | null
  created_at: string
  updated_at: string
}

export type DailyProgress = {
  id: string
  project_id: string
  data: string
  letra: string
}

export type ProjectTask = {
  id: string
  project_id: string
  nome: string
  responsavel: string | null
  data_inicio: string | null
  data_prazo: string
  status: string
  data_conclusao: string | null
  justificativa: string | null
  ordem: number
  created_at: string
  updated_at: string
}

export const TASK_STATUS = ['Pendente', 'Em andamento', 'Concluído'] as const

export const TASK_STATUS_COLORS: Record<string, string> = {
  Pendente: 'bg-slate-100 text-slate-600 border-slate-300',
  'Em andamento': 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Concluído': 'bg-emerald-100 text-emerald-700 border-emerald-300',
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Tarefa está atrasada se o prazo já passou e ela ainda não foi concluída
// (ou foi concluída depois do prazo).
export function isTaskLate(task: Pick<ProjectTask, 'data_prazo' | 'status' | 'data_conclusao'>): boolean {
  if (!task.data_prazo) return false
  const hoje = todayStr()
  if (task.status !== 'Concluído') {
    return task.data_prazo < hoje
  }
  if (task.data_conclusao) {
    return task.data_conclusao > task.data_prazo
  }
  return false
}

// Justificativa é exigida sempre que a tarefa está/ficou atrasada.
export function taskNeedsJustificativa(task: Pick<ProjectTask, 'data_prazo' | 'status' | 'data_conclusao'>): boolean {
  return isTaskLate(task)
}

export type ProjectActivity = {
  id: string
  project_id: string
  responsavel: string
  data: string
  descricao: string | null
  created_at: string
}

export const CATEGORIAS = [
  'PROJETOS EM ANDAMENTO',
  'VISTORIAS E TCAC',
  'PROJETOS FINALIZADOS',
] as const

export const STATUS_COLUNAS = [
  'Pendente',
  'Tramitando',
  'CORREÇÃO',
  'Executando',
  'Zstandby',
  'Concluído',
] as const

// Mapa de status do projeto -> letra do progresso diário. Usado para manter
// o progresso diário sincronizado automaticamente sempre que o status muda.
export const STATUS_TO_LETRA: Record<string, string> = {
  Pendente: 'P',
  Tramitando: 'T',
  'CORREÇÃO': 'C',
  Executando: 'E',
  Zstandby: 'Z',
  'Concluído': 'D',
}

/**
 * Fonte única das cores por status.
 * Tudo no app (Kanban, Lista, Dashboard, Gantt, PDF e progresso diário)
 * lê daqui, para que as cores nunca fiquem divergentes entre telas.
 *
 * Pendente  · azul claro
 * Tramitando · rosa
 * CORREÇÃO  · vermelho
 * Executando · amarelo
 * Zstandby  · cinza
 * Concluído · verde
 */
export const STATUS_COLORS: Record<
  string,
  { hex: string; borderTop: string; badge: string; dot: string }
> = {
  Pendente: {
    hex: '#38bdf8',
    borderTop: 'border-t-sky-400',
    badge: 'bg-sky-100 text-sky-700 border-sky-300',
    dot: 'bg-sky-400',
  },
  Tramitando: {
    hex: '#f472b6',
    borderTop: 'border-t-pink-400',
    badge: 'bg-pink-100 text-pink-700 border-pink-300',
    dot: 'bg-pink-400',
  },
  'CORREÇÃO': {
    hex: '#ef4444',
    borderTop: 'border-t-red-500',
    badge: 'bg-red-100 text-red-700 border-red-300',
    dot: 'bg-red-500',
  },
  Executando: {
    hex: '#facc15',
    borderTop: 'border-t-yellow-400',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    dot: 'bg-yellow-400',
  },
  Zstandby: {
    hex: '#9ca3af',
    borderTop: 'border-t-gray-400',
    badge: 'bg-gray-100 text-gray-600 border-gray-300',
    dot: 'bg-gray-400',
  },
  'Concluído': {
    hex: '#22c55e',
    borderTop: 'border-t-green-500',
    badge: 'bg-green-100 text-green-700 border-green-300',
    dot: 'bg-green-500',
  },
}

export function statusColor(status: string) {
  return (
    STATUS_COLORS[normalizeStatus(status)] || {
      hex: '#94a3b8',
      borderTop: 'border-t-slate-400',
      badge: 'bg-slate-100 text-slate-600 border-slate-300',
      dot: 'bg-slate-400',
    }
  )
}

export type ProjectClient = {
  id: string
  project_id: string
  nome_parceiro: string | null
  cnpj: string | null
  nome_responsavel: string | null
  contato_responsavel: string | null
  email_cliente: string | null
  nome_dono_imovel: string | null
  contato_dono: string | null
  memorial_ou_projeto: string | null
  endereco_completo: string | null
  numero_processo: string | null
  numero_re: string | null
  protocolo: string | null
  ocupacao: string | null
  nome_pasta: string | null
  // Campos vindos do formulário "Cadastro de Projetos Aprovados"
  data_aprovacao: string | null
  link_localizacao: string | null
  cidade: string | null
  estado: string | null
  contato_parceiro: string | null
  endereco_parceiro: string | null
  entregue_cliente: string | null
  responsavel_entrega: string | null
  enviado_por_email: string | null
  destino_projeto: string | null
  entregue_dono_imovel: string | null
  dificuldades: string | null
  created_at: string
  updated_at: string
}

/** Categorias de anexo, espelhando os campos de upload do formulário. */
export const FILE_CATEGORIES = [
  {
    key: 'comprovante',
    label: 'Comprovante de entrega do projeto',
    hint: 'Se o processo foi digital, envie o print do e-mail com os arquivos',
  },
  {
    key: 'analises',
    label: 'Relatórios de análise',
    hint: 'Compilado e em ordem cronológica',
  },
  {
    key: 'oficios',
    label: 'Ofícios resposta ao Corpo de Bombeiros',
    hint: 'Documentos enviados em resposta às exigências',
  },
  {
    key: 'outros',
    label: 'Outros arquivos',
    hint: 'Plantas, memoriais, protocolos e demais documentos',
  },
] as const

export type FileCategoryKey = (typeof FILE_CATEGORIES)[number]['key']

export type ProjectCorrection = {
  id: string
  project_id: string
  numero: number
  data: string
  analista: string | null
  observacoes: string | null
  data_resposta: string | null
  respondida: boolean
  cidade: string | null
  destinatario: string | null
  created_at: string
  updated_at: string
}

/** Usados quando a correção ainda não tem cidade/destinatário próprios. */
export const OFICIO_CIDADE_PADRAO = 'Manaus'
export const OFICIO_DESTINATARIO_PADRAO =
  'Corpo de Bombeiros Militar\nSeção de Análise de Projetos e Segurança contra Incêndio'

export type ProjectCorrectionItem = {
  id: string
  correction_id: string
  numero: number
  exigencia: string
  resposta: string | null
  ordem: number
  created_at: string
}

export type ProjectPlan = {
  id: string
  project_id: string
  data_inicio_prevista: string | null
  data_fim_prevista: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export type ProjectPlanPhase = {
  id: string
  project_id: string
  status: string
  data_inicio: string
  data_fim: string
  ordem: number
  created_at: string
}

export type ProjectFile = {
  id: string
  project_id: string
  nome: string
  drive_file_id: string
  drive_link: string | null
  mime_type: string | null
  tamanho: number | null
  enviado_por: string | null
  categoria: string | null
  created_at: string
}

export type ClientFieldKey = Exclude<keyof ProjectClient, 'id' | 'project_id' | 'created_at' | 'updated_at'>

export type ClientField = {
  key: ClientFieldKey
  label: string
  placeholder?: string
  secao: string
  tipo?: 'texto' | 'data' | 'url' | 'simNao' | 'longo'
  opcional?: boolean
  largura?: 'meia' | 'inteira'
}

export const CLIENT_SECOES = ['Projeto', 'Cliente', 'Parceiro', 'Entrega', 'Aprovação'] as const

export const CLIENT_FIELDS: ClientField[] = [
  // --- Projeto ---
  { key: 'endereco_completo', label: 'Endereço completo do projeto', secao: 'Projeto', largura: 'inteira' },
  { key: 'link_localizacao', label: 'Link de localização', placeholder: 'Cole o link do Google Maps', secao: 'Projeto', tipo: 'url', largura: 'inteira' },
  { key: 'cidade', label: 'Cidade do projeto', secao: 'Projeto' },
  { key: 'estado', label: 'Estado do projeto', placeholder: 'Ex.: SC', secao: 'Projeto' },
  { key: 'ocupacao', label: 'Ocupação', placeholder: 'Ex.: C-2', secao: 'Projeto' },
  { key: 'memorial_ou_projeto', label: 'Memorial ou projeto', secao: 'Projeto' },
  { key: 'numero_processo', label: 'Nº do processo', placeholder: 'Se for memorial, colocar S/N', secao: 'Projeto' },
  { key: 'numero_re', label: 'Nº do NIB / RE', placeholder: 'Se for memorial, colocar S/N', secao: 'Projeto' },
  { key: 'protocolo', label: 'Protocolo', secao: 'Projeto' },
  { key: 'nome_pasta', label: 'Nome da pasta', placeholder: 'Define a pasta no Drive', secao: 'Projeto' },

  // --- Cliente ---
  { key: 'nome_responsavel', label: 'Nome do cliente', placeholder: 'Responsável legal pela edificação', secao: 'Cliente' },
  { key: 'contato_responsavel', label: 'Contato do cliente', secao: 'Cliente' },
  { key: 'email_cliente', label: 'E-mail do cliente', secao: 'Cliente' },
  { key: 'cnpj', label: 'CNPJ ou CPF', secao: 'Cliente' },
  { key: 'nome_dono_imovel', label: 'Nome do dono do imóvel', secao: 'Cliente' },
  { key: 'contato_dono', label: 'Contato do dono do imóvel', secao: 'Cliente' },

  // --- Parceiro ---
  { key: 'nome_parceiro', label: 'Nome do parceiro (Eng., Arq. e outros)', secao: 'Parceiro' },
  { key: 'contato_parceiro', label: 'Contato do parceiro', secao: 'Parceiro' },
  { key: 'endereco_parceiro', label: 'Endereço completo do parceiro', secao: 'Parceiro', largura: 'inteira' },

  // --- Entrega ---
  { key: 'entregue_cliente', label: 'O projeto foi entregue para o cliente?', secao: 'Entrega', tipo: 'simNao' },
  { key: 'entregue_dono_imovel', label: 'O projeto foi entregue ao dono do imóvel?', secao: 'Entrega', tipo: 'simNao' },
  { key: 'enviado_por_email', label: 'Foi enviado projeto por e-mail?', secao: 'Entrega', tipo: 'simNao' },
  { key: 'responsavel_entrega', label: 'Responsável pela entrega do projeto', secao: 'Entrega' },
  { key: 'destino_projeto', label: 'Destino do projeto', placeholder: 'Ex.: Processo digital, enviado por e-mail', secao: 'Entrega', largura: 'inteira' },

  // --- Aprovação ---
  { key: 'data_aprovacao', label: 'Data de aprovação do projeto', secao: 'Aprovação', tipo: 'data' },
  { key: 'dificuldades', label: 'Principais dificuldades para aprovar o projeto', placeholder: 'As correções eram evitáveis? O que as causou?', secao: 'Aprovação', tipo: 'longo', largura: 'inteira' },
]

/** Campos que precisam estar preenchidos para o projeto poder ser concluído. */
export const CLIENT_FIELDS_OBRIGATORIOS = CLIENT_FIELDS.filter((f) => !f.opcional)

export function isClientDataComplete(client: Partial<ProjectClient> | null | undefined): boolean {
  if (!client) return false
  return CLIENT_FIELDS_OBRIGATORIOS.every((f) => !!(client[f.key] || '').toString().trim())
}

export function normalizeStatus(status: string): string {
  const s = (status || '').trim().toLowerCase()
  if (s === 'done') return 'Concluído'
  if (s === 'tramitando') return 'Tramitando'
  if (s === 'pendente') return 'Pendente'
  if (s === 'executando') return 'Executando'
  if (s === 'correção' || s === 'correcao') return 'CORREÇÃO'
  if (s === 'zstandby') return 'Zstandby'
  return status
}

export function prazoColor(categoria: string | null): string {
  switch (categoria) {
    case 'ATRASADO':
      return 'bg-red-100 text-red-700 border-red-300'
    case 'ESSA SEMANA':
      return 'bg-amber-100 text-amber-700 border-amber-300'
    case 'NO PRAZO':
      return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    default:
      return 'bg-gray-100 text-gray-500 border-gray-300'
  }
}

// Pontuação automática por tipo de documento. "Vistoria" cobre também o que
// era chamado de "Fiscalização" na tabela de referência. PRO e FUNC não têm
// pontuação automática — permanecem com valor manual.
export const DOC_POINTS: Record<string, number> = {
  HAB: 1,
  Vistoria: 1,
  MEM: 2,
  TCAC: 3,
}

export function suggestedPoints(tipo: string | null | undefined): number | null {
  if (!tipo) return null
  return DOC_POINTS[tipo] ?? null
}

export function tipoColor(tipo: string | null): string {
  switch ((tipo || '').toUpperCase()) {
    case 'PRO':
      return 'bg-indigo-100 text-indigo-700'
    case 'MEM':
      return 'bg-purple-100 text-purple-700'
    case 'TCAC':
      return 'bg-cyan-100 text-cyan-700'
    case 'HAB':
      return 'bg-teal-100 text-teal-700'
    case 'FUNC':
      return 'bg-lime-100 text-lime-700'
    case 'VISTORIA':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}
