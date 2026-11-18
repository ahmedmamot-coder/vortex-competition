import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Files that must be served at a fixed address (not hashed): the service worker for
// Call Room phone alerts, the web-app manifest and its icons.
const staticFiles = () => ({
  name: 'vc-static-files',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync('sw.js', 'utf8') })
    this.emitFile({ type: 'asset', fileName: 'icon-192.png', source: readFileSync('icon-192.png') })
    this.emitFile({ type: 'asset', fileName: 'icon-512.png', source: readFileSync('icon-512.png') })
    this.emitFile({
      type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({
        name: 'Vortex Competition', short_name: 'Vortex', display: 'standalone', scope: '/',
        background_color: '#ffffff', theme_color: '#121236',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
      })
    })
  }
})

export default defineConfig({ plugins: [react(), staticFiles()] })
