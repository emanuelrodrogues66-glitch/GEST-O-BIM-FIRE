/**
 * Proposta comercial a partir do modelo do escritório.
 *
 * O modelo em PowerPoint continua sendo a fonte do desenho. Em vez de
 * redesenhar os slides em código — que envelheceria no primeiro ajuste de
 * layout que alguém fizesse no arquivo —, aqui o .pptx é aberto, o texto das
 * caixas que variam é trocado, e o arquivo é fechado de novo. Formas, fotos,
 * degradês e fontes ficam intactos porque nunca são tocados.
 *
 * Um .pptx é um zip de XML. Cada caixa de texto é um <p:sp> com um <p:txBody>
 * onde cada linha é um <a:p>. Para trocar uma lista de tamanho variável, o
 * primeiro <a:p> serve de molde: ele é clonado quantas vezes for preciso e só
 * o conteúdo de <a:t> muda. É por isso que a formatação sobrevive.
 */

import JSZip from 'jszip'

/** Onde cada campo mora: slide (1-based) e o nome da caixa de texto. */
const CAMPOS = {
  capa: { slide: 1, shape: 'TextBox 5' },
  exigencias: { slide: 5, shape: 'TextBox 7' },
  areas: { slide: 5, shape: 'CaixaDeTexto 8' },
  escopo: { slide: 6, shape: 'TextBox 7' },
  entregaveis: { slide: 7, shape: 'TextBox 7' },
  prazo: { slide: 8, shape: 'TextBox 7' },
  valor: { slide: 9, shape: 'TextBox 7' },
  condicoes: { slide: 9, shape: 'TextBox 18' },
  numeros: { slide: 3, shape: 'TextBox 14' },
} as const

export type DadosProposta = {
  enderecoObra: string
  cliente: string
  contato: string
  obra: string
  medidas: string[]
  areaExistente: string
  areaAmpliada: string
  escopo: string[]
  entregaveis: string[]
  prazo: string
  valor: number | null
  condicoes: string
}

/**
 * Medidas de segurança do CSCIP-PR, na ordem da tabela.
 *
 * A ordem importa: é a mesma da tabela que o Corpo de Bombeiros usa, e o
 * cliente que recebe a proposta costuma conferir item a item contra ela.
 */
export const MEDIDAS_SEGURANCA = [
  'ACESSO DE VIATURA NA EDIFICAÇÃO',
  'SEGURANÇA ESTRUTURAL CONTRA INCÊNDIO',
  'COMPARTIMENTAÇÃO HORIZONTAL',
  'COMPARTIMENTAÇÃO VERTICAL',
  'CONTROLE DE MATERIAIS DE ACABAMENTO',
  'SAÍDAS DE EMERGÊNCIA',
  'PLANO DE EMERGÊNCIA',
  'BRIGADA DE INCÊNDIO',
  'ILUMINAÇÃO DE EMERGÊNCIA',
  'DETECÇÃO DE INCÊNDIO',
  'ALARME DE INCÊNDIO',
  'SINALIZAÇÃO DE EMERGÊNCIA',
  'EXTINTORES',
  'HIDRANTE E MANGOTINHOS',
  'CHUVEIROS AUTOMÁTICOS',
  'CONTROLE DE FUMAÇA',
] as const

/** Entregáveis que o escritório sempre entrega, qualquer que seja o projeto. */
export const ENTREGAVEIS_PADRAO = [
  'MEMORIAIS DESCRITIVOS DAS MEDIDAS DE SEGURANÇA',
  'PROJETO EM ARQUIVO PDF E DWG',
  'PLANTA BAIXA DAS MEDIDAS DE SEGURANÇA',
  'DETALHES GERAIS MEDIDAS DE SEGURANÇA.',
]

/** Só entra quando a medida correspondente foi marcada. */
export const ENTREGAVEIS_POR_MEDIDA: Record<string, string> = {
  'HIDRANTE E MANGOTINHOS': 'ISOMETRICO HIDRANTES.',
}

export function entregaveisSugeridos(medidas: string[]): string[] {
  const extras = medidas
    .map((m) => ENTREGAVEIS_POR_MEDIDA[m])
    .filter((x): x is string => !!x)
  return [...ENTREGAVEIS_PADRAO, ...extras]
}

