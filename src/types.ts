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
  /** Serviço que vence: data da próxima renovação. */
  data_vencimento: string | null
  /** De quantos em quantos meses o serviço se repete. Nulo = não renova. */
  renovacao_meses: number | null
  /** Cartão que deu origem a este — a vistoria sabe de qual projeto veio. */
  projeto_origem_id: string | null
  created_at: string
  updated_at: string
}

export type DailyProgress = {
  id: string
  project_id: string
  data: string
  letra: string
}

export type TaskCategory = {
  id: string
  nome: string
  cor: string
  ordem: number
}

export const FREQUENCIAS = [
  { valor: 'diaria', rotulo: 'Todo dia' },
  { valor: 'semanal', rotulo: 'Semanal' },
  { valor: 'quinzenal', rotulo: 'Quinzenal' },
  { valor: 'mensal', rotulo: 'Mensal (dia fixo)' },
  { valor: 'mensal_semana', rotulo: 'Mensal (dia da semana)' },
] as const

/** Qual ocorrência do dia da semana dentro do mês. -1 = a última. */
export const SEMANAS_DO_MES = [
  { valor: 1, rotulo: 'primeira' },
  { valor: 2, rotulo: 'segunda' },
  { valor: 3, rotulo: 'terceira' },
  { valor: 4, rotulo: 'quarta' },
  { valor: -1, rotulo: 'última' },
] as const

export const DIAS_SEMANA = [
  { valor: 0, curto: 'D', rotulo: 'Domingo' },
  { valor: 1, curto: 'S', rotulo: 'Segunda' },
  { valor: 2, curto: 'T', rotulo: 'Terça' },
  { valor: 3, curto: 'Q', rotulo: 'Quarta' },
  { valor: 4, curto: 'Q', rotulo: 'Quinta' },
  { valor: 5, curto: 'S', rotulo: 'Sexta' },
  { valor: 6, curto: 'S', rotulo: 'Sábado' },
] as const

export type TaskRecurrence = {
  id: string
  nome: string
  responsavel: string | null
  categoria_id: string | null
  project_id: string | null
  frequencia: 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'mensal_semana'
  dias_semana: number[]
  dia_mes: number | null
  /** Usado só em 'mensal_semana': 1..4 ou -1 para a última. */
  semana_do_mes: number | null
  data_inicio: string
  data_fim: string | null
  hora_inicio: string | null
  hora_fim: string | null
  ativa: boolean
  gerado_ate: string | null
}

/** "09:00:00" -> "09:00". Nulo vira string vazia. */
export function horaCurta(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : ''
}

/** Faixa legível: "09:00–10:30", ou só o início quando não há fim. */
export function faixaHoraria(inicio: string | null, fim: string | null): string {
  if (!inicio) return ''
  return fim ? `${horaCurta(inicio)}–${horaCurta(fim)}` : horaCurta(inicio)
}

/** Resumo legível da regra: "Semanal · seg, qua, sex". */
export function descreverRecorrencia(r: TaskRecurrence): string {
  const freq = FREQUENCIAS.find((f) => f.valor === r.frequencia)?.rotulo || r.frequencia
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const dias = [...r.dias_semana].sort().map((d) => nomes[d]).join(', ')

  if (r.frequencia === 'diaria') return freq
  if (r.frequencia === 'mensal') return `Mensal · dia ${r.dia_mes ?? '?'}`

  if (r.frequencia === 'mensal_semana') {
    // "1ª terça-feira do mês" lê melhor do que o rótulo genérico.
    const ordem = SEMANAS_DO_MES.find((s) => s.valor === (r.semana_do_mes ?? 1))?.rotulo || ''
    const completos = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
    const nomeDia = r.dias_semana.length ? completos[r.dias_semana[0]] : '?'
    return `Mensal · ${ordem} ${nomeDia} do mês`
  }

  return dias ? `${freq} · ${dias}` : freq
}

