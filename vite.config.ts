import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'

// Put Vite's cache in temp dir to avoid Dropbox file-locking conflicts
const cacheDir = path.join(os.tmpdir(), 'vite-easyschematic')

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],
  cacheDir,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
