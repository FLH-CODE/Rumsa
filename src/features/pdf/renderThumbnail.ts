import type { PDFPageProxy } from 'pdfjs-dist'

/** Renderas i enhetens egen pixeltäthet (inte bara CSS-pixlar) – annars blev miniatyren (fast
 * upplösning, satt en gång vid uppladdning) synligt pixelerad i sidlistan (se .viewer-sidebar,
 * 168px bred) på en skärm med hög pixeltäthet, t.ex. de flesta mobiler, där den visas större i
 * FYSISKA pixlar än den ritades i. Täcker även fallet att en ritning laddats upp på en enhet med
 * lägre pixeltäthet (t.ex. en vanlig datorskärm) och sedan öppnas/importeras på en mobil – samma
 * lagrade miniatyr måste då räcka till en skarpare skärm än den en gång renderades för. */
export async function renderThumbnail(page: PDFPageProxy, targetWidth = 220): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 })
  const dpr = window.devicePixelRatio || 1
  const scale = (targetWidth * dpr) / baseViewport.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const canvasContext = canvas.getContext('2d')!

  await page.render({ canvasContext, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}
