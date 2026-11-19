// Cliente de la API pública de GitHub usado desde el navegador, SIN credenciales.
// Límites sin autenticar: 10 búsquedas/minuto y 60 consultas/hora por IP.
// Los resultados se guardan en caché local para no repetir peticiones.
import { classifyConsoles, classifyGeneralCategory, isNintendoRelevant } from './core/categories.ts'
import { normalizeProject, toSignals } from './core/feed.ts'
import { buildGithubQueries, matchProject, type Interpretation } from './core/query.ts'
import { interestScore } from './core/scoring.ts'
import { looksLikeList } from './core/text.ts'
import { fromCompact, type CompactSummary } from './core/summary.ts'
import type { Project } from './types.ts'
import { normalizeSecurity, type SecurityFacts } from './core/security.ts'
import { fetchSecurityFacts } from './core/securityFetch.ts'

const API = 'https://api.github.com'
const SEARCH_TTL = 20 * 60_000
const ENRICH_TTL = 24 * 3_600_000

export type RateInfo = { resource: string; limit: number; remaining: number; resetAt: string }
export class GithubError extends Error {
  kind: 'rate' | 'network' | 'http'
  resetAt: string | null
  constructor(kind: 'rate' | 'network' | 'http', message: string, resetAt: string | null = null) {
    super(message)
    this.kind = kind
    this.resetAt = resetAt
  }
}

let lastRate: RateInfo | null = null
export const getLastRate = () => lastRate

function readRate(response: Response): RateInfo | null {
  const limit = Number(response.headers.get('x-ratelimit-limit'))
  const remaining = Number(response.headers.get('x-ratelimit-remaining'))
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (!limit || Number.isNaN(remaining)) return null
  return { resource: response.headers.get('x-ratelimit-resource') ?? 'core', limit, remaining, resetAt: new Date(reset * 1000).toISOString() }
}

async function get<T>(path: string, signal?: AbortSignal, allowNotFound = false): Promise<T | null> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: { Accept: 'application/vnd.github+json' }, signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new GithubError('network', 'No hay conexión con GitHub. Comprueba tu red.')
  }
  const rate = readRate(response)
  if (rate) lastRate = rate
  if (allowNotFound && response.status === 404) return null
  if (response.ok) return response.json() as Promise<T>
  if (response.status === 403 || response.status === 429) {
    const reset = rate?.resetAt ?? null
    const when = reset ? new Intl.DateTimeFormat('es', { timeStyle: 'short' }).format(new Date(reset)) : 'dentro de unos minutos'
    throw new GithubError('rate', `GitHub limita las consultas sin cuenta. Podrás volver a buscar a las ${when}.`, reset)
  }
  if (response.status === 422) throw new GithubError('http', 'GitHub no aceptó esta búsqueda. Prueba con otras palabras.')
  throw new GithubError('http', `GitHub respondió con un error ${response.status}.`)
}

type SearchRepo = {
  id: number; name: string; full_name: string; owner: { login: string; type: string }; description: string | null
  html_url: string; homepage: string | null; stargazers_count: number; forks_count: number; updated_at: string
  created_at: string; pushed_at: string; archived: boolean; fork: boolean; language: string | null; topics?: string[]
  license: { spdx_id: string | null; name: string | null } | null
}

function licenseName(license: SearchRepo['license']) {
  if (!license) return null
  if (license.spdx_id && license.spdx_id !== 'NOASSERTION') return license.spdx_id
  return license.name && license.name !== 'Other' ? license.name : null
}

export function projectFromSearch(repo: SearchRepo, interp: Interpretation, position: number, now = Date.now()): Project {
  const topics = repo.topics ?? []
  const consoles = classifyConsoles(repo)
  const base = normalizeProject({
    id: repo.id, name: repo.name, fullName: repo.full_name, owner: repo.owner.login, ownerType: repo.owner.type,
    description: repo.description ?? '', url: repo.html_url, homepage: repo.homepage || null, stars: repo.stargazers_count,
    forks: repo.forks_count, updatedAt: repo.updated_at, createdAt: repo.created_at, pushedAt: repo.pushed_at,
    category: classifyGeneralCategory(repo), consoles, channels: isNintendoRelevant(repo) && consoles.length ? ['nintendo'] : [],
    version: null, releaseChecked: false, hasReadme: null, readmeQuality: null, license: licenseName(repo.license),
    archived: repo.archived, isList: looksLikeList(repo.name, repo.description ?? '', topics), language: repo.language, topics,
    labels: repo.stargazers_count < 100 ? ['Poco conocido'] : [], source: 'live',
  })!
  // Relevancia: coincidencia real de los términos + posición en el orden de GitHub.
  const matched = matchProject(base, interp, now)
  const relevance = Math.max(matched, 0.3) * 0.75 + Math.max(0, 1 - position / 40) * 0.25
  const { score, reasons } = interestScore(toSignals(base), relevance, matched > 0 ? 'Coincide con los términos de tu búsqueda.' : null, now)
  return { ...base, score, reasons }
}

let summaryIndex: Promise<Record<string, CompactSummary>> | null = null

/** Caché pública de resúmenes en español; se descarga una sola vez y solo al buscar en vivo. */
function loadSummaryIndex() {
  summaryIndex ??= fetch(`${import.meta.env.BASE_URL}data/summaries.json`)
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}))
  return summaryIndex
}

export async function withSummaries(projects: Project[]) {
  const index = await loadSummaryIndex()
  return projects.map((project) => {
    const entry = project.summary ? null : index[String(project.id)]
    const summary = entry ? fromCompact(entry, project.description) : null
    return summary ? { ...project, summary } : project
  })
}

