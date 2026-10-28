import { useEffect, useState } from 'react'

/**
 * Helskärmsläge via Fullscreen API – en genväg man lagt till på hemskärmen (manifestets
 * display:"fullscreen") döljer redan adressfältet, men i en vanlig öppen webbläsarflik går det
 * bara att dölja genom att användaren själv aktivt begär helskärm. Lyssnar på fullscreenchange
 * också, så knappens ikon/etikett stämmer om man lämnar helskärm med Esc/systemets tillbaka.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
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