export type ProjectTask = {
  id: string
  /** Nulo quando é tarefa geral, sem vínculo com projeto. */
  project_id: string | null
  categoria_id: string | null
  recurrence_id: string | null
  /** Código no formato MM + sequência do mês: 0801, 0802, 0901... */
  codigo: string | null
  nome: string
  /** Primeiro nome de `responsaveis`. Mantido para as telas antigas. */
  responsavel: string | null
  /** Todos os responsáveis pela tarefa. */
  responsaveis: string[] | null
  /** Preenchido quando é subtarefa: aponta para a tarefa mãe. */
  parent_id: string | null
  data_inicio: string | null
  data_prazo: string
  /** "09:00:00" quando a tarefa tem hora marcada; nulo = dia inteiro. */
  hora_inicio: string | null
  hora_fim: string | null
  status: string
  data_conclusao: string | null
  justificativa: string | null
  /** Anotações livres: o que foi combinado, onde parou, o que falta. */
  observacoes: string | null
  /** Só para tarefa geral: ela não passa pelo "assumir projeto". */
  horas_gastas: number | null
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
  /** Quanto o dia rendeu neste projeto. É esta hora que vira custo. */
  horas: number | null
  /** Verdadeiro quando o número veio do preenchimento retroativo, não da pessoa. */
  horas_estimadas: boolean
  created_at: string
}

/** Jornada padrão quando a pessoa não tem custo cadastrado. */
export const JORNADA_PADRAO = 8

/** Atalhos de duração: cobre quase todo lançamento sem digitar nada. */
export const DURACOES = [
  { horas: 1, rotulo: '1h' },
  { horas: 2, rotulo: '2h' },
  { horas: 4, rotulo: 'meio dia' },
  { horas: 8, rotulo: 'dia todo' },
] as const

/** "2.5" -> "2h30". Hora quebrada em minuto lê melhor. */
export function horasLegiveis(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—'
  const inteiras = Math.floor(h)
  const minutos = Math.round((h - inteiras) * 60)
  if (minutos === 0) return `${inteiras}h`
  return `${inteiras}h${String(minutos).padStart(2, '0')}`
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
  email_parceiro: string | null
  nome_dono_imovel: string | null
  contato_dono: string | null
  memorial_ou_projeto: string | null
  endereco_completo: string | null
  numero_processo: string | null
  numero_re: string | null
  protocolo: string | null
  ocupacao: string | null
  nome_pasta: string | null
  /** Vínculo com a base de clientes; o cartão mantém a própria cópia. */
  cliente_id: string | null
  parceiro_id: string | null
  // Campos vindos do formulário "Cadastro de Projetos Aprovados"
  data_aprovacao: string | null
  /** Assinatura do contrato — libera a parcela de entrada. */
  data_contrato: string | null
  /** Data em que o processo foi protocolado — libera a parcela de protocolo. */
  data_protocolo: string | null
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
  /** Memorial simplificado ou TAC: dispensa os anexos obrigatórios. */
  dispensa_upload: boolean | null
  created_at: string
  updated_at: string
}

/**
 * Categorias de anexo, espelhando os campos de upload do formulário.
 * `obrigatorio` define se a falta do arquivo impede concluir o projeto.
 */
export const FILE_CATEGORIES = [
  {
    key: 'comprovante',
    label: 'Comprovante de entrega do projeto',
    hint: 'Se o processo foi digital, envie o print do e-mail com os arquivos',
    obrigatorio: true,
  },
  {
    key: 'cliente',
    label: 'Arquivos recebidos do cliente',
    hint: 'Plantas, projetos anteriores, fotos e documentos enviados por quem contratou',
    obrigatorio: false,
  },
  {
    key: 'analises',
    label: 'Relatórios de análise',
    hint: 'Compilado e em ordem cronológica',
    obrigatorio: false,
  },
  {
    key: 'oficios',
    label: 'Ofícios resposta ao Corpo de Bombeiros',
    hint: 'Documentos enviados em resposta às exigências',
    obrigatorio: false,
  },
  {
    key: 'outros',
    label: 'Outros arquivos',
    hint: 'Plantas, memoriais, protocolos e demais documentos',
    obrigatorio: false,
  },
] as const

