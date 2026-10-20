import type { PDFPageProxy } from 'pdfjs-dist'

export async function renderThumbnail(page: PDFPageProxy, targetWidth = 220): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = targetWidth / baseViewport.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const canvasContext = canvas.getContext('2d')!

  await page.render({ canvasContext, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}
