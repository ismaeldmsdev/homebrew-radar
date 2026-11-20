// Conversión de un resultado de la API de búsqueda de GitHub en un proyecto del radar.
// Pura (sin red ni almacenamiento) para usarla en el navegador, en Node y en pruebas.
import { classifyConsoles, classifyGeneralCategory, isNintendoRelevant } from './categories.ts'
import { normalizeProject, toSignals } from './feed.ts'
import { matchProject, type Interpretation } from './query.ts'
import { interestScore } from './scoring.ts'
import { fromCompact, type CompactSummary } from './summary.ts'
import { looksLikeList } from './text.ts'
import type { Project } from '../types.ts'

export type SearchRepo = {
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

export function projectFromSearch(repo: SearchRepo, interp: Interpretation, position: number, now = Date.now(), summaries: Record<string, CompactSummary> = {}): Project {
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
  const cached = summaries[String(repo.id)]
  const summary = cached ? fromCompact(cached, base.description) : null
  const withSummary = summary ? { ...base, summary } : base
  // Relevancia: coincidencia real de los términos + posición en el orden de GitHub.
  const matched = matchProject(withSummary, interp, now)
  const relevance = Math.max(matched, 0.3) * 0.75 + Math.max(0, 1 - position / 40) * 0.25
  const { score, reasons } = interestScore(toSignals(withSummary), relevance, matched > 0 ? 'Coincide con los términos de tu búsqueda.' : null, now)
  return { ...withSummary, score, reasons }
}
