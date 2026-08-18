export const LETRA_PDF_COLORS: Record<string, string> = {
  p: '#7dd3fc', // Pendente - azul claro
  e: '#facc15', // Executando - amarelo
  t: '#f472b6', // Tramitando - rosa
  c: '#ef4444', // Correção - vermelho
  s: '#15803d', // Início - verde escuro
  d: '#4ade80', // Concluído - verde
  z: '#d1d5db', // Zstandby - cinza
}

export function letraColor(letra: string | undefined): string {
  if (!letra) return 'transparent'
  return LETRA_PDF_COLORS[letra.toLowerCase()] || '#e2e8f0'
}

const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function weekdayLetter(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day)
  return WEEKDAY_LETTERS[date.getDay()]
}
