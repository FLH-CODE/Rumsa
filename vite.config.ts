import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Visas bredvid "Rumsa" på landningssidan (se ProjectListPage) – ett enkelt sätt att se om en
// given enhet faktiskt har laddat den senast driftsatta versionen eller en äldre, cachad en,
// utan att behöva gräva i devtools. Git-hashen (inte ett manuellt uppdaterat versionsnummer)
// så den alltid stämmer mot exakt den koden som faktiskt byggdes, utan att man kan glömma
// bumpa den. Faller tillbaka på "dev" om git av någon anledning inte går att fråga (t.ex. ett
// byggsteg utan .git-historik).
function readAppVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serverar projektet under /Rumsa/, inte domänroten. Lokal dev-server
  // (npm run dev) ligger kvar på roten så LAN-testning mot iPad/telefon fungerar som vanligt.
  base: command === 'build' ? '/Rumsa/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(readAppVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registreras manuellt i src/pwaUpdate.ts istället, som även pollar efter uppdateringar
      // regelbundet – annars upptäcker en flik som hålls öppen länge aldrig en ny version.
      injectRegister: null,
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'Rumsa – rumsinventering',
        short_name: 'Rumsa',
        description: 'Inventering av rum på plats – ritningar, rumstaggar och ytskikt.',
        theme_color: '#164e63',
        background_color: '#164e63',
        // Helskärm (döljer även OS-statusraden, inte bara webbläsarens adressfält) när appen är
        // tillagd på hemskärmen – display_override ger standalone som reserv på plattformar som
        // inte stödjer fullscreen. Gäller bara den installerade genvägen; en vanlig öppen
        // webbläsarflik kan aldrig dölja webbläsarens egen adressrad/flikrad.
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // PDF:er och projektdata lagras i IndexedDB, inte via service worker-cache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
}))
