import jsPDF from 'jspdf'
import { LOGO_MEF_PNG } from './logoMef'
import type { ItemOrcamento, Orcamento } from './mef'
import { dataBR, reais, totais, totalDoItem } from './mef'

/**
 * PDF do orçamento da MEF.
 *
 * Desenhado com texto, não com foto da tela: o cliente recebe um arquivo leve,
 * que dá para buscar palavra e imprimir sem serrilhado. Custo e margem nunca
 * entram aqui — este papel vai para fora.
 */

const EMPRESA = {
  nome: 'MEF INSTALAÇÕES E EXECUÇÕES',
  cnpj: 'CNPJ: 63.786.865/0001-45',
  endereco: 'Rua Condor, 1460, Sala 04, Centro — Arapongas/PR',
  contato: '(43) 9 8802-0183   ·   bzcompany.engenharia@gmail.com',
}

const MARGEM = 40
const VINHO: [number, number, number] = [127, 29, 29]
const GRAFITE: [number, number, number] = [51, 65, 85]
const CINZA: [number, number, number] = [148, 163, 184]

export function gerarPdfOrcamento(orcamento: Orcamento, itens: ItemOrcamento[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const util = largura - MARGEM * 2
  let y = MARGEM

  // ---------- cabeçalho ----------
  doc.addImage(LOGO_MEF_PNG, 'PNG', MARGEM, y, 92, 61)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(GRAFITE[0], GRAFITE[1], GRAFITE[2])
  doc.text(EMPRESA.nome, largura - MARGEM, y + 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
  doc.text(EMPRESA.cnpj, largura - MARGEM, y + 28, { align: 'right' })
  doc.text(EMPRESA.endereco, largura - MARGEM, y + 40, { align: 'right' })
  doc.text(EMPRESA.contato, largura - MARGEM, y + 52, { align: 'right' })

  y += 74
  doc.setDrawColor(VINHO[0], VINHO[1], VINHO[2])
  doc.setLineWidth(2)
  doc.line(MARGEM, y, largura - MARGEM, y)
  y += 22

  // ---------- título ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(VINHO[0], VINHO[1], VINHO[2])
  const titulo =
    'ORÇAMENTO Nº ' + orcamento.numero + (orcamento.versao > 1 ? ' · versão ' + orcamento.versao : '')
  doc.text(titulo, MARGEM, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
  doc.text(dataBR(orcamento.created_at), largura - MARGEM, y, { align: 'right' })
  y += 20

  // ---------- dados do cliente ----------
  const campos: [string, string][] = []
  if (orcamento.nome_cliente) campos.push(['CLIENTE', orcamento.nome_cliente])
  if (orcamento.contato) campos.push(['CONTATO', orcamento.contato])
  if (orcamento.endereco_obra) campos.push(['OBRA', orcamento.endereco_obra])
  if (orcamento.responsavel) campos.push(['VENDEDOR', orcamento.responsavel])
  if (orcamento.validade) campos.push(['VÁLIDO ATÉ', dataBR(orcamento.validade)])

  for (const campo of campos) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text(campo[0], MARGEM, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(GRAFITE[0], GRAFITE[1], GRAFITE[2])
    const linhas = doc.splitTextToSize(campo[1], util - 70) as string[]
    doc.text(linhas, MARGEM + 70, y)
    y += Math.max(14, linhas.length * 11)
  }

  y += 8

  // ---------- itens, agrupados por categoria ----------
  const COL_DESC = MARGEM
  const COL_QTD = MARGEM + util * 0.62
  const COL_UN = MARGEM + util * 0.72
  const COL_PU = MARGEM + util * 0.84
  const FIM = largura - MARGEM

  function cabecalhoTabela() {
    doc.setFillColor(241, 245, 249)
    doc.rect(MARGEM, y - 10, util, 16, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text('DESCRIÇÃO', COL_DESC + 4, y)
    doc.text('QTD', COL_QTD, y, { align: 'right' })
    doc.text('UN', COL_UN, y, { align: 'right' })
    doc.text('UNITÁRIO', COL_PU, y, { align: 'right' })
    doc.text('TOTAL', FIM - 4, y, { align: 'right' })
    y += 16
  }

  function novaPaginaSePreciso(espaco: number) {
    if (y + espaco < altura - 70) return
    doc.addPage()
    y = MARGEM
    cabecalhoTabela()
  }

  cabecalhoTabela()

  const grupos = new Map<string, ItemOrcamento[]>()
  for (const i of itens) {
    const k = i.categoria_nome || 'Itens'
    const lista = grupos.get(k)
    if (lista) lista.push(i)
    else grupos.set(k, [i])
  }

  for (const grupo of Array.from(grupos.entries())) {
    novaPaginaSePreciso(30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(VINHO[0], VINHO[1], VINHO[2])
    doc.text(grupo[0].toUpperCase(), COL_DESC + 4, y + 2)
    y += 14

    for (const item of grupo[1]) {
      const desc = doc.splitTextToSize(item.descricao, COL_QTD - COL_DESC - 14) as string[]
      novaPaginaSePreciso(desc.length * 11 + 8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(GRAFITE[0], GRAFITE[1], GRAFITE[2])
      doc.text(desc, COL_DESC + 8, y)
      doc.text(String(Number(item.quantidade)), COL_QTD, y, { align: 'right' })
      doc.text(item.unidade, COL_UN, y, { align: 'right' })
      doc.text(reais(item.preco_unitario), COL_PU, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(reais(totalDoItem(item)), FIM - 4, y, { align: 'right' })
      y += Math.max(13, desc.length * 11)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.5)
      doc.line(MARGEM, y - 8, FIM, y - 8)
    }
    y += 6
  }

  // ---------- totais ----------
  const t = totais(itens, Number(orcamento.desconto_pct) || 0)
  novaPaginaSePreciso(90)
  y += 10

  function linhaTotal(rotulo: string, valor: string, forte: boolean) {
    doc.setFont('helvetica', forte ? 'bold' : 'normal')
    doc.setFontSize(forte ? 12 : 9)
    doc.setTextColor(
      forte ? VINHO[0] : CINZA[0],
      forte ? VINHO[1] : CINZA[1],
      forte ? VINHO[2] : CINZA[2]
    )
    doc.text(rotulo, FIM - 130, y, { align: 'right' })
    doc.setTextColor(forte ? VINHO[0] : GRAFITE[0], forte ? VINHO[1] : GRAFITE[1], forte ? VINHO[2] : GRAFITE[2])
    doc.text(valor, FIM - 4, y, { align: 'right' })
    y += forte ? 20 : 14
  }

  if (t.desconto > 0) {
    linhaTotal('Subtotal', reais(t.subtotal), false)
    linhaTotal('Desconto ' + Number(orcamento.desconto_pct) + '%', '- ' + reais(t.desconto), false)
  }
  linhaTotal('VALOR TOTAL', reais(t.total), true)

  // ---------- condições e observações ----------
  const rodapes: [string, string][] = []
  if (orcamento.condicoes) rodapes.push(['CONDIÇÕES DE PAGAMENTO', orcamento.condicoes])
  if (orcamento.observacoes && !orcamento.observacoes.startsWith('Importado')) {
    rodapes.push(['OBSERVAÇÕES', orcamento.observacoes])
  }
  for (const bloco of rodapes) {
    novaPaginaSePreciso(46)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text(bloco[0], MARGEM, y)
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(GRAFITE[0], GRAFITE[1], GRAFITE[2])
    const linhas = doc.splitTextToSize(bloco[1], util) as string[]
    doc.text(linhas, MARGEM, y)
    y += linhas.length * 11 + 4
  }

  // ---------- rodapé em todas as páginas ----------
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2])
    doc.text(EMPRESA.nome + '   ·   ' + EMPRESA.contato, MARGEM, altura - 26)
    doc.text(p + '/' + paginas, FIM, altura - 26, { align: 'right' })
  }

  const nome =
    'orcamento-' +
    orcamento.numero +
    (orcamento.versao > 1 ? '-v' + orcamento.versao : '') +
    (orcamento.nome_cliente ? '-' + orcamento.nome_cliente.replace(/[^a-zA-Z0-9]+/g, '-') : '') +
    '.pdf'
  doc.save(nome.toLowerCase())
}
