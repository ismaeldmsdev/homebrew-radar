// Recopilador del radar: consulta la API REST oficial de GitHub para cada temática
// de config/topics.json, verifica README y versiones, puntúa y escribe
// public/data/projects.json. Nunca sustituye un catálogo válido por uno vacío.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyCategory, classifyConsoles, classifyGeneralCategory, isNintendoRelevant } from '../src/core/categories.ts'
import { interestScore } from '../src/core/scoring.ts'
import { looksLikeList } from '../src/core/text.ts'

export { classifyCategory, classifyConsoles } from '../src/core/categories.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'public/data/projects.json')
const configPath = resolve(root, 'config/topics.json')
const api = 'https://api.github.com'
const DAY = 86_400_000
export const SCHEMA_VERSION = 2

export class RateLimitError extends Error {}

function topicNames(topic) {
  return (topic.queries ?? []).flatMap((query) => [...query.matchAll(/topic:([\w-]+)/g)].map((match) => match[1]))
}

/** Relevancia 0..1 del repositorio para la temática en la que se encontró. */
function relevanceFor(repo, topic) {
  if (topic?.mode === 'nintendo') {
    const consoles = classifyConsoles(repo)
    if (consoles.length) return { value: Math.min(1, 0.5 + consoles.length * 0.2), reason: `Menciona compatibilidad con ${consoles.join(', ')} en sus metadatos.` }
    return { value: 0.15, reason: null }
  }
  if (!topic) return { value: 0.5, reason: null }
  const names = topicNames(topic)
  const tagged = (repo.topics ?? []).some((name) => names.includes(name))
  return { value: tagged ? 0.85 : 0.7, reason: tagged ? `Etiquetado por su autor dentro de «${topic.label}».` : `Encontrado en la temática «${topic.label}».` }
}

export function signalsFromRepo(repo) {
  return {
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at,
    createdAt: repo.created_at,
    description: repo.description ?? '',
    topics: repo.topics ?? [],
    hasReadme: typeof repo.has_readme === 'boolean' ? repo.has_readme : null,
    readmeQuality: typeof repo.readme_quality === 'boolean' ? repo.readme_quality : null,
    release: repo.release ? { tag: repo.release.tag_name, publishedAt: repo.release.published_at ?? null, url: repo.release.html_url ?? null } : null,
    releaseChecked: repo.release !== undefined,
    license: licenseName(repo.license),
    homepage: repo.homepage || null,
    archived: Boolean(repo.archived),
    isList: looksLikeList(repo.name ?? '', repo.description ?? '', repo.topics ?? []),
    starsDelta: repo.stars_delta ?? null,
    starsDeltaDays: repo.stars_delta_days ?? null,
  }
}

export function licenseName(license) {
  if (!license) return null
  if (license.spdx_id && license.spdx_id !== 'NOASSERTION') return license.spdx_id
  return license.name && license.name !== 'Other' ? license.name : null
}

export function scoreRepository(repo, topic = { mode: 'nintendo' }) {
  const relevance = relevanceFor(repo, topic)
  return interestScore(signalsFromRepo(repo), relevance.value, relevance.reason)
}

export function selectCandidates(repositories, limit = 25) {
  const recent = [...repositories].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
  const selected = new Map()
  for (const platform of ['DS', 'DSi', '3DS']) {
    for (const repo of recent.filter((item) => classifyConsoles(item).includes(platform)).slice(0, 8)) selected.set(repo.id, repo)
  }
  for (const repo of recent) {
    if (selected.size >= limit) break
    selected.set(repo.id, repo)
  }
  return [...selected.values()].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at)).slice(0, limit)
}

/** Preselección sin enriquecer: interés provisional, sin listas «awesome» y variando autores. */
export function selectGeneralCandidates(repositories, topic, limit = 16) {
  const ranked = [...repositories]
    .filter((repo) => !looksLikeList(repo.name ?? '', repo.description ?? '', repo.topics ?? []))
    .map((repo) => ({ repo, score: scoreRepository(repo, topic).score }))
    .sort((a, b) => b.score - a.score || b.repo.pushed_at.localeCompare(a.repo.pushed_at))
  const perOwner = new Map()
  const picked = []
  for (const { repo } of ranked) {
    const owner = repo.owner?.login ?? ''
    if ((perOwner.get(owner) ?? 0) >= 2) continue
    perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1)
    picked.push(repo)
    if (picked.length >= limit) break
  }
  return picked
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function createLabels(repo, previous, generatedAt) {
  const labels = []
  const old = previous.get(repo.id)
  const pushed = Date.parse(repo.pushed_at)
  const generated = Date.parse(generatedAt)
  const created = Date.parse(repo.created_at)
  if (!old && created >= generated - 30 * DAY) labels.push('Nuevo')
  const tag = repo.release?.tag_name ?? null
  if (old && tag && old.version !== tag) labels.push('Nueva versión')
  const pushedForward = old?.pushedAt && pushed > Date.parse(old.pushedAt)
  const releasePublishedAt = repo.release?.published_at
  const releaseForward = releasePublishedAt && Date.parse(releasePublishedAt) > Date.parse(old?.releasePublishedAt ?? '')
  if (pushedForward || releaseForward) {
    labels.push('Actualizado')
    if (pushedForward && Date.now() - Date.parse(old.pushedAt) > 180 * DAY) labels.push('Reactivado')
  }
  if (repo.stargazers_count < 100) labels.push('Poco conocido')
  return labels
}

