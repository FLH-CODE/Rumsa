import { registerSW } from 'virtual:pwa-register'

/**
 * Registrerar service workern och kollar aktivt efter en ny version med jämna mellanrum –
 * annars upptäcker en flik som hållits öppen över flera driftsättningar aldrig en uppdatering
 * förrän den råkar laddas om helt (webbläsaren kollar annars bara vid sidladdning). skipWaiting +
 * clientsClaim (satt i vite.config.ts) gör att en hittad uppdatering aktiveras direkt utan att
 * fråga, så den här kollen är det som faktiskt får den att slå igenom i tid.
 */
const updateSW = registerSW({ immediate: true })

const CHECK_INTERVAL_MS = 60 * 60 * 1000

setInterval(() => {
  void updateSW()
}, CHECK_INTERVAL_MS)
