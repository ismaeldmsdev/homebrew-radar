// Resúmenes en español: caché versionada en data/summaries.json.
//
//   node --experimental-strip-types scripts/summaries.mjs <orden> [opciones]
//
//   prepare [--all] [--out archivo]   Descarga el README de los proyectos sin resumen (o con
//                                     documentación cambiada) y escribe un archivo de trabajo.
//   apply <resúmenes.json> --work <archivo>
//                                     Valida y guarda resúmenes redactados a mano (origen «curated»).
//   sync                              Copia la caché a public/data/projects.json y publica
//                                     public/data/summaries.json (para resultados en vivo).
//   auto                              Genera con IA local (llama.cpp) los resúmenes que faltan o
//                                     están desactualizados, con límites por ejecución. Necesita
//                                     SUMMARY_LOCAL_SERVER y SUMMARY_LOCAL_MODEL (rutas). Sin ellos
//                                     no hace nada y la web muestra la descripción básica.
//   request <owner/repo> [--comment archivo]
//                                     Genera el resumen de un repositorio concreto (solicitudes
//                                     desde la web mediante una issue del propietario).
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanReadme, fromStore, isOutdated, PROJECT_KINDS, shortHash, summaryProblems } from '../src/core/summary.ts'
import { startServer } from './local-llm.mjs'
import { PROMPT_VERSION, summarize } from './summarizer.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const storePath = resolve(root, 'data/summaries.json')
export const attemptsPath = resolve(root, 'data/summary-attempts.json')
const configPath = resolve(root, 'config/summarizer.json')
const feedPath = resolve(root, 'public/data/projects.json')
const publicStorePath = resolve(root, 'public/data/summaries.json')
const DAY = 86_400_000

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

export async function readStore(path = storePath) {
  const store = await readJson(path, null)
  return store && typeof store.summaries === 'object' ? store : { version: 1, summaries: {} }
}

export async function writeStore(store, path = storePath) {
  const sorted = Object.fromEntries(Object.entries(store.summaries).sort(([a], [b]) => Number(a) - Number(b)))
  await writeFile(path, `${JSON.stringify({ version: 1, summaries: sorted }, null, 2)}\n`)
}

/** Resumen listo para el catálogo, o null si no hay ninguno guardado. */
export function summaryFor(store, project, readmeLength = project.readmeLength ?? null) {
  const entry = store.summaries[String(project.id)]
  return entry ? fromStore(entry, project.description ?? '', readmeLength) : null
}

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README.rst', 'README.txt', 'README']

