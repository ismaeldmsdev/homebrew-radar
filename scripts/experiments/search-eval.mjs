// Evaluación del buscador: ejecuta búsquedas reales con un motor (el de una carpeta
// dada) contra el catálogo y la API de GitHub, y guarda los 5 primeros resultados.
//
//   node --experimental-strip-types scripts/experiments/search-eval.mjs --root <carpeta> --label <nombre> --out <archivo>
//
// Si <carpeta>/src/core/search.ts existe se usa su runSearch(); si no, se reproduce la
// lógica de la vista Buscar de Radar 2.2 (motor anterior).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const QUERIES = [
  // Generales
  'Aplicación para organizar fotografías',
  'Herramientas poco conocidas de inteligencia artificial',
  'Aplicaciones gratuitas para Windows',
  'Gestor de contraseñas autoalojado',
  'Biblioteca de Python para leer archivos PDF',
  'Herramientas de línea de comandos para buscar archivos',
  'Aplicaciones de código abierto para iPhone',
  'Automatizar tareas en el navegador',
  'Reproductor de música para Android',
  'Programa para tomar notas en Markdown',
  'Descargar vídeos de YouTube',
  'Aplicaciones nuevas de domótica',
  // Consolas
  'Homebrew para Nintendo Switch',
  'Custom firmware para PS Vita',
  'Herramientas para gestionar partidas guardadas de 3DS',
  'Emulador de PSP para Android',
  'Jailbreak de PS4',
  'Aplicaciones homebrew poco conocidas para Wii',
  'Herramientas para la tarjeta SD de la Nintendo DSi',
  'Personalizar el menú de la Nintendo 3DS',
  'Homebrew para Xbox 360',
  'Exploits para PS5',
  'Herramientas para Wii U',
  'Emuladores de consolas retro poco conocidos',
]

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = resolve(arg('--root', '.'))
const label = arg('--label', 'motor')
const out = arg('--out', `search-eval-${label}.json`)
const token = process.env.GITHUB_TOKEN
const mod = (path) => import(pathToFileURL(resolve(root, path)).href)

let lastCall = 0
/** Búsqueda en la API de GitHub con el token de Actions, respetando 30 búsquedas/minuto. */
async function searchRepos(q, sortParam = '') {
  const wait = lastCall + 2300 - Date.now()
  if (wait > 0) await new Promise((done) => setTimeout(done, wait))
  lastCall = Date.now()
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Radar-Evaluacion' }
  if (token) headers.Authorization = `Bearer ${token}`
  let response
  // Límite de búsquedas (403/429): esperar lo que indique GitHub y reintentar, en vez de
  // registrar la consulta como vacía (eso invalidaría la comparación).
  for (let attempt = 1; ; attempt++) {
    response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}${sortParam}&per_page=50`, { headers })
    if ((response.status !== 403 && response.status !== 429) || attempt > 4) break
    const retryAfter = Number(response.headers.get('retry-after'))
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : reset ? Math.max(5000, reset * 1000 - Date.now() + 2000) : 60_000
    console.log(`  · límite de GitHub; espero ${Math.round(Math.min(waitMs, 90_000) / 1000)} s y reintento`)
    await new Promise((done) => setTimeout(done, Math.min(waitMs, 90_000)))
    lastCall = Date.now()
  }
  if (!response.ok) throw new Error(`GitHub ${response.status} para «${q}»`)
  const data = await response.json()
  return { items: data.items ?? [], total: data.total_count ?? 0 }
}

const feedRaw = JSON.parse(readFileSync(resolve(root, 'public/data/projects.json'), 'utf8'))
const summariesPath = resolve(root, 'public/data/summaries.json')
const compact = existsSync(summariesPath) ? JSON.parse(readFileSync(summariesPath, 'utf8')) : {}
const now = Date.now()

async function legacyEngine() {
  const { normalizeFeed, mergeUnique } = await mod('src/core/feed.ts')
  const { interpretQuery, matchProject, buildGithubQueries } = await mod('src/core/query.ts')
  const { projectStatus } = await mod('src/core/scoring.ts')
  const { sortProjects } = await mod('src/explain.ts')
  const { projectFromSearch } = await mod('src/github.ts')
  const catalog = normalizeFeed(feedRaw).projects
  return async (query) => {
    const interp = interpretQuery(query)
    const relevance = new Map()
    for (const project of catalog) { const value = matchProject(project, interp, now); if (value > 0) relevance.set(project.id, value) }
    const local = catalog.filter((project) => relevance.has(project.id))
    const { primary, fallbacks } = buildGithubQueries(interp, { now })
    const sortParam = interp.sort === 'stars' ? '&sort=stars' : interp.sort === 'recent' ? '&sort=updated' : ''
    let items = []
    const tried = []
    for (const q of [primary, ...fallbacks]) { tried.push(q); ({ items } = await searchRepos(q, sortParam)); if (items.length) break }
    let live = items.filter((repo) => !repo.fork).map((repo, index) => projectFromSearch(repo, interp, index, now))
    if (interp.ownerType) live = live.filter((project) => project.ownerType === interp.ownerType)
    const combined = mergeUnique(local, live).filter((project) => {
      const status = projectStatus(project, now).id
      return status !== 'stale' && status !== 'archived'
    })
    const ranked = sortProjects(combined, 'interest', relevance)
    return { tried, results: ranked.map((project) => ({ project, relevance: relevance.get(project.id) ?? null })) }
  }
}

async function newEngine() {
  const { runSearch } = await mod('src/core/search.ts')
  const { normalizeFeed } = await mod('src/core/feed.ts')
  const catalog = normalizeFeed(feedRaw).projects
  return async (query) => {
    const outcome = await runSearch(query, { catalog, searchRepos, now, summaries: compact })
    return { tried: outcome.queriesTried, results: outcome.results.map((item) => ({ project: item.project, relevance: item.relevance, why: item.why })) }
  }
}

const engine = existsSync(resolve(root, 'src/core/search.ts')) ? await newEngine() : await legacyEngine()
const report = { label, engine: existsSync(resolve(root, 'src/core/search.ts')) ? 'nuevo' : 'anterior', at: new Date(now).toISOString(), queries: [] }
for (const query of QUERIES) {
  try {
    const { tried, results } = await engine(query)
    report.queries.push({
      query, tried, total: results.length,
      top: results.slice(0, 5).map(({ project, relevance, why }) => ({
        fullName: project.fullName, stars: project.stars, category: project.category, consoles: project.consoles,
        kinds: project.summary?.kinds ?? null, relevance: relevance === null || relevance === undefined ? null : Math.round(relevance * 100) / 100,
        score: project.score, source: project.source, why: why ?? null,
        about: (project.summary?.text ?? compact[project.id]?.t ?? project.description ?? '').slice(0, 220),
      })),
    })
    console.log(`✔ ${label} · ${query} · ${results.length} resultados`)
  } catch (error) {
    report.queries.push({ query, error: error.message, top: [] })
    console.log(`✖ ${label} · ${query} · ${error.message}`)
  }
}
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Informe: ${out}`)
