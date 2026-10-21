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
  const saveRef = useRef(save)
  const isFirstRun = useRef(true)

  latestValue.current = value
  saveRef.current = save

  useEffect(() => {
    // Värdet är inte klart att spara än (t.ex. en post som fortfarande laddas från IndexedDB).
    // Räknas inte som "första körningen" förrän ett riktigt värde faktiskt har synts.
    if (value == null) return

    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    setStatus('saving')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      saveRef.current(latestValue.current)
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'))
    }, delayMs)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs])

  // Om komponenten avmonteras medan ett sparande fortfarande väntar i debounce-fönstret (t.ex. man
  // stänger inventeringsformuläret precis efter att ha skrivit klart) ska den sista ändringen
  // sparas direkt istället för att tyst kastas bort. Egen effekt med tom beroendelista så den bara
  // körs vid faktisk avmontering, inte vid varje omschemaläggning i effekten ovan.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        void saveRef.current(latestValue.current)
      }
    }
  }, [])

  return status
}
