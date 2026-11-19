// Vista previa de «Seguridad y confianza» con repositorios reales. SOLO metadatos JSON de
// la API de GitHub y de OpenSSF Scorecard: no descarga ni ejecuta ningún archivo publicado.
import { writeFileSync, mkdirSync } from 'node:fs'
import { assessSecurity, executableAssets } from '../../src/core/security.ts'
import { fetchSecurityFacts } from '../../src/core/securityFetch.ts'

// Perfiles distintos: con atestaciones e inmutables, instaladores sin procedencia, avisos
// publicados, proyectos pequeños, sin releases y una biblioteca sin ejecutables.
export const REPOS = [
  'cli/cli', 'LenovoLegionToolkit-Team/LenovoLegionToolkit', 'Tyrrrz/YoutubeDownloader', 'nilsteampassnet/TeamPass',
  'hrydgard/ppsspp', 'erez-c137/NetSpeedTray', 'ryanlua/auraclick', 'genesistoxical/drop-icons',
  'crossterm-rs/crossterm', 'fabianquilpue/Laura_WordProcessor_3DS',
]

const token = process.env.GITHUB_TOKEN
const github = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Radar-Seguridad', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub ${response.status} en ${path}`)
  return response.json()
}
const external = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const report = { at: new Date().toISOString(), repos: [] }
for (const fullName of REPOS) {
  try {
    const facts = await fetchSecurityFacts(fullName, { github, external })
    const signals = assessSecurity(facts, fullName)
    report.repos.push({
      fullName, release: facts.release?.tag ?? null, immutable: facts.release?.immutable ?? null,
      executables: facts.release ? executableAssets(facts.release.assets).map((asset) => ({ name: asset.name, digest: asset.digest, attestations: asset.digest ? facts.attestations[asset.digest] ?? null : null })) : [],
      advisories: facts.advisories?.map((advisory) => `${advisory.id} (${advisory.severity})`) ?? null,
      scorecard: facts.scorecard === 'none' ? 'sin datos' : facts.scorecard ? facts.scorecard.date : 'no consultado',
      signals: signals.map((signal) => `[${signal.status}] ${signal.title}`),
    })
    console.log(`✔ ${fullName}: ${signals.length} señales`)
  } catch (error) {
    report.repos.push({ fullName, error: error.message })
    console.log(`✖ ${fullName}: ${error.message}`)
  }
}
mkdirSync('experiments/security-preview', { recursive: true })
writeFileSync('experiments/security-preview/senales.json', `${JSON.stringify(report, null, 2)}\n`)
