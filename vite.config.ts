import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serverar projektet under /Rumsa/, inte domänroten. Lokal dev-server
  // (npm run dev) ligger kvar på roten så LAN-testning mot iPad/telefon fungerar som vanligt.
  base: command === 'build' ? '/Rumsa/' : '/',
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
        display: 'standalone',
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
