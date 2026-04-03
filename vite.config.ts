import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// Use temp dir for cache to avoid file-locking issues
const cacheDir = path.join(os.tmpdir(), 'vite-easyschematic')

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

let gitHash = 'unknown'
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch { /* not a git repo or git not available */ }

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,json}'],
        globIgnores: [
          '**/deviceLibrary.fallback.json',
          '**/og-image.png',
          '**/github-social.png',
          '**/landing-screenshot.png',
          '**/email-logo.png',
        ],
      },
      manifest: {
        name: 'EasySchematic — AV Signal Flow Diagram Tool',
        short_name: 'EasySchematic',
        description: 'Design audio/video signal flow diagrams for broadcast, live production, and AV integration.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  cacheDir,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(gitHash),
  },
})