export type LiveSearch = {
  projects: Project[]
  total: number
  queriesTried: string[]
  queryUsed: string
  fetchedAt: string
  fromCache: boolean
  filteredOut: number
}

function cacheGet<T>(key: string, ttl: number): T | null {
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as { at: number; data: T }
    return Date.now() - value.at < ttl ? value.data : null
  } catch {
    return null
  }
}

function cacheSet(key: string, data: unknown, persistent = false) {
  try {
    ;(persistent ? localStorage : sessionStorage).setItem(key, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // Caché opcional: si el almacenamiento está lleno o bloqueado, se ignora.
  }
}

export function clearSearchCache() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      for (const key of Object.keys(storage)) if (key.startsWith('radar-live:') || key.startsWith('radar-enrich:') || key.startsWith('radar-security:')) storage.removeItem(key)
    } catch {
      // Sin acceso al almacenamiento.
    }
  }
}

export async function searchGithub(interp: Interpretation, { includeArchived = false, signal }: { includeArchived?: boolean; signal?: AbortSignal } = {}): Promise<LiveSearch> {
  const { primary, fallbacks } = buildGithubQueries(interp, { includeArchived })
  const sort = interp.sort === 'stars' ? '&sort=stars' : interp.sort === 'recent' ? '&sort=updated' : ''
  const cacheKey = `radar-live:${primary}|${sort}|${interp.ownerType ?? ''}`
  const cached = cacheGet<LiveSearch>(cacheKey, SEARCH_TTL)
  if (cached) return { ...cached, fromCache: true, projects: await withSummaries(cached.projects.map((item) => normalizeProject(item)!).filter(Boolean)) }

  const tried: string[] = []
  let items: SearchRepo[] = []
  let total = 0
  let used = primary
  for (const q of [primary, ...fallbacks]) {
    tried.push(q)
    const data = await get<{ total_count: number; items: SearchRepo[] }>(`/search/repositories?q=${encodeURIComponent(q)}${sort}&per_page=50`, signal)
    items = data?.items ?? []
    total = data?.total_count ?? 0
    used = q
    if (items.length > 0) break
  }
  const now = Date.now()
  let projects = await withSummaries(items.filter((repo) => !repo.fork).map((repo, index) => projectFromSearch(repo, interp, index, now)))
  const before = projects.length
  if (interp.ownerType) projects = projects.filter((project) => project.ownerType === interp.ownerType)
  const result: LiveSearch = { projects, total, queriesTried: tried, queryUsed: used, fetchedAt: new Date(now).toISOString(), fromCache: false, filteredOut: before - projects.length }
  cacheSet(cacheKey, result)
  return result
}

export type Enrichment = { hasReadme: boolean; readmeQuality: boolean; version: string | null; releasePublishedAt: string | null; releaseUrl: string | null }

/** Comprueba README y última versión estable de un proyecto (2 consultas del límite de 60/hora). */
export async function enrichProject(project: Project, signal?: AbortSignal): Promise<Project> {
  const cacheKey = `radar-enrich:${project.id}`
  let data = cacheGet<Enrichment>(cacheKey, ENRICH_TTL)
  if (!data) {
    const [readme, release] = await Promise.all([
      get<{ content?: string; size?: number }>(`/repos/${project.fullName}/readme`, signal, true),
      get<{ tag_name: string; published_at: string | null; html_url: string; draft: boolean; prerelease: boolean }>(`/repos/${project.fullName}/releases/latest`, signal, true),
    ])
    let text = ''
    try {
      text = readme?.content ? new TextDecoder().decode(Uint8Array.from(atob(readme.content.replace(/\s/g, '')), (char) => char.charCodeAt(0))) : ''
    } catch {
      text = ''
    }
    const stable = release && !release.draft && !release.prerelease ? release : null
    data = {
      hasReadme: Boolean(readme),
      readmeQuality: text.length >= 500 && (/^#{1,3}\s/m.test(text) || /^[=-]{3,}\s*$/m.test(text)),
      version: stable?.tag_name ?? null, releasePublishedAt: stable?.published_at ?? null, releaseUrl: stable?.html_url ?? null,
    }
    cacheSet(cacheKey, data, true)
  }
  const updated: Project = { ...project, ...data, releaseChecked: true }
  const relevanceReason = project.reasons.find((reason) => reason.startsWith('Coincide') || reason.startsWith('Menciona') || reason.startsWith('Encontrado') || reason.startsWith('Etiquetado')) ?? null
  const { score, reasons } = interestScore(toSignals(updated), relevanceReason ? 0.8 : 0.5, relevanceReason)
  return { ...updated, score, reasons }
}

const SECURITY_TTL = 24 * 3_600_000

/**
 * Comprueba bajo demanda las señales de seguridad de un proyecto (≈5 consultas del límite
 * de 60/hora sin cuenta + 1 a OpenSSF Scorecard). Solo metadatos: no descarga archivos.
 */
export async function checkSecurity(project: Project, signal?: AbortSignal): Promise<SecurityFacts> {
  const cacheKey = `radar-security:${project.id}`
  const cached = normalizeSecurity(cacheGet<SecurityFacts>(cacheKey, SECURITY_TTL))
  if (cached) return cached
  const facts = await fetchSecurityFacts(project.fullName, {
    github: (path) => get(path, signal, true),
    external: async (url) => {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
  })
  cacheSet(cacheKey, facts, true)
  return facts
}
