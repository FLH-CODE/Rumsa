import { useEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

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

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return [setNode, size] as const
}
