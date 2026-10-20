import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjsLib } from '../../pdf/pdfjsSetup'
import { db } from '../../db'

/** Undviker att parsa om samma PDF varje gång man byter sida inom samma ritning. */
const documentCache = new Map<string, Promise<PDFDocumentProxy>>()

async function loadDocument(drawingId: string): Promise<PDFDocumentProxy> {
  const drawing = await db.drawings.get(drawingId)
  if (!drawing) throw new Error(`Drawing ${drawingId} finns inte`)
  const buffer = await drawing.pdfBlob.arrayBuffer()
  return pdfjsLib.getDocument({ data: buffer }).promise
}

interface Loaded {
  drawingId: string
  doc: PDFDocumentProxy | null
  error: Error | null
}

export function usePdfDocument(drawingId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!drawingId) return
    let cancelled = false

    if (!documentCache.has(drawingId)) {
      documentCache.set(drawingId, loadDocument(drawingId))
    }
    documentCache
      .get(drawingId)!
      .then((pdf) => {
        if (!cancelled) setLoaded({ drawingId, doc: pdf, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({ drawingId, doc: null, error: err instanceof Error ? err : new Error(String(err)) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [drawingId])

  // Ignorera resultat från en tidigare drawingId om props hunnit ändras innan laddningen var klar.
  const isCurrent = loaded?.drawingId === drawingId
  return {
    doc: isCurrent ? loaded.doc : null,
    error: isCurrent ? loaded.error : null,
  }
}
