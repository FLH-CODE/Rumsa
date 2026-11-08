import { registerSW } from 'virtual:pwa-register'

/**
 * Registrerar service workern och kollar aktivt efter en ny version med jämna mellanrum –
 * annars upptäcker en flik som hållits öppen över flera driftsättningar aldrig en uppdatering
 * förrän den råkar laddas om helt (webbläsaren kollar annars bara vid sidladdning). skipWaiting +
 * clientsClaim (satt i vite.config.ts) gör att en hittad uppdatering aktiveras direkt utan att
 * fråga, så den här kollen är det som faktiskt får den att slå igenom i tid.
 */
const updateSW = registerSW({ immediate: true })

// En timme var för lång under en period med täta driftsättningar – en flik man öppnat tidigare
// samma dag kunde då testas mot en (eller flera!) gamla versioner utan att man märkte det.
// Kollar nu mycket oftare, OCH direkt varje gång man kommer tillbaka till appen (t.ex. efter att
// ha bytt till en annan app och tillbaka på mobilen) – det är ändå den naturliga punkten där man
// faktiskt börjar testa något, inte mitt i en pågående session.
const CHECK_INTERVAL_MS = 2 * 60 * 1000

setInterval(() => {
  void updateSW()
}, CHECK_INTERVAL_MS)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void updateSW()
})
