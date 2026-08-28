import jsPDF from 'jspdf'
import type { Project, ProjectClient } from '../types'
import { LOGO_BIM_FIRE_JPEG } from './logoBimFire'

/**
 * Termo de entrega dos projetos, em PDF.
 *
 * Reproduz o modelo em papel do escritório, já preenchido com o que o sistema
 * sabe. O que o sistema não tem — CPF de quem assina, data em que recebeu,
 * assinatura — continua como linha para preencher à mão na hora da entrega.
 */

/** "2026-08-24" -> "24/08/2026". */
function dataBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Escreve o texto encolhendo a fonte até caber numa linha só.
 *
 * Endereço é o campo que estoura: com quebra automática a segunda linha cai
 * embaixo do sublinhado e invade a frase seguinte. Aqui a fonte diminui até
 * 6pt e, se ainda assim não couber, o texto é cortado com reticências — feio,
 * mas legível, e nunca por cima de outra linha.
 */
function escreverNaLinha(
  pdf: jsPDF,
  texto: string,
  x: number,
  y: number,
  largura: number,
  tamanhoBase = 11
) {
  if (!texto) return
  let tamanho = tamanhoBase
  pdf.setFontSize(tamanho)

  while (pdf.getTextWidth(texto) > largura && tamanho > 6) {
    tamanho -= 0.5
    pdf.setFontSize(tamanho)
  }

  let saida = texto
  if (pdf.getTextWidth(saida) > largura) {
    while (saida.length > 4 && pdf.getTextWidth(saida + '...') > largura) {
      saida = saida.slice(0, -1)
    }
    saida += '...'
  }

  pdf.text(saida, x, y)
  pdf.setFontSize(tamanhoBase)
}

export type DadosDoTermo = {
  projeto: Project
  cliente: Partial<ProjectClient>
  /** Quem assina o recebimento. Vazio = linha em branco. */
  recebedor?: string
  /** Data em que o cliente recebeu. Vazio = linha em branco. */
  dataRecebimento?: string
  /** Onde o projeto foi entregue. Vazio = linha em branco. */
  enderecoEntrega?: string
}

export function gerarTermoDeEntrega(d: DadosDoTermo): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const LARGURA = 210
  const ESQ = 25
  const DIR = 185
  const UTIL = DIR - ESQ

  // --- Logo centralizada ---
  const tamLogo = 26
  pdf.addImage(LOGO_BIM_FIRE_JPEG, 'JPEG', (LARGURA - tamLogo) / 2, 14, tamLogo, tamLogo)

  // --- Título ---
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('TERMO DE ENTREGA DOS PROJETOS', LARGURA / 2, 50, { align: 'center' })

  // --- Cabeçalho: projeto e cidade ---
  const cidade = [d.cliente.cidade, d.cliente.estado].filter(Boolean).join(' - ')

  pdf.setFontSize(11)
  pdf.text('Projeto:', 58, 60)
  pdf.setFont('helvetica', 'normal')
  escreverNaLinha(pdf, d.projeto.nome || '', 76, 60, 90)
  pdf.line(76, 61, 168, 61)

  pdf.setFont('helvetica', 'bold')
  pdf.text('Cidade:', 62, 68)
  pdf.setFont('helvetica', 'normal')
  escreverNaLinha(pdf, cidade, 80, 68, 68)
  pdf.line(80, 69, 150, 69)

  // --- Corpo declaratório ---
  // Montado linha a linha, e não com splitTextToSize, porque cada trecho
  // preenchido precisa ficar sobre um sublinhado do tamanho certo.
  pdf.setFontSize(11)
  let y = 84

  const recebedor = (d.recebedor || d.cliente.nome_responsavel || '').trim()
  pdf.text('Eu, ', ESQ, y)
  escreverNaLinha(pdf, recebedor, ESQ + 9, y, DIR - (ESQ + 13))
  pdf.line(ESQ + 8, y + 1, DIR - 3, y + 1)
  pdf.text(',', DIR - 2, y)

  y += 8
  pdf.text('CPF nº ', ESQ + 2, y)
  pdf.line(ESQ + 17, y + 1, ESQ + 100, y + 1)
  pdf.text(', declaro que recebi em ', ESQ + 101, y)
  pdf.text(dataBR(d.dataRecebimento), ESQ + 148, y)
  pdf.line(ESQ + 146, y + 1, ESQ + 172, y + 1)
  pdf.text(', o(s)', ESQ + 173, y)

  y += 8
  const nib = (d.cliente.numero_re || '').trim()
  pdf.text('projeto(s) técnico(s) referente(s) ao processo NIB nº ', ESQ, y)
  escreverNaLinha(pdf, nib, ESQ + 105, y, DIR - (ESQ + 109))
  pdf.line(ESQ + 103, y + 1, DIR - 3, y + 1)
  pdf.text(',', DIR - 2, y)

  y += 8
  const doc = (d.cliente.cnpj || '').trim()
  pdf.text('CNPJ: ', ESQ, y)
  escreverNaLinha(pdf, doc, ESQ + 15, y, 52)
  pdf.line(ESQ + 13, y + 1, ESQ + 68, y + 1)
  pdf.text(', em endereço: ', ESQ + 69, y)
  const endereco = (d.cliente.endereco_completo || '').trim()
  escreverNaLinha(pdf, endereco, ESQ + 101, y, DIR - (ESQ + 102))
  pdf.line(ESQ + 100, y + 1, DIR, y + 1)

  y += 8
  pdf.text('devidamente aprovado(s) pelo Corpo de Bombeiros.', ESQ, y)

  // --- Datas ---
  y += 14
  pdf.setFont('helvetica', 'bold')
  pdf.text('Data de Aprovação:', ESQ, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(dataBR(d.cliente.data_aprovacao), ESQ + 45, y)

  y += 7
  pdf.setFont('helvetica', 'bold')
  pdf.text('Data de Recebimento:', ESQ, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(dataBR(d.dataRecebimento), ESQ + 50, y)

  // --- Assinatura ---
  y += 14
  pdf.text('Assinatura do Responsável pelo Recebimento: ', ESQ, y)
  pdf.line(ESQ + 88, y + 1, DIR, y + 1)

  // --- Rodapé: endereço de entrega ---
  const yRodape = 262
  pdf.text('Endereço de entrega do projeto: ', ESQ, yRodape)
  const entrega = (d.enderecoEntrega || '').trim()
  escreverNaLinha(pdf, entrega, ESQ + 66, yRodape, DIR - (ESQ + 67))
  pdf.line(ESQ + 64, yRodape + 1, DIR, yRodape + 1)

  void UTIL

  return pdf
}

/** Nome de arquivo previsível: dá para achar no Downloads sem procurar. */
export function nomeDoArquivoTermo(projeto: Project): string {
  const numero = projeto.numero ? `${projeto.numero} - ` : ''
  const limpo = (projeto.nome || 'projeto').replace(/[\\/:*?"<>|]/g, '-')
  return `Termo de entrega - ${numero}${limpo}.pdf`
}
