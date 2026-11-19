// Normalización del catálogo (compatible con el formato v1) y cálculo de las
// secciones de descubrimiento. Funciones puras para poder probarlas en Node.
import type { Feed, Project, Topic } from '../types.ts'
import { matchProject, type Interpretation } from './query.ts'
import { gemAnalysis, type Gem, type RepoSignals } from './scoring.ts'
import { looksLikeList } from './text.ts'
import { fallbackSummary, normalizeSummary, type Summary } from './summary.ts'

const NINTENDO: Topic = { id: 'nintendo', label: 'Nintendo homebrew', description: 'Homebrew para Nintendo 3DS, DSi y DS.', featured: true, status: 'ok', count: 0, collectedAt: null }

function str(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback }
function strOrNull(value: unknown) { return typeof value === 'string' && value ? value : null }
function num(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }

export function normalizeProject(raw: unknown, legacy = false): Project | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.id !== 'number' || typeof value.name !== 'string' || typeof value.url !== 'string') return null
  const reasons = strings(value.reasons)
  const description = str(value.description)
  const topics = strings(value.topics)
  const consoles = strings(value.consoles)
  const pushedAt = str(value.pushedAt, str(value.updatedAt))
  // El catálogo v1 comprobaba README y versiones, pero solo lo reflejaba en los motivos.
  const hasReadme = typeof value.hasReadme === 'boolean' || value.hasReadme === null
    ? value.hasReadme as boolean | null
    : legacy ? reasons.some((reason) => reason.includes('README')) : null
  const readmeQuality = typeof value.readmeQuality === 'boolean' || value.readmeQuality === null
    ? value.readmeQuality as boolean | null
    : legacy ? reasons.some((reason) => reason.includes('secciones')) : null
  return {
    id: value.id,
    name: value.name,
    fullName: str(value.fullName, value.name),
    owner: str(value.owner),
    ownerType: value.ownerType === 'User' || value.ownerType === 'Organization' ? value.ownerType : null,
    description,
    url: value.url,
    homepage: strOrNull(value.homepage),
    stars: num(value.stars),
    forks: num(value.forks),
    updatedAt: str(value.updatedAt, pushedAt),
    createdAt: str(value.createdAt),
    pushedAt,
    category: str(value.category, 'Otros proyectos interesantes'),
    consoles,
    channels: strings(value.channels).length ? strings(value.channels) : legacy ? ['nintendo'] : [],
    version: strOrNull(value.version),
    releasePublishedAt: strOrNull(value.releasePublishedAt),
    releaseUrl: strOrNull(value.releaseUrl),
    releaseChecked: typeof value.releaseChecked === 'boolean' ? value.releaseChecked : legacy,
    hasReadme,
    readmeQuality,
    license: strOrNull(value.license),
    archived: value.archived === true,
    isList: typeof value.isList === 'boolean' ? value.isList : looksLikeList(value.name, description, topics),
    score: num(value.score),
    reasons,
    labels: strings(value.labels),
    language: strOrNull(value.language),
    topics,
    starsDelta: typeof value.starsDelta === 'number' ? value.starsDelta : null,
    starsDeltaDays: typeof value.starsDeltaDays === 'number' ? value.starsDeltaDays : null,
    source: value.source === 'live' ? 'live' : 'catalog',
    summary: normalizeSummary(value.summary),
  }
}

export function normalizeFeed(raw: unknown): Feed | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (!Array.isArray(value.projects) || typeof value.generatedAt !== 'string') return null
  const legacy = typeof value.schemaVersion !== 'number'
  const projects = value.projects.map((item) => normalizeProject(item, legacy)).filter((item): item is Project => item !== null)
  const topics: Topic[] = Array.isArray(value.topics)
    ? value.topics.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && typeof (item as Topic).id === 'string').map((item) => ({
      id: str(item.id), label: str(item.label, str(item.id)), description: str(item.description), featured: item.featured === true,
      status: item.status === 'stale' || item.status === 'error' ? item.status : 'ok', count: num(item.count), collectedAt: strOrNull(item.collectedAt),
    }))
    : [{ ...NINTENDO, count: projects.length, collectedAt: value.generatedAt }]
  return { schemaVersion: legacy ? 1 : num(value.schemaVersion), generatedAt: value.generatedAt, topics, projects }
}

export function toSignals(project: Project): RepoSignals {
  return {
    stars: project.stars, pushedAt: project.pushedAt, createdAt: project.createdAt, description: project.description,
    topics: project.topics, hasReadme: project.hasReadme, readmeQuality: project.readmeQuality,
    release: project.version ? { tag: project.version, publishedAt: project.releasePublishedAt, url: project.releaseUrl } : null,
    releaseChecked: project.releaseChecked, license: project.license, homepage: project.homepage, archived: project.archived,
    isList: project.isList, starsDelta: project.starsDelta, starsDeltaDays: project.starsDeltaDays,
  }
}

