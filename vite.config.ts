import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

// Put Vite's cache in temp dir to avoid Dropbox file-locking conflicts
const cacheDir = path.join(os.tmpdir(), 'vite-easyschematic')

export default defineConfig({
  plugins: [react()],
  cacheDir,
})
