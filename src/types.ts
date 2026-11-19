import type { Summary } from './core/summary.ts'

export type Project = {
  id: number
  name: string
  fullName: string
  owner: string
  ownerType: 'User' | 'Organization' | null
  description: string
  url: string
  homepage: string | null
  stars: number
  forks: number
  updatedAt: string
  createdAt: string
  pushedAt: string
  category: string
  consoles: string[]
  channels: string[]
  version: string | null
  releasePublishedAt: string | null
  releaseUrl: string | null
  releaseChecked: boolean
  hasReadme: boolean | null
  readmeQuality: boolean | null
  license: string | null
  archived: boolean
  isList: boolean
  score: number
  reasons: string[]
  labels: string[]
  language: string | null
  topics: string[]
  starsDelta: number | null
  starsDeltaDays: number | null
  source: 'catalog' | 'live'
  /** Resumen en español guardado en caché (null: la web genera la descripción básica). */
  summary: Summary | null
}

export type Topic = {
  id: string
  label: string
  description: string
  featured: boolean
  status: 'ok' | 'stale' | 'error'
  count: number
  collectedAt: string | null
}

export type Feed = {
  schemaVersion: number
  generatedAt: string
  topics: Topic[]
  projects: Project[]
}
