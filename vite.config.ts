import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// Put Vite's cache in temp dir to avoid Dropbox file-locking conflicts
const cacheDir = path.join(os.tmpdir(), 'vite-easyschematic')

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

let gitHash = 'unknown'
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch { /* not a git repo or git not available */ }

export default defineConfig({
  plugins: [react()],
  cacheDir,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(gitHash),
  },
})
