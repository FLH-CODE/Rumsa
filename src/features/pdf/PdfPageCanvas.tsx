import { useEffect, useRef } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

export function PdfPageCanvas({
  doc,
  pageIndex,
  scale = 2,
}: {
  doc: PDFDocumentProxy
  pageIndex: number
  scale?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let renderTask: RenderTask | null = null
    let cancelled = false

    doc.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const canvasContext = canvas.getContext('2d')!
      renderTask = page.render({ canvasContext, viewport, canvas })
      renderTask.promise.catch(() => {
        /* avbruten rendering vid snabb sidbyte – inget fel att visa */
      })
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageIndex, scale])

  return <canvas ref={canvasRef} />
}