export type FileCategoryKey = (typeof FILE_CATEGORIES)[number]['key']

/**
 * Quais anexos obrigatórios ainda faltam.
 * A dispensa (memorial simplificado / TAC) zera a exigência.
 */
export function anexosObrigatoriosFaltando(
  client: Partial<ProjectClient> | null | undefined,
  arquivos: { categoria: string | null }[]
): string[] {
  if (client?.dispensa_upload) return []
  return FILE_CATEGORIES.filter(
    (c) => c.obrigatorio && !arquivos.some((a) => (a.categoria || 'outros') === c.key)
  ).map((c) => c.label)
}

export type ProjectPendency = {
  id: string
  project_id: string
  data_inicio: string
  data_fim: string | null
  motivo: string | null
  justificativa: string
  status_anterior: string | null
  previsao_retorno: string | null
  responsavel: string | null
  observacao_encerramento: string | null
  created_at: string
  updated_at: string
}

/** Motivos mais comuns de um projeto ficar parado, para padronizar o registro. */
export const MOTIVOS_PENDENCIA = [
  'Aguardando documento do cliente',
  'Aguardando assinatura',
  'Aguardando pagamento',
  'Aguardando definição de projeto',
  'Aguardando vistoria',
  'Aguardando retorno do Corpo de Bombeiros',
  'Outro motivo',
] as const

/** Há quantos dias a pendência está aberta (ou quanto durou, se já encerrada). */
export function diasDePendencia(p: Pick<ProjectPendency, 'data_inicio' | 'data_fim'>): number {
  const inicio = new Date(`${p.data_inicio}T00:00:00Z`).getTime()
  const fim = p.data_fim
    ? new Date(`${p.data_fim}T00:00:00Z`).getTime()
    : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round((fim - inicio) / 86400000))
}

/** Pendência longa merece destaque na tela. */
export function gravidadePendencia(dias: number): { rotulo: string; badge: string; hex: string } {
  if (dias >= 30) return { rotulo: 'crítica', badge: 'bg-red-100 text-red-700 border-red-300', hex: '#ef4444' }
  if (dias >= 15) return { rotulo: 'atenção', badge: 'bg-amber-100 text-amber-700 border-amber-300', hex: '#f59e0b' }
  return { rotulo: 'recente', badge: 'bg-slate-100 text-slate-600 border-slate-300', hex: '#94a3b8' }
}

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

/** Assinatura fixa do ofício resposta. */
export const OFICIO_RESPONSAVEL_TECNICO = 'Emanuel Da Natividade Rodrigues'
export const OFICIO_RESPONSAVEL_CREA = 'CREA 190806/D'

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
  { key: 'data_protocolo', label: 'Data do protocolo', secao: 'Projeto', tipo: 'data', opcional: true },
  { key: 'data_contrato', label: 'Data do contrato', secao: 'Projeto', tipo: 'data', opcional: true },
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
  // Opcional de propósito: exigir e-mail do parceiro travaria a conclusão de
  // todos os projetos antigos, que nunca tiveram esse campo.
  { key: 'email_parceiro', label: 'E-mail do parceiro', secao: 'Parceiro', opcional: true },
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
// era chamado de "Fiscalização" na tabela de referência.
// PRO não entra aqui: depende da área, ver PRO_FAIXAS abaixo.
export const DOC_POINTS: Record<string, number> = {
  HAB: 1,
  Vistoria: 1,
  FUNC: 1,
  SPDA: 1,
  MEM: 2,
  TCAC: 3,
}

/** Todos os tipos de serviço, na ordem em que aparecem no cartão. */
export const TIPOS_DE_SERVICO = ['PRO', 'MEM', 'TCAC', 'HAB', 'FUNC', 'Vistoria', 'SPDA'] as const

