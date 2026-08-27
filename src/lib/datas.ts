/**
 * Conversão de carimbo de tempo para o fuso de quem está olhando.
 *
 * O banco guarda `created_at` em UTC. Cortar a string com slice devolve a hora
 * de Greenwich — três horas à frente de Brasília — e, depois das 21h, ainda
 * joga o evento para o dia seguinte. Por isso tudo que vem de `created_at`
 * precisa passar por aqui.
 */

/** "2026-08-26T22:40:00+00:00" -> "2026-08-26" no fuso local. */
export function dataLocal(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return timestamp.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-08-26T22:40:00+00:00" -> "19:40" no fuso local. */
export function horaLocal(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return timestamp.slice(11, 16)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
