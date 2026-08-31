/**
 * Cartão ponto.
 *
 * Substitui a planilha CARTÃO PONTO 2026. Três decisões que mudam tudo e por
 * isso ficam explicadas aqui, e não escondidas no meio do cálculo:
 *
 * 1. A hora que vale é a do servidor, em America/Sao_Paulo. Se fosse a do
 *    aparelho, bastaria adiantar o relógio do celular para nunca atrasar.
 * 2. O atraso tem tolerância de 5 minutos por batida, como na CLT. Chegar
 *    08:44 numa entrada de 08:40 não é atraso; 08:46 é atraso de 6 minutos —
 *    a tolerância não é desconto, ela some inteira quando é estourada.
 * 3. O saldo do dia (banco de horas) é o tempo efetivamente trabalhado menos o
 *    previsto. É coisa diferente do atraso: dá para chegar tarde e ainda assim
 *    fechar o dia positivo, ficando até mais tarde.
 */

import { supabase } from './supabase'

export const FUSO = 'America/Sao_Paulo'

export const TIPOS = ['entrada_manha', 'saida_manha', 'entrada_tarde', 'saida_tarde'] as const
export type TipoBatida = (typeof TIPOS)[number]

export const ROTULO_TIPO: Record<TipoBatida, string> = {
  entrada_manha: 'Entrada',
  saida_manha: 'Saída almoço',
  entrada_tarde: 'Volta almoço',
  saida_tarde: 'Saída',
}

export const SITUACOES = [
  { valor: 'normal', rotulo: 'Normal' },
  { valor: 'falta', rotulo: 'Falta' },
  { valor: 'atestado', rotulo: 'Atestado' },
  { valor: 'ferias', rotulo: 'Férias' },
  { valor: 'folga', rotulo: 'Folga' },
  { valor: 'meio_periodo', rotulo: 'Meio período' },
  { valor: 'externo', rotulo: 'Serviço externo' },
] as const

/** Situações em que não se espera batida e o dia não gera saldo negativo. */
const ABONADAS = new Set(['atestado', 'ferias', 'folga', 'externo'])

export type Jornada = {
  id: string
  colaborador: string
  vigencia_inicio: string
  vigencia_fim: string | null
  entrada_manha: string | null
  saida_manha: string | null
  entrada_tarde: string | null
  saida_tarde: string | null
  dias_semana: number[]
  tolerancia_min: number
  observacao: string | null
}

export type Batida = {
  id: string
  colaborador: string
  dia: string
  tipo: TipoBatida
  momento: string
  origem: 'app' | 'ajuste'
  ip: string | null
  registrado_por: string | null
  observacao: string | null
}

export type SituacaoDia = {
  id: string
  colaborador: string
  dia: string
  situacao: string
  observacao: string | null
}

export type Feriado = { dia: string; nome: string }

export type Fechamento = {
  id: string
  colaborador: string
  ate_dia: string
  saldo_zerado: number | null
  motivo: string | null
}

// ---------------------------------------------------------------- utilidades

/** "08:40:00" -> 520 minutos desde a meia-noite. */
export function minutosDaHora(hhmm: string | null): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** Momento gravado (UTC) -> minutos do dia em Londrina. */
export function minutosDoMomento(iso: string): number {
  const d = new Date(iso)
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = Number(partes.find((p) => p.type === 'hour')?.value || 0)
  const m = Number(partes.find((p) => p.type === 'minute')?.value || 0)
  return h * 60 + m
}