export function reaisProposta(v: number | null): string {
  if (v === null || Number.isNaN(v)) return 'A combinar'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ------------------------------------------------------------------ o motor

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

function acharTxBody(doc: Document, nomeShape: string): Element | null {
  const shapes = Array.from(doc.getElementsByTagName('p:sp'))
  for (const sp of shapes) {
    const nv = sp.getElementsByTagName('p:cNvPr')[0]
    if (nv?.getAttribute('name') === nomeShape) {
      return sp.getElementsByTagName('p:txBody')[0] || null
    }
  }
  return null
}

/**
 * Reescreve as linhas de uma caixa de texto.
 *
 * Usa o primeiro parágrafo como molde e descarta os demais. Se a caixa tiver
 * mais de um estilo entre as linhas — o que não acontece neste modelo — todas
 * sairiam com o estilo da primeira; é uma troca consciente, porque o que se
 * ganha é a lista poder ter qualquer tamanho.
 */
function escreverLinhas(txBody: Element, linhas: string[]) {
  const paras = Array.from(txBody.getElementsByTagName('a:p'))
  if (paras.length === 0) return

  const molde = paras[0]
  for (let i = 1; i < paras.length; i++) paras[i].remove()

  const usadas = linhas.length ? linhas : ['']
  const novos: Element[] = []

  for (const linha of usadas) {
    const p = molde.cloneNode(true) as Element
    const runs = Array.from(p.getElementsByTagName('a:r'))
    // Uma linha do modelo pode estar quebrada em vários <a:r>. Mantém o
    // primeiro (que carrega a formatação) e joga o resto fora.
    for (let i = 1; i < runs.length; i++) runs[i].remove()
    const t = p.getElementsByTagNameNS(NS_A, 't')[0] || p.getElementsByTagName('a:t')[0]
    if (t) {
      t.textContent = linha
      // xml:space preserva o espaço final de linhas como "PROJETO EM PDF E DWG "
      t.setAttribute('xml:space', 'preserve')
    }
    novos.push(p)
  }

  molde.remove()
  for (const p of novos) txBody.appendChild(p)
}

/** Monta o .pptx da proposta a partir do modelo publicado com o app. */
export async function gerarProposta(
  dados: DadosProposta,
  urlModelo = '/modelos/proposta-bimfire.pptx'
): Promise<Blob> {
  const resposta = await fetch(urlModelo)
  if (!resposta.ok) {
    throw new Error(
      'Não encontrei o modelo da proposta. Avise o administrador para republicar o arquivo.'
    )
  }
  const zip = await JSZip.loadAsync(await resposta.arrayBuffer())

  const parser = new DOMParser()
  const serializer = new XMLSerializer()
  const docs = new Map<number, Document>()

  async function doc(slide: number): Promise<Document> {
    if (!docs.has(slide)) {
      const xml = await zip.file(`ppt/slides/slide${slide}.xml`)!.async('string')
      docs.set(slide, parser.parseFromString(xml, 'application/xml'))
    }
    return docs.get(slide)!
  }

  async function preencher(campo: keyof typeof CAMPOS, linhas: string[]) {
    const { slide, shape } = CAMPOS[campo]
    const d = await doc(slide)
    const tx = acharTxBody(d, shape)
    if (tx) escreverLinhas(tx, linhas)
  }

  await preencher('capa', [
    `ENDEREÇO DA OBRA: ${dados.enderecoObra}`,
    `Cliente: ${dados.cliente}`,
    `Contato: ${dados.contato}`,
    `Obra: ${dados.obra}`,
  ].filter((l) => !/:\s*$/.test(l)))

  await preencher('exigencias', dados.medidas.map((m) => `${m}:`))

  await preencher(
    'areas',
    [
      dados.areaExistente && `ÁREA TOTAL EXISTENTE: ${dados.areaExistente}`,
      dados.areaAmpliada && `ÁREA A SER AMPLIADA: ${dados.areaAmpliada}`,
    ].filter(Boolean) as string[]
  )

  await preencher('escopo', dados.escopo)
  await preencher('entregaveis', dados.entregaveis)
  await preencher('prazo', [dados.prazo])
  await preencher('valor', [reaisProposta(dados.valor)])
  await preencher('condicoes', [dados.condicoes])

  for (const [slide, d] of docs) {
    zip.file(`ppt/slides/slide${slide}.xml`, serializer.serializeToString(d))
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}

/**
 * Nome do arquivo no padrão do escritório: NNMMAA_PPCI - Cliente.
 *
 * O NNMMAA não é a data: é o número do orçamento, sequencial dentro do mês.
 * 050826 foi o quinto orçamento de agosto de 2026 — foi assim que o arquivo
 * do Verona chegou aqui.
 */
export function nomeDoArquivo(numero: string, cliente: string, extensao: string): string {
  const limpo = (cliente || 'Proposta').replace(/[\\/:*?"<>|]/g, '-').trim()
  return `${numero}_PPCI - ${limpo}.${extensao}`
}
