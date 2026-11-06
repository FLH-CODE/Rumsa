import { useEffect, useRef, useState } from 'react'

/**
 * Helskärmsläge via Fullscreen API – en genväg man lagt till på hemskärmen (manifestets
 * display:"fullscreen") döljer redan adressfältet, men i en vanlig öppen webbläsarflik går det
 * bara att dölja genom att användaren själv aktivt begär helskärm. Lyssnar på fullscreenchange
 * också, så knappens ikon/etikett stämmer om man lämnar helskärm med Esc/systemets tillbaka.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  // Minns om man VAR i helskärm precis innan sidan doldes – t.ex. att öppna kameran för att ta
  // ett foto (via <input capture>) tvingar webbläsaren ur helskärm automatiskt, och den återgår
  // inte av sig själv när man kommer tillbaka. Återställer då helskärmen åt användaren istället
  // för att lämna den i vanligt läge utan att de bett om det.
  const wasFullscreenRef = useRef(false)
  // Sätts när man kommer tillbaka till appen men helskärmen inte återställts av sig själv – väntar
  // på nästa riktiga användargest (se pointerdown-lyssnaren nedan) innan den faktiskt återställs.
  const pendingRestoreRef = useRef(false)

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  useEffect(() => {
    // Själva återställningen görs INTE här direkt – requestFullscreen() kräver en färsk, direkt
    // användargest (s.k. transient activation), och en visibilitychange-händelse räknas inte som
    // en sådan i de flesta webbläsare, så ett anrop härifrån misslyckas tyst. Sätter istället en
    // flagga och återställer på nästa riktiga pekar-/klickgest nedan, vilket ÄR en giltig gest.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasFullscreenRef.current = Boolean(document.fullscreenElement)
      } else if (document.visibilityState === 'visible' && wasFullscreenRef.current && !document.fullscreenElement) {
        pendingRestoreRef.current = true
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    // Fångar nästa riktiga användargest (tryck/klick) efter att man kommit tillbaka till appen –
    // t.ex. den naturliga första pekningen man gör på skärmen igen efter att ha tagit ett foto –
    // och använder DEN gesten för att återställa helskärmen, istället för att försöka (och
    // misslyckas) direkt från visibilitychange-händelsen ovan.
    const handlePointerDown = () => {
      if (!pendingRestoreRef.current) return
      pendingRestoreRef.current = false
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {
          // Vissa webbläsare/lägen tillåter ändå inte detta – då får adressfältet synas kvar
          // tills man trycker helskärmsknappen igen, samma som innan den här fixen.
        })
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [])

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Vissa webbläsare (t.ex. iOS Safari) saknar stöd för Fullscreen API helt – då finns
        // ingen bättre reserv än att låta adressfältet synas kvar.
      })
    }
  }

  return { isFullscreen, toggle }
}
