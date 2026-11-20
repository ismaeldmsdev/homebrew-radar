// Motor del buscador: combina el catálogo y los resultados en vivo de GitHub y los
// ordena por RELEVANCIA real para la consulta, con la calidad como criterio secundario.
// Las estrellas solo influyen a través de una escala logarítmica dentro de la calidad.
// Las preferencias personales (p. ej. consolas) NO intervienen en las búsquedas explícitas.
import { gemOf, mergeUnique, toSignals } from './feed.ts'
import { projectFromSearch, type SearchRepo } from './live.ts'
import { buildGithubQueries, interpretQuery, relevanceOf, type Interpretation, type SortMode } from './query.ts'
import { interestScore, projectStatus } from './scoring.ts'
import type { CompactSummary } from './summary.ts'
import type { Project } from '../types.ts'

export const MIN_RELEVANCE = 0.4
/** Con menos resultados en vivo se prueba la siguiente consulta, más amplia. */
export const ENOUGH_LIVE_RESULTS = 8

export type Ranked = { project: Project; relevance: number; quality: number; final: number; why: string[] }

const qualityCache = new WeakMap<Project, number>()
/** Calidad 0..1 sin la parte de relevancia (actividad, documentación, versiones, licencia…). */
export function qualityOf(project: Project, now = Date.now()) {
  let quality = qualityCache.get(project)
  if (quality === undefined) {
    quality = Math.min(1, interestScore(toSignals(project), 0, null, now).score / 75)
    qualityCache.set(project, quality)
  }
  return quality
}

/** Máximo `perOwner` proyectos del mismo autor entre los primeros `window` resultados. */
function diversify(list: Ranked[], perOwner = 2, window = 12) {
  const head: Ranked[] = []
  const tail: Ranked[] = []
  const used = new Map<string, number>()
  for (const item of list) {
    const owner = item.project.owner.toLowerCase()
    if (head.length < window && (used.get(owner) ?? 0) >= perOwner) { tail.push(item); continue }
    used.set(owner, (used.get(owner) ?? 0) + 1)
    ;(head.length < window ? head : tail).push(item)
  }
  return [...head, ...tail]
}

export type RankOptions = {
  sort?: SortMode | null
  now?: number
  includeArchived?: boolean
  hideInactive?: boolean
  minRelevance?: number
}

/** Ordena catálogo + resultados en vivo para una interpretación. */
export function rankSearch(catalog: Project[], live: Project[], interp: Interpretation, options: RankOptions = {}): Ranked[] {
  const { now = Date.now(), includeArchived = false, hideInactive = true, minRelevance = MIN_RELEVANCE } = options
  const sort = options.sort ?? interp.sort ?? 'interest'
  const ranked: Ranked[] = []
  for (const project of mergeUnique(catalog, live)) {
    const status = projectStatus(project, now).id
    if (status === 'archived' && !includeArchived) continue
    if (hideInactive && status === 'stale') continue
    const { value, why } = relevanceOf(project, interp, now)
    if (value < minRelevance) continue
    const quality = qualityOf(project, now)
    ranked.push({ project, relevance: value, quality, final: value * 0.68 + quality * 0.32, why })
  }
  const byFinal = (a: Ranked, b: Ranked) => b.final - a.final
  if (sort === 'gems') ranked.sort((a, b) => ((gemOf(b.project, now)?.score ?? 0) * 0.5 + b.final * 100) - ((gemOf(a.project, now)?.score ?? 0) * 0.5 + a.final * 100))
  else if (sort === 'stars') ranked.sort((a, b) => b.project.stars - a.project.stars || byFinal(a, b))
  else if (sort === 'new') ranked.sort((a, b) => b.project.createdAt.localeCompare(a.project.createdAt))
  else if (sort === 'recent') ranked.sort((a, b) => b.project.pushedAt.localeCompare(a.project.pushedAt))
  else ranked.sort(byFinal)
  return sort === 'interest' || sort === 'gems' ? diversify(ranked) : ranked
}

export type RunOptions = {
  catalog: Project[]
  searchRepos: (query: string, sortParam: string) => Promise<{ items: SearchRepo[]; total: number }>
  now?: number
  summaries?: Record<string, CompactSummary>
  includeArchived?: boolean
}

/** Búsqueda completa (para la evaluación y pruebas): consulta GitHub y ordena. */
export async function runSearch(query: string, { catalog, searchRepos, now = Date.now(), summaries = {}, includeArchived = false }: RunOptions) {
  const interp = interpretQuery(query)
  const { primary, fallbacks } = buildGithubQueries(interp, { now, includeArchived })
  const sortParam = interp.sort === 'stars' ? '&sort=stars' : interp.sort === 'recent' ? '&sort=updated' : ''
  const queriesTried: string[] = []
  const found = new Map<number, SearchRepo>()
  for (const q of [primary, ...fallbacks]) {
    queriesTried.push(q)
    const { items: page } = await searchRepos(q, sortParam)
    for (const repo of page) if (!found.has(repo.id)) found.set(repo.id, repo)
    // Si la consulta exacta da muy pocos resultados se amplía, como en la web.
    if (found.size >= ENOUGH_LIVE_RESULTS) break
  }
  const items = [...found.values()]
  let live = items.filter((repo) => !repo.fork).map((repo, index) => projectFromSearch(repo, interp, index, now, summaries))
  if (interp.ownerType) live = live.filter((project) => project.ownerType === interp.ownerType)
  return { interp, queriesTried, results: rankSearch(catalog, live, interp, { now, includeArchived }) }
}