/** Historial de estrellas (máx. 12 puntos en 30 días) para medir quién gana atención. */
export function starHistory(old, stars, generatedAt, previousGeneratedAt) {
  const now = Date.parse(generatedAt)
  const points = Array.isArray(old?.starHistory)
    ? old.starHistory.filter((point) => Array.isArray(point) && validDate(point[0]) && Number.isFinite(point[1]))
    : old && Number.isFinite(old.stars) && validDate(previousGeneratedAt) ? [[previousGeneratedAt, old.stars]] : []
  const recent = points.filter(([at]) => now - Date.parse(at) <= 30 * DAY && now - Date.parse(at) > 0)
  const history = [...recent, [generatedAt, stars]].slice(-12)
  const base = recent.find(([at]) => now - Date.parse(at) >= 6 * DAY) ?? recent[0]
  if (!base) return { starHistory: history, starsDelta: null, starsDeltaDays: null }
  return { starHistory: history, starsDelta: stars - base[1], starsDeltaDays: Math.round(((now - Date.parse(base[0])) / DAY) * 10) / 10 }
}

export function resolveQualifiers(template, now = Date.now()) {
  return template.replace(/\{days:(\d+)\}/g, (_, days) => new Date(now - Number(days) * DAY).toISOString().slice(0, 10))
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

/** Petición con reintentos ante errores temporales y esperas cortas por límite de la API. */
export async function request(path, ctx, { allowNotFound = false } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Radar-Descubrimientos' }
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`
  for (let attempt = 1; ; attempt++) {
    let response
    try {
      response = await ctx.fetch(`${api}${path}`, { headers })
    } catch (error) {
      if (attempt < 3) { await ctx.sleep(2000 * attempt); continue }
      throw new Error(`Error de red consultando ${path}: ${error.message}`)
    }
    if (allowNotFound && response.status === 404) return null
    if (response.ok) return response.json()
    const remaining = response.headers.get('x-ratelimit-remaining')
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    const retryAfter = Number(response.headers.get('retry-after'))
    const body = await response.text().catch(() => '')
    const limited = response.status === 429 || (response.status === 403 && (remaining === '0' || retryAfter > 0 || /rate limit/i.test(body)))
    if (limited) {
      const wait = retryAfter > 0 ? retryAfter * 1000 : reset ? reset * 1000 - Date.now() + 1000 : 60_000
      if (wait <= 65_000 && attempt < 4) { await ctx.sleep(Math.max(1000, wait)); continue }
      throw new RateLimitError(`Límite de la API de GitHub agotado para ${path}.${reset ? ` Disponible de nuevo: ${new Date(reset * 1000).toISOString()}.` : ''}`)
    }
    if (response.status >= 500 && attempt < 3) { await ctx.sleep(2000 * attempt); continue }
    throw new Error(`GitHub API respondió ${response.status} para ${path}.`)
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function searchTopic(topic, defaults, ctx, now) {
  const repositories = new Map()
  const qualifiers = topic.mode === 'nintendo' ? '' : resolveQualifiers(topic.qualifiers ?? defaults.qualifiers ?? '', now)
  for (const query of topic.queries) {
    const q = `${query} ${qualifiers}`.trim()
    const sort = topic.mode === 'nintendo' ? '&sort=updated&order=desc' : ''
    const result = await request(`/search/repositories?q=${encodeURIComponent(q)}${sort}&per_page=${topic.mode === 'nintendo' ? 25 : 40}`, ctx)
    for (const repo of result.items ?? []) {
      if (repo.fork || repo.archived || !(repo.size > 0) || !validDate(repo.pushed_at)) continue
      if (topic.mode === 'nintendo' && !isNintendoRelevant(repo)) continue
      repositories.set(repo.id, repo)
    }
    await ctx.sleep(ctx.searchDelay)
  }
  return [...repositories.values()]
}

async function enrich(repo, ctx) {
  const [readme, release] = await Promise.all([
    request(`/repos/${repo.full_name}/readme`, ctx, { allowNotFound: true }),
    request(`/repos/${repo.full_name}/releases/latest`, ctx, { allowNotFound: true }),
  ])
  const readmeText = readme?.content ? Buffer.from(readme.content, readme.encoding || 'base64').toString('utf8') : ''
  return {
    has_readme: Boolean(readmeText),
    readme_quality: readmeText.length >= 500 && (/^#{1,3}\s/m.test(readmeText) || /^[=-]{3,}\s*$/m.test(readmeText)),
    release: release && !release.draft && !release.prerelease ? release : null,
  }
}

function fromPrevious(old) {
  return {
    has_readme: typeof old.hasReadme === 'boolean' ? old.hasReadme : undefined,
    readme_quality: typeof old.readmeQuality === 'boolean' ? old.readmeQuality : undefined,
    release: old.releaseChecked === false ? undefined : old.version ? { tag_name: old.version, published_at: old.releasePublishedAt, html_url: old.releaseUrl } : null,
  }
}

function toProject(repo, extra, channels, topic, previous, generatedAt, previousGeneratedAt) {
  const history = starHistory(previous.get(repo.id), repo.stargazers_count, generatedAt, previousGeneratedAt)
  const data = { ...repo, ...extra, stars_delta: history.starsDelta, stars_delta_days: history.starsDeltaDays }
  const { score, reasons } = scoreRepository(data, topic)
  const nintendo = channels.includes('nintendo')
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    ownerType: repo.owner.type === 'User' || repo.owner.type === 'Organization' ? repo.owner.type : null,
    description: repo.description ?? '',
    url: repo.html_url,
    homepage: repo.homepage || null,
    stars: repo.stargazers_count,
    forks: repo.forks_count ?? 0,
    updatedAt: repo.updated_at,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    category: nintendo && topic.mode === 'nintendo' ? classifyCategory(repo) : classifyGeneralCategory(repo),
    consoles: classifyConsoles(repo),
    channels,
    version: extra.release?.tag_name ?? null,
    releasePublishedAt: extra.release?.published_at ?? null,
    releaseUrl: extra.release?.html_url ?? null,
    releaseChecked: extra.release !== undefined,
    hasReadme: typeof extra.has_readme === 'boolean' ? extra.has_readme : null,
    readmeQuality: typeof extra.readme_quality === 'boolean' ? extra.readme_quality : null,
    license: licenseName(repo.license),
    archived: Boolean(repo.archived),
    isList: looksLikeList(repo.name, repo.description ?? '', repo.topics ?? []),
    score,
    reasons,
    labels: createLabels({ ...repo, release: extra.release }, previous, generatedAt),
    language: repo.language ?? null,
    topics: repo.topics ?? [],
    starsDelta: history.starsDelta,
    starsDeltaDays: history.starsDeltaDays,
    starHistory: history.starHistory,
    source: 'catalog',
  }
}

const newsLabels = new Set(['Nuevo', 'Actualizado', 'Reactivado', 'Nueva versión'])

/** Proyectos de la recopilación anterior para una temática que hoy no se pudo actualizar. */
function staleProjects(oldFeed, topicId, legacy) {
  return (oldFeed?.projects ?? [])
    .filter((project) => (project.channels ?? (legacy ? ['nintendo'] : [])).includes(topicId))
    .map((project) => ({ ...project, channels: project.channels ?? ['nintendo'], labels: (project.labels ?? []).filter((label) => !newsLabels.has(label)) }))
}

export async function collect({
  token = process.env.GITHUB_TOKEN,
  output = outputPath,
  config = null,
  fetch: fetchImpl = globalThis.fetch,
  sleep: sleepImpl = sleep,
  searchDelay = token ? 2200 : 6500,
  now = Date.now(),
  log = console.log,
} = {}) {
  const settings = config ?? await readJson(configPath)
  if (!settings?.topics?.length) throw new Error('config/topics.json no define ninguna temática.')
  const ctx = { token, fetch: fetchImpl, sleep: sleepImpl, searchDelay }
  const oldFeed = await readJson(output)
  const legacy = oldFeed && typeof oldFeed.schemaVersion !== 'number'
  const previous = new Map((oldFeed?.projects ?? []).map((project) => [project.id, project]))
  const generatedAt = new Date(now).toISOString()
  const defaults = settings.defaults ?? {}

  const found = new Map()
  const topicStatus = []
  let rateLimited = false
  for (const topic of settings.topics) {
    const limit = topic.limit ?? defaults.limit ?? 16
    try {
      if (rateLimited) throw new RateLimitError('Se omitió por el límite de la API.')
      const repos = await searchTopic(topic, defaults, ctx, now)
      const candidates = topic.mode === 'nintendo' ? selectCandidates(repos, limit) : selectGeneralCandidates(repos, topic, limit)
      if (candidates.length === 0 && staleProjects(oldFeed, topic.id, legacy).length > 0) throw new Error('La búsqueda no devolvió resultados válidos.')
      for (const repo of candidates) {
        const entry = found.get(repo.id)
        if (entry) entry.channels.push(topic.id)
        else found.set(repo.id, { repo, topic, channels: [topic.id] })
      }
      topicStatus.push({ topic, status: 'ok', count: candidates.length, collectedAt: generatedAt })
      log(`✔ ${topic.label}: ${candidates.length} candidatos.`)
    } catch (error) {
      if (error instanceof RateLimitError) rateLimited = true
      const old = (oldFeed?.topics ?? []).find((item) => item.id === topic.id)
      topicStatus.push({ topic, status: 'stale', count: 0, collectedAt: old?.collectedAt ?? (legacy && topic.id === 'nintendo' ? oldFeed.generatedAt : null), error: error.message })
      log(`✖ ${topic.label}: ${error.message} Se conserva la recopilación anterior.`)
    }
  }

  const entries = [...found.values()]
  const enrichment = new Map()
  let enrichmentStopped = false
  const queue = [...entries]
  async function worker() {
    while (queue.length) {
      const { repo } = queue.shift()
      const old = previous.get(repo.id)
      if (enrichmentStopped) { enrichment.set(repo.id, old ? fromPrevious(old) : {}); continue }
      try {
        enrichment.set(repo.id, await enrich(repo, ctx))
      } catch (error) {
        if (error instanceof RateLimitError) enrichmentStopped = true
        enrichment.set(repo.id, old ? fromPrevious(old) : {})
        log(`  · No se pudo verificar ${repo.full_name}: ${error.message}`)
      }
      await ctx.sleep(100)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))

  const projects = entries.map(({ repo, topic, channels }) => toProject(repo, enrichment.get(repo.id) ?? {}, channels, topic, previous, generatedAt, oldFeed?.generatedAt))
  const ids = new Set(projects.map((project) => project.id))
  for (const status of topicStatus.filter((item) => item.status === 'stale')) {
    const kept = staleProjects(oldFeed, status.topic.id, legacy)
    for (const project of kept) {
      const current = projects.find((item) => item.id === project.id)
      if (current) { if (!current.channels.includes(status.topic.id)) current.channels.push(status.topic.id) }
      else { projects.push(project); ids.add(project.id) }
    }
    status.count = kept.length
  }
  projects.sort((a, b) => b.score - a.score || b.pushedAt.localeCompare(a.pushedAt))

  if (topicStatus.every((item) => item.status !== 'ok')) throw new Error('Ninguna temática se pudo actualizar; se conserva el catálogo anterior sin cambios.')
  if (projects.length === 0) throw new Error('La recopilación no produjo proyectos; se conserva el catálogo anterior.')
  const previousCount = oldFeed?.projects?.length ?? 0
  if (previousCount >= 20 && projects.length < previousCount * 0.25) {
    throw new Error(`La recopilación produjo ${projects.length} proyectos frente a ${previousCount} anteriores; parece incompleta y se conserva el catálogo anterior.`)
  }

  const topics = topicStatus.map(({ topic, status, count, collectedAt, error }) => ({
    id: topic.id, label: topic.label, description: topic.description ?? '', featured: Boolean(topic.featured),
    status, count: status === 'ok' ? projects.filter((project) => project.channels.includes(topic.id)).length : count,
    collectedAt, ...(error ? { error } : {}),
  }))
  const feed = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: { name: 'GitHub REST API', url: 'https://docs.github.com/rest' },
    topics,
    projects,
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(feed, null, 2)}\n`)
  return feed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collect().then(({ projects, topics }) => {
    const stale = topics.filter((topic) => topic.status !== 'ok')
    console.log(`Catálogo actualizado: ${projects.length} proyectos en ${topics.length} temáticas${stale.length ? ` (${stale.length} conservadas de la recopilación anterior)` : ''}.`)
  }).catch((error) => {
    console.error(`Falló la recopilación: ${error.message}`)
    process.exitCode = 1
  })
}
