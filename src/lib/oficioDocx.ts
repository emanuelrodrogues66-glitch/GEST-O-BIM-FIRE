import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { Project, ProjectClient, ProjectCorrection, ProjectCorrectionItem } from '../types'
import {
  OFICIO_CIDADE_PADRAO,
  OFICIO_DESTINATARIO_PADRAO,
  OFICIO_RESPONSAVEL_CREA,
  OFICIO_RESPONSAVEL_TECNICO,
} from '../types'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function dataPorExtenso(): string {
  const h = new Date()
  return `${h.getDate()} de ${MESES[h.getMonth()]} de ${h.getFullYear()}`
}

function formatDateBR(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function paragrafo(texto: string, opcoes: any = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text: texto, size: 22, ...opcoes })],
    ...(opcoes.alignment ? { alignment: opcoes.alignment } : {}),
  })
}

/** Linha da tabela de identificação do processo. */
function linhaTabela(rotulo: string, valor: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { fill: 'F1F5F9' },
        children: [
          new Paragraph({ children: [new TextRun({ text: rotulo, bold: true, size: 20 })] }),
        ],
      }),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: valor, size: 20 })] })],
      }),
    ],
  })
}

export async function gerarOficioDocx(
  project: Project,
  client: Partial<ProjectClient>,
  correction: ProjectCorrection,
  items: ProjectCorrectionItem[]
): Promise<Blob> {
  const cidade = correction.cidade?.trim() || OFICIO_CIDADE_PADRAO
  const destinatario = (correction.destinatario?.trim() || OFICIO_DESTINATARIO_PADRAO)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const processo = client.numero_processo?.trim() || '—'
  const re = client.numero_re?.trim()

  const linhas: TableRow[] = [
    linhaTabela('Projeto', project.nome),
    linhaTabela('CNPJ / CPF', client.cnpj?.trim() || '—'),
    linhaTabela('Nº do processo', processo + (re ? `   ·   NIB/RE: ${re}` : '')),
  ]
  if (client.endereco_completo?.trim()) linhas.push(linhaTabela('Endereço', client.endereco_completo))
  if (client.ocupacao?.trim()) linhas.push(linhaTabela('Ocupação', client.ocupacao))
  linhas.push(
    linhaTabela(
      'Análise de',
      formatDateBR(correction.data) +
        (correction.analista?.trim() ? `   ·   Analista: ${correction.analista}` : '')
    )
  )

  // Blocos de exigência + resposta, um por item
  const blocosItens: Paragraph[] = []
  items.forEach((item) => {
    blocosItens.push(
      new Paragraph({
        spacing: { before: 240, after: 60 },
        children: [
          new TextRun({
            text: `Item ${String(item.numero).padStart(2, '0')} — Exigência`,
            bold: true,
            size: 22,
          }),
        ],
      })
    )
    blocosItens.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120, line: 276 },
        children: [new TextRun({ text: item.exigencia || '—', size: 22 })],
      })
    )
    blocosItens.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: 'Resposta', bold: true, size: 22 })],
      })
    )
    blocosItens.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120, line: 276 },
        children: [new TextRun({ text: item.resposta?.trim() || '—', size: 22 })],
      })
    )
  })

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 60 },
            children: [new TextRun({ text: 'OFÍCIO RESPOSTA', bold: true, size: 32 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1E293B', space: 6 } },
            children: [
              new TextRun({
                text: `Atendimento às exigências — ${correction.numero}ª correção`,
                size: 20,
                color: '475569',
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 360 },
            children: [new TextRun({ text: `${cidade}, ${dataPorExtenso()}.`, size: 22 })],
          }),

          paragrafo('Ao', { bold: true }),
          ...destinatario.map((l, i) => paragrafo(l, { bold: i === 0 })),

          new Paragraph({ spacing: { after: 240 }, children: [] }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: linhas,
          }),

          new Paragraph({ spacing: { after: 240 }, children: [] }),

          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 240, line: 276 },
            children: [
              new TextRun({
                text:
                  'Prezados Senhores, em atenção às exigências apontadas na análise do projeto acima ' +
                  'referenciado, apresentamos a seguir, item a item, os esclarecimentos e as providências ' +
                  'adotadas, permanecendo à disposição para quaisquer informações complementares que se ' +
                  'façam necessárias.',
                size: 22,
              }),
            ],
          }),

          ...blocosItens,

          ...(correction.observacoes?.trim()
            ? [
                new Paragraph({
                  spacing: { before: 240, after: 60 },
                  children: [new TextRun({ text: 'Considerações finais', bold: true, size: 22 })],
                }),
                new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { after: 120, line: 276 },
                  children: [new TextRun({ text: correction.observacoes, size: 22 })],
                }),
              ]
            : []),

          new Paragraph({
            spacing: { before: 360, after: 120 },
            children: [
              new TextRun({ text: 'Sendo o que se apresenta para o momento, subscrevemo-nos.', size: 22 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 720 },
            children: [new TextRun({ text: 'Atenciosamente,', size: 22 })],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240 },
            children: [new TextRun({ text: '_________________________________________', size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: OFICIO_RESPONSAVEL_TECNICO, bold: true, size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Responsável Técnico', size: 20, color: '475569' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: OFICIO_RESPONSAVEL_CREA, size: 20, color: '475569' })],
          }),
        ],
      },
    ],
  })

  return Packer.toBlob(doc)
}

/** Dispara o download do arquivo no navegador. */
export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
