export type MonthRef = { year: number; month: number } // month: 1-12

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/**
 * O mês em que estamos, pelo relógio de quem abriu o app.
 *
 * O padrão do filtro era fixo em agosto/2026, então na virada do mês o
 * escritório inteiro abria o sistema num mês que já passou.
 */
export function mesDeHoje(): MonthRef {
  const agora = new Date()
  return { year: agora.getFullYear(), month: agora.getMonth() + 1 }
}

export function monthLabel(m: MonthRef): string {
  return `${MESES[m.month - 1]} ${m.year}`
}

export function daysInMonth(m: MonthRef): number {
  return new Date(m.year, m.month, 0).getDate()
}

export function monthKey(m: MonthRef): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}

export function monthRange(m: MonthRef): { start: string; end: string } {
  const mm = String(m.month).padStart(2, '0')
  const start = `${m.year}-${mm}-01`
  const end = `${m.year}-${mm}-${String(daysInMonth(m)).padStart(2, '0')}`
  return { start, end }
}

export function addMonths(m: MonthRef, delta: number): MonthRef {
  const d = new Date(m.year, m.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function dateInMonth(dateStr: string | null | undefined, m: MonthRef): boolean {
  if (!dateStr) return false
  return dateStr.slice(0, 7) === monthKey(m)
}
