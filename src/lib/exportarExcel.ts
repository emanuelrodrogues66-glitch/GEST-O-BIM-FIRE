import * as XLSX from 'xlsx'

/**
 * Exportação para Excel.
 *
 * Gera .xlsx de verdade, e não CSV: com CSV o Excel brasileiro embaralha
 * acentuação e transforma CNPJ em número científico. Aqui cada coluna sai como
 * texto, do jeito que foi digitada.
 */

export type ColunaExcel<T> = {
  titulo: string
  valor: (linha: T) => string | number | null
  /** Largura em caracteres; sem isso a planilha abre com tudo espremido. */
  largura?: number
}

export function exportarParaExcel<T>(params: {
  nomeArquivo: string
  nomeAba: string
  colunas: ColunaExcel<T>[]
  linhas: T[]
}) {
  const { nomeArquivo, nomeAba, colunas, linhas } = params

  const matriz = [
    colunas.map((c) => c.titulo),
    ...linhas.map((l) => colunas.map((c) => c.valor(l) ?? '')),
  ]

  const aba = XLSX.utils.aoa_to_sheet(matriz)
  aba['!cols'] = colunas.map((c) => ({ wch: c.largura ?? 18 }))
  // Congela o cabeçalho: lista de 135 clientes sem isso é ilegível ao rolar.
  aba['!freeze'] = { xSplit: 0, ySplit: 1 }

  const livro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(livro, aba, nomeAba.slice(0, 31))
  XLSX.writeFile(livro, nomeArquivo)
}

/** Data de hoje para carimbar o nome do arquivo: relatorio-2026-08-30.xlsx */
export function carimboDeHoje(): string {
  return new Date().toISOString().slice(0, 10)
}
