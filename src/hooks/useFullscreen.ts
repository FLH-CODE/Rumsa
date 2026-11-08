import { useEffect, useRef, useState } from 'react'

/**
 * Helskärmsläge via Fullscreen API – en genväg man lagt till på hemskärmen (manifestets
 * display:"fullscreen") döljer redan adressfältet, men i en vanlig öppen webbläsarflik går det
 * bara att dölja genom att användaren själv aktivt begär helskärm. Lyssnar på fullscreenchange
 * också, så knappens ikon/etikett stämmer om man lämnar helskärm med Esc/systemets tillbaka.
 */
export function useFullscreen() {
  // iOS Safari saknar helt stöd för Fullscreen API på vanlig sidinnehåll i en öppen flik (bara
  // <video> kan bli helskärm där) – `document.fullscreenEnabled` är false då. Ett tryck på
  // knappen gjorde (och kan aldrig göra) något synligt alls i det läget, vilket bara kändes
  // trasigt; döljer den istället (se FullscreenButton) så det inte ser ut som en bugg. Appen
  // tillagd på hemskärmen (manifestets display:"fullscreen") döljer redan adressfältet oavsett,
  // så den riktiga lösningen för iPhone är ändå att lägga till genvägen, inte den här knappen.
  const isSupported = typeof document.fullscreenEnabled === 'boolean' ? document.fullscreenEnabled : true
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  // Minns om man VAR i helskärm precis innan sidan doldes – t.ex. att öppna kameran för att ta
  // ett foto (via <input capture>) tvingar webbläsaren ur helskärm automatiskt, och den återgår
  // inte av sig själv när man kommer tillbaka. Återställer då helskärmen åt användaren istället
  // för att lämna den i vanligt läge utan att de bett om det.
  const wasFullscreenRef = useRef(false)
  // Sätts när man kommer tillbaka till appen men helskärmen inte återställts av sig själv – väntar
  // på nästa riktiga användargest (se click-lyssnaren nedan) innan den faktiskt återställs.
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
    // flagga och återställer på nästa riktiga klickgest nedan, vilket ÄR en giltig gest.
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
    // Fångar nästa riktiga tryckning efter att man kommit tillbaka till appen – t.ex. den
    // naturliga första pekningen man gör på skärmen igen efter att ha tagit ett foto – och
    // använder DEN för att återställa helskärmen, istället för att försöka (och misslyckas) direkt
    // från visibilitychange-händelsen ovan.
    //
    // Lyssnar på 'click', INTE 'pointerdown'/'touchstart' – ett scroll- eller dra-försök BÖRJAR
    // också med en pointerdown, så att återställa helskärm (vilket ändrar viewport-storleken när
    // adressfältet döljs) exakt där avbröt webbläsarens pågående scroll-gest mitt i, vilket i
    // praktiken gjorde det omöjligt att scrolla alls efter att ha kommit tillbaka från kameran.
    // 'click' triggas bara efter en RIKTIG, avslutad tryckning (inte en drag/scroll), så det stör
    // aldrig ett scroll-försök på samma sätt.
    const handleClick = () => {
      if (!pendingRestoreRef.current) return
      pendingRestoreRef.current = false
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {
          // Vissa webbläsare/lägen tillåter ändå inte detta – då får adressfältet synas kvar
          // tills man trycker helskärmsknappen igen, samma som innan den här fixen.
        })
      }
    }
    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
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

  return { isFullscreen, toggle, isSupported }
}
