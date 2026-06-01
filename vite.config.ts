import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

// Use temp dir for cache to avoid file-locking issues
const cacheDir = path.join(os.tmpdir(), 'vite-easyschematic')

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function readGitHashFromDir(rootDir: string): string | null {
  const gitDir = path.join(rootDir, '.git')
  if (!existsSync(gitDir)) return null

  try {
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim()
    if (!head.startsWith('ref: ')) return head.slice(0, 7)

    const refPath = head.slice(5).trim()
    const refFile = path.join(gitDir, refPath)
    if (existsSync(refFile)) {
      return readFileSync(refFile, 'utf-8').trim().slice(0, 7)
    }

    const packedRefsFile = path.join(gitDir, 'packed-refs')
    if (existsSync(packedRefsFile)) {
      const packedRefs = readFileSync(packedRefsFile, 'utf-8')
      const match = packedRefs.match(new RegExp(`^([0-9a-f]{40})\\s+${refPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
      if (match) return match[1].slice(0, 7)
    }
  } catch { /* fall through */ }

  return null
}

function resolveGitHash(): string {
  const envHash =
    process.env.VITE_BUILD_HASH ??
    process.env.GIT_COMMIT ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_COMMIT ??
    process.env.CI_COMMIT_SHA

  if (envHash && envHash.trim()) return envHash.trim().slice(0, 7)

  const localHash = readGitHashFromDir(process.cwd())
  if (localHash) return localHash

  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

const gitHash = resolveGitHash()

function buildInfoPlugin(): Plugin {
  return {
    name: 'build-info-file',
    generateBundle(this: { emitFile: (file: { type: "asset"; fileName: string; source: string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({
          version: pkg.version,
          hash: gitHash,
          builtAt: new Date().toISOString(),
        }, null, 2),
      })
    },
  }
}

export default defineConfig({
  // Resolve TypeScript sources before .js so stale emitted .js shadows can't silently win.
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  plugins: [
    react(),
    buildInfoPlugin(),
  ],
  cacheDir,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(gitHash),
  },
})