export function horaDoMomento(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Data de hoje em Londrina, no formato ISO. Nunca use new Date() cru aqui. */
export function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 132 -> "2h12". Negativo sai com sinal, porque saldo negativo importa. */
export function minutosLegiveis(min: number): string {
  const sinal = min < 0 ? '-' : ''
  const abs = Math.abs(Math.round(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${sinal}${m}min`
  return `${sinal}${h}h${String(m).padStart(2, '0')}`
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay()
}
export function siglaDoDia(iso: string): string {
  return DIAS_SEMANA[diaDaSemana(iso)]
}

/** Todos os dias do mês, em ISO. */
export function diasDoMes(ano: number, mes: number): string[] {
  const total = new Date(ano, mes, 0).getDate()
  const dias: string[] = []
  for (let d = 1; d <= total; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return dias
}

// ------------------------------------------------------------------ carregar

export async function carregarJornadas(): Promise<Jornada[]> {
  const { data } = await supabase
    .from('time_schedules')
    .select('*')
    .order('colaborador')
    .order('vigencia_inicio', { ascending: false })
  return (data as Jornada[]) || []
}

/** A jornada que valia naquele dia — mudar de horário não reescreve o passado. */
export function jornadaNoDia(jornadas: Jornada[], colaborador: string, dia: string): Jornada | null {
  return (
    jornadas.find(
      (j) =>
        j.colaborador === colaborador &&
        j.vigencia_inicio <= dia &&
        (!j.vigencia_fim || j.vigencia_fim >= dia)
    ) || null
  )
}

/**
 * O PostgREST devolve no máximo 1000 linhas por consulta, calado. Oito meses
 * de ponto da equipe passam disso — e o que sumia virava dia sem batida, ou
 * seja, falta, o que jogava o banco de horas para centenas de horas negativas.
 * Por isso toda leitura de batida vem paginada.
 */
const PAGINA = 1000

async function paginado<T>(monta: () => any): Promise<T[]> {
  const todas: T[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await monta().range(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(error.message)
    const lote = (data as T[]) || []
    todas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todas
}

export async function carregarBatidas(de: string, ate: string, colaborador?: string) {
  return paginado<Batida>(() => {
    let q = supabase.from('time_entries').select('*').gte('dia', de).lte('dia', ate)
    if (colaborador) q = q.eq('colaborador', colaborador)
    return q.order('dia').order('momento')
  })
}

export async function carregarSituacoes(de: string, ate: string) {
  return paginado<SituacaoDia>(() =>
    supabase.from('time_days').select('*').gte('dia', de).lte('dia', ate).order('dia')
  )
}

export async function carregarFeriados(de: string, ate: string) {
  const { data } = await supabase.from('time_holidays').select('*').gte('dia', de).lte('dia', ate)
  return (data as Feriado[]) || []
}

export async function carregarFechamentos(colaborador?: string) {
  let q = supabase.from('time_closures').select('*')
  if (colaborador) q = q.eq('colaborador', colaborador)
  const { data } = await q.order('ate_dia', { ascending: false })
  return (data as Fechamento[]) || []
}

// ------------------------------------------------------------------ registrar

/**
 * Bate o ponto. O tipo pode ir nulo: o banco escolhe a próxima marcação que
 * falta no dia, que é como funciona um relógio de ponto de verdade.
 */
export async function baterPonto(params: {
  colaborador: string
  pin: string
  tipo?: TipoBatida | null
  observacao?: string | null
}) {
  const ip = await descobrirIp()
  const { data, error } = await supabase.rpc('bater_ponto', {
    p_colaborador: params.colaborador,
    p_pin: params.pin,
    p_tipo: params.tipo ?? null,
    p_ip: ip,
    p_observacao: params.observacao ?? null,
  })
  if (error) throw new Error(traduzirErro(error.message))
  return data as { colaborador: string; dia: string; tipo: TipoBatida; momento: string }
}

export async function ajustarPonto(params: {
  colaborador: string
  dia: string
  tipo: TipoBatida
  hora: string | null
  motivo: string
}) {
  const { error } = await supabase.rpc('ajustar_ponto', {
    p_colaborador: params.colaborador,
    p_dia: params.dia,
    p_tipo: params.tipo,
    p_hora: params.hora,
    p_motivo: params.motivo,
  })
  if (error) throw new Error(traduzirErro(error.message))
}

export async function definirPin(colaborador: string, pin: string) {
  const { error } = await supabase.rpc('definir_pin', { p_colaborador: colaborador, p_pin: pin })
  if (error) throw new Error(traduzirErro(error.message))
}

export async function temPin(colaborador: string): Promise<boolean> {
  const { data } = await supabase.rpc('tem_pin', { p_colaborador: colaborador })
  return Boolean(data)
}

function traduzirErro(msg: string): string {
  if (/PIN incorreto/i.test(msg)) return 'PIN incorreto.'
  if (/Sem PIN/i.test(msg)) return msg
  if (/já foi registrada/i.test(msg)) return msg
  return msg.replace(/^.*?:\s*/, '')
}

/**
 * IP de quem bateu, só para o ADM conferir depois de onde veio a marcação.
 * Se o serviço não responder, a batida acontece do mesmo jeito — travar o
 * ponto por causa disso seria pior do que não ter o dado.
 */
async function descobrirIp(): Promise<string | null> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(2500),
    })
    const j = await r.json()
    return j.ip || null
  } catch {
    return null
  }
}

// -------------------------------------------------------------------- apurar

export type DiaApurado = {
  dia: string
  colaborador: string
  situacao: string
  feriado: string | null
  /** É dia de trabalho segundo a jornada (e não é feriado). */
  util: boolean
  batidas: Partial<Record<TipoBatida, Batida>>
  /** Minutos previstos pela jornada. */
  previsto: number
  /** Minutos efetivamente entre as batidas. */
  trabalhado: number
  /** Soma dos atrasos das entradas, já descontada a tolerância. */
  atraso: number
  /** Minutos de saída antecipada. */
  saidaAntecipada: number
  /** trabalhado - previsto. Positivo é crédito no banco de horas. */
  saldo: number
  /** Marcações que faltaram num dia útil. */
  faltando: TipoBatida[]
  /** Entradas em atraso: é o "vermelho" da planilha. */
  vermelhos: number
}

export function apurarDia(params: {
  dia: string
  colaborador: string
  jornada: Jornada | null
  batidas: Batida[]
  situacao: string
  feriado: string | null
}): DiaApurado {
  const { dia, colaborador, jornada, situacao, feriado } = params

  const porTipo: Partial<Record<TipoBatida, Batida>> = {}
  for (const b of params.batidas) porTipo[b.tipo] = b

  const diaSemana = diaDaSemana(dia)
  const trabalhaHoje = jornada ? jornada.dias_semana.includes(diaSemana) : false
  const util = trabalhaHoje && !feriado && !ABONADAS.has(situacao)

  const tol = jornada?.tolerancia_min ?? 5

  // ---- previsto
  let previsto = 0
  if (util && jornada) {
    const m1 = minutosDaHora(jornada.entrada_manha)
    const m2 = minutosDaHora(jornada.saida_manha)
    const t1 = minutosDaHora(jornada.entrada_tarde)
    const t2 = minutosDaHora(jornada.saida_tarde)
    if (m1 !== null && m2 !== null) previsto += m2 - m1
    if (t1 !== null && t2 !== null) previsto += t2 - t1
  }
  if (situacao === 'meio_periodo') previsto = Math.round(previsto / 2)

  // ---- trabalhado
  let trabalhado = 0
  const par = (a: TipoBatida, b: TipoBatida) => {
    const ini = porTipo[a]
    const fim = porTipo[b]
    if (!ini || !fim) return 0
    const d = minutosDoMomento(fim.momento) - minutosDoMomento(ini.momento)
    return d > 0 ? d : 0
  }
  trabalhado += par('entrada_manha', 'saida_manha')
  trabalhado += par('entrada_tarde', 'saida_tarde')

  // ---- atraso, com a tolerância valendo por batida
  let atraso = 0
  let vermelhos = 0
  if (util && jornada) {
    const checa = (tipo: TipoBatida, previstoHora: string | null) => {
      const b = porTipo[tipo]
      const p = minutosDaHora(previstoHora)
      if (!b || p === null) return
      const diff = minutosDoMomento(b.momento) - p
      if (diff > tol) {
        atraso += diff
        vermelhos++
      }
    }
    checa('entrada_manha', jornada.entrada_manha)
    checa('entrada_tarde', jornada.entrada_tarde)
  }

  // ---- saída antecipada
  let saidaAntecipada = 0
  if (util && jornada) {
    const b = porTipo['saida_tarde']
    const p = minutosDaHora(jornada.saida_tarde)
    if (b && p !== null) {
      const diff = p - minutosDoMomento(b.momento)
      if (diff > tol) saidaAntecipada = diff
    }
  }

  // ---- o que faltou marcar
  const faltando: TipoBatida[] = []
  if (util && jornada) {
    for (const t of TIPOS) {
      const temNaJornada =
        (t === 'entrada_manha' && jornada.entrada_manha) ||
        (t === 'saida_manha' && jornada.saida_manha) ||
        (t === 'entrada_tarde' && jornada.entrada_tarde) ||
        (t === 'saida_tarde' && jornada.saida_tarde)
      if (temNaJornada && !porTipo[t]) faltando.push(t)
    }
  }

  // Dia útil sem nenhuma batida e sem justificativa é falta: o previsto inteiro
  // vira saldo negativo. Já um dia incompleto (esqueceu de bater a saída) não
  // pode ser tratado como falta — por isso o saldo só conta o que dá para medir
  // e o buraco aparece na coluna "faltando", para o ADM ajustar.
  const semNenhuma = Object.keys(porTipo).length === 0
  let saldo = 0
  if (util) {
    if (semNenhuma) saldo = -previsto
    else if (faltando.length > 0) saldo = 0
    else saldo = trabalhado - previsto
  }

  return {
    dia,
    colaborador,
    situacao,
    feriado,
    util,
    batidas: porTipo,
    previsto,
    trabalhado,
    atraso,
    saidaAntecipada,
    saldo,
    faltando,
    vermelhos,
  }
}

export type MesApurado = {
  colaborador: string
  dias: DiaApurado[]
  previsto: number
  trabalhado: number
  atraso: number
  saldoMes: number
  vermelhos: number
  faltas: number
  diasIncompletos: number
  /** Regra do bônus da planilha: menos de 5 vermelhos e menos de 30 min de atraso. */
  elegivelBonus: boolean
}

export function apurarMes(params: {
  colaborador: string
  dias: string[]
  jornadas: Jornada[]
  batidas: Batida[]
  situacoes: SituacaoDia[]
  feriados: Feriado[]
}): MesApurado {
  const { colaborador, dias, jornadas, batidas, situacoes, feriados } = params

  const porDia = new Map<string, Batida[]>()
  for (const b of batidas) {
    if (b.colaborador !== colaborador) continue
    const lista = porDia.get(b.dia) || []
    lista.push(b)
    porDia.set(b.dia, lista)
  }
  const sitPorDia = new Map(
    situacoes.filter((s) => s.colaborador === colaborador).map((s) => [s.dia, s.situacao])
  )
  const feriadoPorDia = new Map(feriados.map((f) => [f.dia, f.nome]))

  const apurados = dias.map((dia) =>
    apurarDia({
      dia,
      colaborador,
      jornada: jornadaNoDia(jornadas, colaborador, dia),
      batidas: porDia.get(dia) || [],
      situacao: sitPorDia.get(dia) || 'normal',
      feriado: feriadoPorDia.get(dia) || null,
    })
  )

  // Dia futuro ainda não conta como falta: o mês corrente ficaria sempre no
  // vermelho até o dia 31.
  const hoje = hojeLocal()
  const passados = apurados.filter((d) => d.dia <= hoje)

  const soma = (f: (d: DiaApurado) => number) => passados.reduce((s, d) => s + f(d), 0)

  const atraso = soma((d) => d.atraso)
  const vermelhos = soma((d) => d.vermelhos)

  return {
    colaborador,
    dias: apurados,
    previsto: soma((d) => d.previsto),
    trabalhado: soma((d) => d.trabalhado),
    atraso,
    saldoMes: soma((d) => d.saldo),
    vermelhos,
    faltas: passados.filter((d) => d.util && Object.keys(d.batidas).length === 0).length,
    diasIncompletos: passados.filter((d) => d.faltando.length > 0 && Object.keys(d.batidas).length > 0)
      .length,
    elegivelBonus: vermelhos < 5 && atraso < 30,
  }
}

/**
 * Banco de horas acumulado até a data, respeitando o último fechamento.
 *
 * Depois de um fechamento, o saldo recomeça do valor que o ADM deixou lá —
 * senão as horas já pagas continuariam sendo devidas para sempre.
 */
export async function bancoDeHoras(colaborador: string, ate: string): Promise<number> {
  const fechamentos = await carregarFechamentos(colaborador)
  const ultimo = fechamentos.find((f) => f.ate_dia <= ate)
  const de = ultimo ? proximoDia(ultimo.ate_dia) : '2026-01-01'

  const [jornadas, batidas, situacoes, feriados] = await Promise.all([
    carregarJornadas(),
    carregarBatidas(de, ate, colaborador),
    carregarSituacoes(de, ate),
    carregarFeriados(de, ate),
  ])

  const dias: string[] = []
  for (let d = new Date(`${de}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (iso > ate) break
    dias.push(iso)
  }

  const mes = apurarMes({ colaborador, dias, jornadas, batidas, situacoes, feriados })
  return (ultimo?.saldo_zerado ?? 0) + mes.saldoMes
}

function proximoDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