const summaryCache = new WeakMap<Project, Summary>()
/** Resumen guardado o, si no lo hay, la descripción básica construida con metadatos. */
export function summaryOf(project: Project): Summary {
  if (project.summary) return project.summary
  let summary = summaryCache.get(project)
  if (!summary) { summary = fallbackSummary(project); summaryCache.set(project, summary) }
  return summary
}

const gemCache = new WeakMap<Project, Gem | null>()
export function gemOf(project: Project, now = Date.now()) {
  if (!gemCache.has(project)) gemCache.set(project, gemAnalysis(toSignals(project), now))
  return gemCache.get(project) ?? null
}

/** Mejor puntuación con un máximo por temática para que la portada sea variada. */
export function pickFeatured(projects: Project[], limit = 8, perChannel = 2) {
  const used = new Map<string, number>()
  const picked: Project[] = []
  for (const project of [...projects].filter((item) => !item.archived && !item.isList).sort((a, b) => b.score - a.score)) {
    const channel = project.channels[0] ?? 'otros'
    if ((used.get(channel) ?? 0) >= perChannel) continue
    used.set(channel, (used.get(channel) ?? 0) + 1)
    picked.push(project)
    if (picked.length >= limit) break
  }
  return picked
}

export function pickGems(projects: Project[], limit = 8, now = Date.now()) {
  return projects
    .map((project) => ({ project, gem: gemOf(project, now) }))
    .filter((item): item is { project: Project; gem: Gem } => item.gem !== null)
    .sort((a, b) => b.gem.score - a.gem.score || b.project.pushedAt.localeCompare(a.project.pushedAt))
    .slice(0, limit)
    .map((item) => item.project)
}

const newsPriority: Record<string, number> = { 'Nueva versión': 3, Nuevo: 2, Reactivado: 2, Actualizado: 1 }
export function newsRank(project: Project) {
  return Math.max(0, ...project.labels.map((label) => newsPriority[label] ?? 0))
}
export function pickNews(projects: Project[], limit = 8) {
  return projects
    .filter((project) => newsRank(project) > 0 && !project.archived)
    .sort((a, b) => newsRank(b) - newsRank(a) || (b.releasePublishedAt ?? b.pushedAt).localeCompare(a.releasePublishedAt ?? a.pushedAt))
    .slice(0, limit)
}

/** Crecimiento de estrellas entre recopilaciones, relativo al tamaño del proyecto. */
export function pickTrending(projects: Project[], limit = 8) {
  return projects
    .filter((project) => (project.starsDelta ?? 0) >= 2 && (project.starsDeltaDays ?? 0) > 0 && !project.archived)
    .sort((a, b) => (b.starsDelta! / (b.stars - b.starsDelta! + 10)) - (a.starsDelta! / (a.stars - a.starsDelta! + 10)))
    .slice(0, limit)
}

export type Recommendation = { project: Project; reason: string }

/** Recomendaciones basadas solo en preferencias explícitas: temáticas guardadas y favoritos. */
export function recommend(
  projects: Project[],
  interests: { label: string; interp: Interpretation }[],
  favorites: Project[],
  exclude: Set<number>,
  limit = 8,
  now = Date.now(),
): Recommendation[] {
  const scored = new Map<number, { project: Project; value: number; reason: string }>()
  const offer = (project: Project, value: number, reason: string) => {
    if (exclude.has(project.id)) return
    const current = scored.get(project.id)
    if (!current || current.value < value) scored.set(project.id, { project, value, reason })
  }
  for (const interest of interests) {
    for (const project of projects) {
      const relevance = matchProject(project, interest.interp, now)
      if (relevance > 0) offer(project, relevance * 60 + project.score * 0.4, `Porque sigues «${interest.label}».`)
    }
  }
  for (const favorite of favorites) {
    const topics = new Set(favorite.topics)
    for (const project of projects) {
      if (project.id === favorite.id) continue
      const shared = project.topics.filter((topic) => topics.has(topic) && !/^(hacktoberfest|github|open-?source)$/.test(topic))
      if (shared.length >= 2) offer(project, shared.length * 12 + project.score * 0.4, `Comparte los temas ${shared.slice(0, 3).join(', ')} con tu favorito ${favorite.name}.`)
    }
  }
  return [...scored.values()].sort((a, b) => b.value - a.value).slice(0, limit).map(({ project, reason }) => ({ project, reason }))
}

/** Une resultados evitando duplicados; prevalece la primera aparición (el catálogo, más completo). */
export function mergeUnique(...lists: Project[][]) {
  const seen = new Map<number, Project>()
  for (const list of lists) for (const project of list) if (!seen.has(project.id)) seen.set(project.id, project)
  return [...seen.values()]
}
