import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { assertLocalAgentUrls } from './src/lib/agentGuard.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // prefix '' para traer también las PAPERCLIP_* (no llevan prefijo VITE_), fusionadas
  // con process.env como documenta loadEnv.
  assertLocalAgentUrls(loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'DistriSuper — Planificación',
          short_name: 'Planificación',
          theme_color: '#182645',
          background_color: '#eef1f6',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: { host: true },
  }
})
