import { useEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/** Hur länge storleken måste stå still innan den rapporteras vidare (utom den allra första
 * mätningen, som alltid rapporteras direkt). En skärmrotation på iPad genererar en hel störtflod
 * av ResizeObserver-tick medan adressfält/säkra ytor hinner i kapp – utan debounce triggade var och
 * en av dem en ny, tung PDF-rendering (se PdfPageCanvas) rakt i följd, vilket kunde få Safari att
 * hänga sig eller krascha fliken. */
const DEBOUNCE_MS = 200

/**
 * Mäter en elements innehållsstorlek reaktivt, t.ex. för att anpassa en PDF-sida efter
 * tillgängligt utrymme. Använder en callback-ref (inte useRef) eftersom elementet kan monteras
 * först efter att komponenten first renderat ett "Laddar…"-läge – en effekt med tom
 * beroendelista hade då aldrig sett det riktiga elementet.
 */
export function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [size, setSize] = useState<ElementSize | null>(null)

  useEffect(() => {
    if (!node) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (timeoutId !== null) clearTimeout(timeoutId)
      // Första mätningen (inget värde ännu) sätts direkt, annars dröjer den första renderingen
      // efter sidbyte/montering i onödan.
      setSize((prev) => {
        if (prev === null) return { width, height }
        timeoutId = setTimeout(() => setSize({ width, height }), DEBOUNCE_MS)
        return prev
      })
    })
    observer.observe(node)
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [node])

  return [setNode, size] as const
}
