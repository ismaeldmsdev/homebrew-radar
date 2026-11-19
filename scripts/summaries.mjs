// Resúmenes en español: caché versionada en data/summaries.json.
//
//   node --experimental-strip-types scripts/summaries.mjs <orden> [opciones]
//
//   prepare [--all] [--out archivo]   Descarga el README de los proyectos sin resumen (o con
//                                     documentación cambiada) y escribe un archivo de trabajo
//                                     con la información real que hay que resumir.
//   apply <resúmenes.json> --work <archivo>
//                                     Valida y guarda resúmenes redactados ({id, text, detail,
//                                     kinds, limited}) en la caché, con la huella de la
//                                     documentación usada.
//   sync                              Copia la caché a public/data/projects.json y publica
//                                     public/data/summaries.json (para resultados en vivo).
//   auto                              Genera resúmenes con un modelo de lenguaje SOLO si hay un
//                                     proveedor configurado (SUMMARY_API_URL, SUMMARY_API_KEY,
//                                     SUMMARY_MODEL; API compatible con OpenAI). Sin proveedor,
//                                     no hace nada: la web muestra la descripción básica honesta.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanReadme, fromStore, isOutdated, KIND_LABELS, PROJECT_KINDS, shortHash, summaryProblems } from '../src/core/summary.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const storePath = resolve(root, 'data/summaries.json')
const feedPath = resolve(root, 'public/data/projects.json')
const publicStorePath = resolve(root, 'public/data/summaries.json')

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

function needsSummary(store, project, readmeLength) {
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
export function applySummaries(store, entries, work, now = new Date().toISOString(), origin = 'curated') {
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
      updatedAt: now,
    }
  }
  return rejected
}

/** Añade los resúmenes guardados al catálogo y publica la caché compacta para la web. */
export async function sync({ log = console.log } = {}) {
  const feed = await readJson(feedPath)
  const store = await readStore()
  if (!feed?.projects) throw new Error('No hay catálogo que sincronizar.')
  let count = 0
  for (const project of feed.projects) {
    const summary = summaryFor(store, project)
    if (summary) { project.summary = summary; count++ } else delete project.summary
  }
  await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`)
  const compact = Object.fromEntries(Object.values(store.summaries).map((entry) => [entry.id, {
    t: entry.text, d: entry.detail ?? null, k: entry.kinds, o: entry.origin, l: entry.limited ? 1 : 0, h: entry.basis.description, u: entry.updatedAt,
  }]))
  await writeFile(publicStorePath, `${JSON.stringify(compact)}\n`)
  log(`Resúmenes en el catálogo: ${count}/${feed.projects.length}. Caché pública: ${Object.keys(compact).length}.`)
  return { count, total: feed.projects.length }
}

const SYSTEM_PROMPT = `Eres un redactor técnico que explica proyectos de software a personas que no saben programar.
Escribe en español de España, claro y natural, sin traducir palabra por palabra.
Usa SOLO la información proporcionada (descripción, temas y README). No inventes funciones, plataformas ni facilidad de uso.
Responde únicamente con JSON: {"text": string, "detail": string|null, "kinds": string[], "limited": boolean}.
- "text": 2 o 3 frases (110-480 caracteres): qué es, qué permite hacer y para qué podría usarlo alguien.
- "detail": hasta 3 frases con funciones concretas que el README menciona, o null.
- "kinds": de ${PROJECT_KINDS.map((kind) => `"${kind}" (${KIND_LABELS[kind]})`).join(', ')}. Solo los que la información respalda.
- "limited": true si la información es insuficiente; en ese caso dilo en el texto ("faltan datos para…").
Prohibido: "potente", "revolucionario", "fácil de usar/instalar", "herramienta de código abierto para mejorar la productividad".`

function userPrompt(item) {
  return `Repositorio: ${item.fullName}\nDescripción: ${item.description || '(sin descripción)'}\nTemas: ${item.topics.join(', ') || '(ninguno)'}\nLenguaje: ${item.language ?? 'desconocido'}\nWeb: ${item.homepage ?? 'no'}\nVersión publicada: ${item.version ?? 'no'}\n\nREADME (extracto):\n${item.readme || '(sin README)'}`
}

/** Llama a un proveedor compatible con la API de OpenAI y devuelve el JSON del resumen. */
export async function generateWithProvider(item, { url, key, model, fetch: fetchImpl = globalThis.fetch, feedback = null }) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(item) }]
  if (feedback) messages.push({ role: 'user', content: `Corrige estos problemas y responde de nuevo solo con JSON: ${feedback.join(' ')}` })
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
  })
  if (response.status === 429) throw Object.assign(new Error('Límite del proveedor alcanzado.'), { rateLimited: true })
  if (!response.ok) throw new Error(`El proveedor respondió ${response.status}.`)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  return JSON.parse(content.replace(/^```(json)?|```$/g, '').trim())
}

export async function auto({
  env = process.env, max = Number(env.SUMMARY_MAX ?? 20), delay = Number(env.SUMMARY_DELAY_MS ?? 7000),
  fetch: fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), log = console.log,
} = {}) {
  const provider = { url: env.SUMMARY_API_URL, key: env.SUMMARY_API_KEY, model: env.SUMMARY_MODEL, fetch: fetchImpl }
  if (!provider.url || !provider.key || !provider.model) {
    log('Sin proveedor de resúmenes configurado: se mantiene la caché y la descripción básica para el resto.')
    return { generated: 0, skipped: true }
  }
  const feed = await readJson(feedPath)
  const store = await readStore()
  const pending = (feed?.projects ?? []).filter((project) => needsSummary(store, project, project.readmeLength ?? null)).slice(0, max)
  let generated = 0
  for (const project of pending) {
    const item = await workItem(project, { fetch: fetchImpl })
    try {
      let result = await generateWithProvider(item, provider)
      let problems = summaryProblems(result.text ?? '', result.kinds ?? [])
      if (problems.length) {
        await sleep(delay)
        result = await generateWithProvider(item, { ...provider, feedback: problems })
      }
      const rejected = applySummaries(store, [{ ...result, id: project.id }], [item], new Date().toISOString(), 'llm')
      if (rejected.length) log(`  · ${project.fullName}: descartado (${rejected[0].problems.join(' ')})`)
      else { generated++; log(`  ✔ ${project.fullName}`) }
    } catch (error) {
      log(`  · ${project.fullName}: ${error.message}`)
      if (error.rateLimited) break
    }
    await sleep(delay)
  }
  await writeStore(store)
  log(`Resúmenes generados: ${generated} de ${pending.length} pendientes.`)
  return { generated, skipped: false }
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
  }[command]
  if (!run) { console.error('Órdenes: prepare | apply | sync | auto'); process.exitCode = 1 }
  else run().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
