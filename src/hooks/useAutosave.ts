import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Debouncar ett värde och sparar det automatiskt via `save`.
 * Används för fält som ska skrivas till IndexedDB kontinuerligt utan explicit spara-knapp,
 * t.ex. inventeringsformulär på en byggarbetsplats där man inte vill riskera att tappa arbete.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delayMs = 500) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestValue = useRef(value)
  const isFirstRun = useRef(true)

  latestValue.current = value

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    setStatus('saving')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      save(latestValue.current)
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'))
    }, delayMs)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs])

  return status
}
