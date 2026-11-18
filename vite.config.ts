import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

function gitCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const url = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return url.match(/github\.com[:/](.+?)(\.git)?$/)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Escribe dist/version.json con el archivo JS de entrada de esta compilación.
 * El commit y la fecha van SOLO en version.json (no en el JS): así una
 * actualización de datos no cambia el hash del código ni dispara avisos falsos.
 */
function buildInfo(): Plugin {
  return {
    name: 'radar-build-info',
    apply: 'build',
    generateBundle(_, bundle) {
      const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry)
      if (!entry) return
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version: pkg.version, entry: entry.fileName, commit: gitCommit(), builtAt: new Date().toISOString() }, null, 2)}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS
    ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/`
    : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPOSITORY__: JSON.stringify(repository()),
  },
  plugins: [react(), buildInfo()],
})