/**
 * Serviços que vencem e precisam ser refeitos, com o intervalo em meses.
 *
 * Cada vencimento é um cliente que precisa contratar de novo — por isso o
 * sistema acompanha a data em vez de deixar a renovação depender da memória
 * de alguém.
 */
export const RENOVACAO_MESES: Record<string, number> = {
  Vistoria: 12,
  SPDA: 12,
}

/** Serviços que costumam nascer da aprovação de um projeto. */
export const SERVICOS_DERIVADOS = [
  { tipo: 'Vistoria', rotulo: 'Vistoria', ajuda: 'Vistoria no local, renova todo ano' },
  { tipo: 'FUNC', rotulo: 'Funcionamento', ajuda: 'Alvará de funcionamento' },
  { tipo: 'HAB', rotulo: 'Habite-se', ajuda: 'Habite-se da edificação' },
  { tipo: 'SPDA', rotulo: 'SPDA', ajuda: 'Laudo de SPDA, renova todo ano' },
  { tipo: 'TCAC', rotulo: 'TCAC', ajuda: 'Termo de compromisso, com etapas anuais' },
  { tipo: 'MEM', rotulo: 'Memorial', ajuda: 'Memorial descritivo' },
] as const

/** Quantos dias antes o vencimento entra na carteira de renovações. */
export const AVISO_VENCIMENTO_DIAS = 60

/** Soma meses a uma data ISO, sem escorregar de mês. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const base = new Date(a, m - 1 + meses, d)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

/** Dias que faltam até a data. Negativo = já venceu. */
export function diasAte(iso: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const [a, m, d] = iso.split('-').map(Number)
  return Math.round((new Date(a, m - 1, d).getTime() - hoje.getTime()) / 86400000)
}

/**
 * Faixas de pontuação do PRO por área, valendo de setembro/2026.
 *
 * Antes eram dois degraus (2,5 e 5) e um projeto de 50.000 m² valia o mesmo
 * que um de 1.100. A escala existe para que o porte apareça no ranking.
 */
export const PRO_FAIXAS: { ate: number; pontos: number }[] = [
  { ate: 1000, pontos: 5 },
  { ate: 2500, pontos: 7 },
  { ate: 5000, pontos: 8 },
  { ate: 10000, pontos: 9 },
]
/** Acima de 10.000 m²: 10 pontos e mais 1 a cada 5.000 m² inteiros. */
export const PRO_BASE_ACIMA = 10
export const PRO_DEGRAU_M2 = 5000

/** Piso do desconto por correção. Só PRO desconta, e nunca abaixo disto. */
export const PONTOS_PISO_CORRECAO = 5

/** Pontuação do tipo e da área, antes de descontar retorno para correção. */
export function pontosBase(
  tipo: string | null | undefined,
  m2?: number | string | null
): number | null {
  if (!tipo) return null

  if (tipo === 'PRO') {
    const area = m2 === '' || m2 === null || m2 === undefined ? null : Number(m2)
    if (area === null || Number.isNaN(area)) return null
    const faixa = PRO_FAIXAS.find((f) => area <= f.ate)
    if (faixa) return faixa.pontos
    return PRO_BASE_ACIMA + Math.floor((area - 10000) / PRO_DEGRAU_M2)
  }

  return DOC_POINTS[tipo] ?? null
}

/**
 * Pontos do projeto: a base menos um ponto por retorno para correção.
 *
 * O desconto só atinge PRO e para em 5. Um projeto grande que voltou cinco
 * vezes ainda vale mais que um pequeno de primeira — o retorno pesa, mas não
 * apaga o tamanho do trabalho. MEM (2) e vistoria (1) já valem menos que o
 * piso, então não descontam: seria zerar o serviço por um detalhe de ofício.
 */
export function suggestedPoints(
  tipo: string | null | undefined,
  m2?: number | string | null,
  retornosCorrecao = 0
): number | null {
  const base = pontosBase(tipo, m2)
  if (base === null) return null
  if (tipo !== 'PRO') return base
  return Math.max(base - retornosCorrecao, PONTOS_PISO_CORRECAO)
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
    case 'SPDA':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}