/** README en texto plano. Usa raw.githubusercontent.com (sin límite de la API) y la API como respaldo. */
export async function fetchReadme(fullName, { fetch: fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  for (const name of README_NAMES) {
    const response = await fetchImpl(`https://raw.githubusercontent.com/${fullName}/HEAD/${name}`).catch(() => null)
    if (response?.ok) return await response.text()
  }
  const headers = { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'Radar-Descubrimientos' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(`https://api.github.com/repos/${fullName}/readme`, { headers }).catch(() => null)
  return response?.ok ? await response.text() : ''
}

export function needsSummary(store, project, readmeLength) {
  const entry = store.summaries[String(project.id)]
  return !entry || isOutdated(entry.basis, project.description ?? '', readmeLength)
}

/** Información real de un proyecto para redactar su resumen. */
export async function workItem(project, options) {
  const raw = await fetchReadme(project.fullName, options)
  const readme = cleanReadme(raw, 3500)
  return {
    id: project.id,
    fullName: project.fullName,
    description: project.description ?? '',
    topics: project.topics ?? [],
    language: project.language ?? null,
    category: project.category ?? null,
    homepage: project.homepage ?? null,
    version: project.version ?? null,
    stars: project.stars ?? 0,
    readme,
    basis: { description: shortHash(project.description ?? ''), readmeLength: raw ? cleanReadme(raw, 1e9).length : null },
  }
}

async function mapLimit(items, limit, fn) {
  const results = []
  const queue = items.map((item, index) => [item, index])
  await Promise.all(Array.from({ length: limit }, async () => {
    while (queue.length) {
      const [item, index] = queue.shift()
      results[index] = await fn(item)
    }
  }))
  return results
}

export async function prepare({ all = false, ids = null, out = null, log = console.log } = {}) {
  const feed = await readJson(feedPath)
  const store = await readStore()
  let projects = feed?.projects ?? []
  if (ids) projects = projects.filter((project) => ids.includes(project.id))
  else if (!all) projects = projects.filter((project) => needsSummary(store, project, project.readmeLength ?? null))
  log(`Preparando ${projects.length} proyectos…`)
  const items = await mapLimit(projects, 6, (project) => workItem(project))
  if (out) await writeFile(out, `${JSON.stringify(items, null, 2)}\n`)
  return items
}

/** Valida y guarda resúmenes. Devuelve los rechazados con sus motivos. */
export function applySummaries(store, entries, work, now = new Date().toISOString(), origin = 'curated', generator = null) {
  const byId = new Map(work.map((item) => [item.id, item]))
  const byName = new Map(work.map((item) => [item.fullName.toLowerCase(), item]))
  const rejected = []
  for (const raw of entries) {
    const item = byId.get(raw.id) ?? byName.get(String(raw.fullName ?? '').toLowerCase())
    const entry = { ...raw, id: item?.id ?? raw.id }
    const kinds = entry.kinds ?? []
    const problems = item ? summaryProblems(entry.text ?? '', kinds) : ['No está en el archivo de trabajo.']
    if (entry.detail && entry.detail.length > 700) problems.push('El detalle es demasiado largo.')
    if (problems.length) { rejected.push({ id: entry.id, fullName: item?.fullName, problems }); continue }
    store.summaries[String(entry.id)] = {
      id: entry.id,
      fullName: item.fullName,
      text: entry.text.trim(),
      detail: entry.detail?.trim() || null,
      kinds: PROJECT_KINDS.filter((kind) => kinds.includes(kind)),
      origin,
      ...(entry.limited ? { limited: true } : {}),
      basis: item.basis,
      ...(generator ? { generator } : {}),
      updatedAt: now,
    }
  }
  return rejected
}

/** Caché compacta para la web (resultados en vivo). */
export function compactStore(store) {
  return Object.fromEntries(Object.values(store.summaries).map((entry) => [entry.id, {
    t: entry.text, d: entry.detail ?? null, k: entry.kinds, o: entry.origin, l: entry.limited ? 1 : 0, h: entry.basis.description, u: entry.updatedAt,
    ...(entry.generator ? { g: entry.generator.model } : {}),
  }]))
}

/** Añade los resúmenes guardados al catálogo y publica la caché compacta para la web. */
export async function sync({ log = console.log, store: storeFile = storePath, feed: feedFile = feedPath, publicStore = publicStorePath } = {}) {
  const feed = await readJson(feedFile)
  const store = await readStore(storeFile)
  if (!feed?.projects) throw new Error('No hay catálogo que sincronizar.')
  let count = 0
  for (const project of feed.projects) {
    const summary = summaryFor(store, project)
    if (summary) { project.summary = summary; count++ } else delete project.summary
  }
  await writeFile(feedFile, `${JSON.stringify(feed, null, 2)}\n`)
  const compact = compactStore(store)
  await writeFile(publicStore, `${JSON.stringify(compact)}\n`)
  log(`Resúmenes en el catálogo: ${count}/${feed.projects.length}. Caché pública: ${Object.keys(compact).length}.`)
  return { count, total: feed.projects.length }
}

// ---------- Generación automática ----------

export async function readConfig(path = configPath) {
  const config = await readJson(path, null)
  if (!config?.model?.name) throw new Error('config/summarizer.json no define el modelo.')
  return config
}

export function generatorFor(config) {
  return { model: config.model.name, file: config.model.file, llamaCpp: config.runtime.llamaCpp, promptVersion: PROMPT_VERSION }
}

const generatorKey = (generator) => `${generator.model}|${generator.llamaCpp}|${generator.promptVersion}`

export async function readAttempts(path = attemptsPath) {
  const data = await readJson(path, null)
  return data && typeof data.attempts === 'object' ? data : { version: 1, attempts: {} }
}

async function writeAttempts(attempts, path = attemptsPath) {
  const sorted = Object.fromEntries(Object.entries(attempts.attempts).sort(([a], [b]) => Number(a) - Number(b)))
  await writeFile(path, `${JSON.stringify({ version: 1, attempts: sorted }, null, 2)}\n`)
}

/**
 * Proyectos pendientes por prioridad: primero los que no tienen resumen, luego los
 * desactualizados; dentro de cada grupo, los de mayor puntuación. Se omiten los que ya
 * fallaron con el mismo generador y la misma documentación hace menos de `retryAfterDays`.
 */
export function pendingProjects(projects, store, attempts, generator, { now = Date.now(), retryAfterDays = 14 } = {}) {
  const key = generatorKey(generator)
  return projects
    .filter((project) => !project.archived && !project.isList)
    .map((project) => {
      const entry = store.summaries[String(project.id)]
      const missing = !entry
      const outdated = Boolean(entry) && isOutdated(entry.basis, project.description ?? '', project.readmeLength ?? null)
      return { project, missing, outdated }
    })
    .filter(({ missing, outdated }) => missing || outdated)
    .filter(({ project }) => {
      const attempt = attempts.attempts[String(project.id)]
      if (!attempt) return true
      const sameDocs = attempt.basis?.description === shortHash(project.description ?? '')
      return !(attempt.generator === key && sameDocs && now - Date.parse(attempt.at) < retryAfterDays * DAY)
    })
    .sort((a, b) => Number(b.missing) - Number(a.missing) || (b.project.score ?? 0) - (a.project.score ?? 0))
    .map(({ project }) => project)
}

/** Genera, valida y guarda; los rechazados quedan registrados y con la descripción básica. */
async function generateFor(projects, { store, attempts, provider, generator, log, deadline, fetch: fetchImpl }) {
  const key = generatorKey(generator)
  const outcome = { generated: [], rejected: [], skipped: 0 }
  for (const project of projects) {
    if (Date.now() > deadline) { outcome.skipped = projects.length - outcome.generated.length - outcome.rejected.length; log('Tiempo máximo alcanzado; el resto queda para la próxima ejecución.'); break }
    const item = await workItem(project, { fetch: fetchImpl })
    try {
      const result = await summarize(item, { fetch: fetchImpl, ...provider })
      const seconds = (result.attempts.reduce((sum, attempt) => sum + attempt.ms, 0) / 1000).toFixed(0)
      if (result.ok) {
        const rejected = applySummaries(store, [{ id: project.id, text: result.text, kinds: result.kinds, limited: result.limited }], [item], new Date().toISOString(), 'llm', generator)
        if (!rejected.length) {
          delete attempts.attempts[String(project.id)]
          outcome.generated.push({ fullName: project.fullName, text: result.text })
          log(`  ✔ ${project.fullName} (${seconds} s)`)
          continue
        }
        result.problems = rejected[0].problems
      }
      attempts.attempts[String(project.id)] = { fullName: project.fullName, basis: item.basis, generator: key, at: new Date().toISOString(), problems: result.problems.slice(0, 5) }
      outcome.rejected.push({ fullName: project.fullName, problems: result.problems })
      log(`  ✖ ${project.fullName} (${seconds} s): ${result.problems.slice(0, 3).join(' ')}`)
    } catch (error) {
      log(`  · ${project.fullName}: ${error.message}`)
      if (error.rateLimited) break
    }
  }
  return outcome
}

/** Proveedor: llama-server local (preferido) o una API compatible con OpenAI ya configurada. */
async function openProvider(env, config, log) {
  if (env.SUMMARY_LOCAL_SERVER && env.SUMMARY_LOCAL_MODEL) {
    const server = await startServer({
      binary: env.SUMMARY_LOCAL_SERVER, model: env.SUMMARY_LOCAL_MODEL, context: config.context ?? 4096,
      threads: Number(env.SUMMARY_THREADS ?? os.cpus().length), log,
    })
    return { provider: { url: server.url }, close: async () => { log(`Memoria máxima de llama-server: ${server.peakMemoryMB() ?? '?'} MB`); await server.stop() } }
  }
  if (env.SUMMARY_API_URL && env.SUMMARY_API_KEY && env.SUMMARY_MODEL) {
    return { provider: { url: env.SUMMARY_API_URL, key: env.SUMMARY_API_KEY, model: env.SUMMARY_MODEL }, close: async () => {} }
  }
  return null
}

export async function auto({
  env = process.env, log = console.log, fetch: fetchImpl = globalThis.fetch, now = Date.now(),
  config = null, openProvider: open = openProvider, paths = {},
} = {}) {
  const settings = config ?? await readConfig()
  if (settings.enabled === false) { log('Generación automática desactivada en config/summarizer.json.'); return { generated: 0, skipped: true } }
  const feed = await readJson(paths.feed ?? feedPath)
  const store = await readStore(paths.store ?? storePath)
  const attempts = await readAttempts(paths.attempts ?? attemptsPath)
  const generator = generatorFor(settings)
  const pending = pendingProjects(feed?.projects ?? [], store, attempts, generator, { now, retryAfterDays: settings.retryAfterDays ?? 14 })
  const max = Number(env.SUMMARY_MAX || settings.maxPerRun || 15)
  log(`Resúmenes pendientes: ${pending.length}. En esta ejecución: hasta ${Math.min(max, pending.length)}.`)
  if (!pending.length) return { generated: 0, skipped: false, pending: 0 }
  const opened = await open(env, settings, log)
  if (!opened) { log('Sin modelo configurado: se mantiene la caché y la descripción básica para el resto.'); return { generated: 0, skipped: true } }
  const deadline = now + (settings.timeBudgetMinutes ?? 30) * 60_000
  let outcome
  try {
    outcome = await generateFor(pending.slice(0, max), { store, attempts, provider: opened.provider, generator, log, deadline, fetch: fetchImpl })
  } finally {
    await opened.close()
  }
  await writeStore(store, paths.store ?? storePath)
  await writeAttempts(attempts, paths.attempts ?? attemptsPath)
  log(`Generados ${outcome.generated.length}, rechazados ${outcome.rejected.length}, pendientes ${pending.length - outcome.generated.length}.`)
  return { generated: outcome.generated.length, rejected: outcome.rejected.length, skipped: false, pending: pending.length }
}

// ---------- Solicitudes desde la web ----------

export const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

/** Extrae «owner/repo» del título de una solicitud («Resumen: owner/repo»). */
export function parseRequest(title) {
  const match = String(title ?? '').trim().match(/^Resumen:\s*(\S+)\s*$/i)
  const name = match?.[1]?.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
  return name && REPO_PATTERN.test(name) ? name : null
}

async function fetchRepo(fullName, { fetch: fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Radar-Descubrimientos' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(`https://api.github.com/repos/${fullName}`, { headers })
  if (!response.ok) throw new Error(`GitHub respondió ${response.status} para ${fullName}.`)
  const repo = await response.json()
  if (repo.private) throw new Error('Solo se resumen repositorios públicos.')
  return {
    id: repo.id, fullName: repo.full_name, description: repo.description ?? '', topics: repo.topics ?? [], language: repo.language,
    homepage: repo.homepage || null, version: null, stars: repo.stargazers_count ?? 0, archived: Boolean(repo.archived),
  }
}

export async function request(fullName, { env = process.env, log = console.log, fetch: fetchImpl = globalThis.fetch, config = null, openProvider: open = openProvider, paths = {} } = {}) {
  if (!REPO_PATTERN.test(fullName)) throw new Error('Nombre de repositorio no válido.')
  const settings = config ?? await readConfig()
  const project = await fetchRepo(fullName, { fetch: fetchImpl })
  const store = await readStore(paths.store ?? storePath)
  const attempts = await readAttempts(paths.attempts ?? attemptsPath)
  const existing = store.summaries[String(project.id)]
  if (existing && existing.origin === 'curated' && !isOutdated(existing.basis, project.description, null)) {
    return { status: 'exists', fullName: project.fullName, text: existing.text }
  }
  const opened = await open(env, settings, log)
  if (!opened) throw new Error('No hay modelo configurado para generar resúmenes.')
  const generator = generatorFor(settings)
  let outcome
  try {
    outcome = await generateFor([project], { store, attempts, provider: opened.provider, generator, log, deadline: Date.now() + 15 * 60_000, fetch: fetchImpl })
  } finally {
    await opened.close()
  }
  await writeStore(store, paths.store ?? storePath)
  await writeAttempts(attempts, paths.attempts ?? attemptsPath)
  if (outcome.generated.length) return { status: 'generated', fullName: project.fullName, text: outcome.generated[0].text }
  return { status: 'rejected', fullName: project.fullName, problems: outcome.rejected[0]?.problems ?? ['No se pudo generar.'] }
}

export function requestComment(result) {
  if (result.status === 'generated') return `✅ Resumen generado automáticamente con IA local para **${result.fullName}** (sin revisión humana):\n\n> ${result.text}\n\nAparecerá en Radar en cuanto termine esta publicación.`
  if (result.status === 'exists') return `ℹ️ **${result.fullName}** ya tenía un resumen revisado:\n\n> ${result.text}`
  if (result.status === 'rejected') return `⚠️ El resumen generado para **${result.fullName}** no superó la validación, así que Radar seguirá mostrando la descripción básica.\n\nMotivos:\n${result.problems.map((problem) => `- ${problem}`).join('\n')}`
  return `⚠️ No se pudo procesar la solicitud: ${result.error}`
}

function option(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  const run = {
    async prepare() {
      const ids = option(args, '--ids')?.split(',').map(Number) ?? null
      const items = await prepare({ all: args.includes('--all'), ids, out: option(args, '--out') ?? resolve(root, 'summaries-work.json') })
      console.log(`Archivo de trabajo con ${items.length} proyectos (${items.filter((item) => !item.readme).length} sin README).`)
    },
    async apply() {
      const entries = await readJson(resolve(args[0]))
      const work = await readJson(resolve(option(args, '--work') ?? resolve(root, 'summaries-work.json')))
      const store = await readStore()
      const rejected = applySummaries(store, entries, work)
      await writeStore(store)
      console.log(`Guardados ${entries.length - rejected.length} resúmenes; rechazados ${rejected.length}.`)
      for (const item of rejected) console.log(`  ✖ ${item.fullName ?? item.id}: ${item.problems.join(' ')}`)
      if (rejected.length) process.exitCode = 1
    },
    sync: () => sync(),
    auto: () => auto(),
    async request() {
      const name = parseRequest(`Resumen: ${args[0] ?? ''}`)
      let result
      try {
        if (!name) throw new Error('Indica el repositorio como owner/repo.')
        result = await request(name)
      } catch (error) {
        result = { status: 'error', error: error.message }
      }
      console.log(requestComment(result))
      const commentFile = option(args, '--comment')
      if (commentFile) await writeFile(commentFile, requestComment(result))
      if (result.status === 'error') process.exitCode = 1
    },
  }[command]
  if (!run) { console.error('Órdenes: prepare | apply | sync | auto | request'); process.exitCode = 1 }
  else run().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
