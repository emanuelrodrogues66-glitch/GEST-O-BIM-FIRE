import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export type PdfPageOptions = {
  orientation?: 'landscape' | 'portrait'
  format?: string
}

export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  options: PdfPageOptions = {}
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const pdf = new jsPDF({
    orientation: options.orientation || 'landscape',
    unit: 'pt',
    format: options.format || 'a3',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidthPx = canvas.width
  const imgHeightPx = canvas.height

  // Scale factor to fit canvas width into PDF page width
  const ratio = pageWidth / imgWidthPx
  const pageHeightInCanvasPx = pageHeight / ratio

  let renderedHeight = 0
  let firstPage = true

  while (renderedHeight < imgHeightPx) {
    const sliceHeight = Math.min(pageHeightInCanvasPx, imgHeightPx - renderedHeight)

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = imgWidthPx
    pageCanvas.height = sliceHeight
    const ctx = pageCanvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, renderedHeight, imgWidthPx, sliceHeight, 0, 0, imgWidthPx, sliceHeight)

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.92)

    if (!firstPage) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, sliceHeight * ratio)

    renderedHeight += sliceHeight
    firstPage = false
  }

  pdf.save(filename)
}
