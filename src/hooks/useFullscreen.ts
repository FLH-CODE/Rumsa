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

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasFullscreenRef.current = Boolean(document.fullscreenElement)
      } else if (document.visibilityState === 'visible' && wasFullscreenRef.current && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {
          // En del webbläsare kräver en direkt användargest för requestFullscreen() och
          // tillåter inte detta från en visibilitychange-händelse – då får adressfältet
          // synas kvar tills man trycker helskärmsknappen igen, samma som innan den här fixen.
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
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
