import { registerSW } from 'virtual:pwa-register'

/**
 * Registrerar service workern. Med registerType:"autoUpdate" (se vite.config.ts) laddar
 * vite-plugin-pwa redan om sidan HELT AUTOMATISKT så fort en ny version faktiskt upptäckts och
 * aktiverats (ingen egen kod behövs för själva omladdningen). Men "upptäckts" görs annars bara av
 * WEBBLÄSAREN SJÄLV vid en ny sidnavigering – håller man samma flik öppen (precis vad en SPA
 * uppmuntrar) kollas det annars aldrig igen, oavsett hur ofta.
 *
 * Den tidigare versionen av den här filen anropade registerSW():s egen returnerade funktion
 * (updateSW/updateServiceWorker) i en loop – men den funktionen är, i "autoUpdate"-läge
 * SPECIFIKT, bara ett no-op (den gör bara något i det ALTERNATIVA "prompt"-läget, se
 * node_modules/vite-plugin-pwa/dist/client/build/register.js). Hela den tidigare "kollen" (var
 * 2:a minut + vid återkomst till fliken) gjorde alltså ABSOLUT INGENTING – precis den sortens
 * flik som aldrig märker en ny version, som kommentaren ovan varnade för, var exakt vad den
 * bugiga koden faktiskt producerade. Fångar nu istället upp själva ServiceWorkerRegistration via
 * onRegisteredSW och anropar dess EGNA .update()-metod direkt, vilket FAKTISKT tvingar fram en
 * ny koll mot servern – sedan tar autoUpdate-lägets inbyggda omladdning över om något nytt hittas.
 */
let registration: ServiceWorkerRegistration | undefined

registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, reg) => {
    registration = reg
  },
})

const CHECK_INTERVAL_MS = 2 * 60 * 1000

function checkForUpdate() {
  void registration?.update()
}

setInterval(checkForUpdate, CHECK_INTERVAL_MS)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate()
})
