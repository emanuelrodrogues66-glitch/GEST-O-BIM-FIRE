import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

/** Teto de linhas que a API do Supabase devolve por requisição. */
const PAGINA = 1000

/**
 * Lê uma tabela inteira, em páginas.
 *
 * A API do Supabase corta a resposta em 1.000 linhas e não avisa: um
 * `select('*')` numa tabela maior devolve só o começo, silenciosamente.
 * Era o que fazia o progresso diário dos meses antigos sumir do Gantt.
 */
export async function carregarTabelaCompleta<T>(
  tabela: string,
  colunas = '*',
  ordenarPor?: string
): Promise<T[]> {
  const todas: T[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    let consulta = supabase
      .from(tabela)
      .select(colunas)
      .range(inicio, inicio + PAGINA - 1)
    if (ordenarPor) consulta = consulta.order(ordenarPor, { ascending: true })

    const { data, error } = await consulta
    if (error) throw error

    const lote = (data as T[] | null) || []
    todas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todas
}
