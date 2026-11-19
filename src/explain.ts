// Textos en lenguaje sencillo construidos SOLO con datos de GitHub.
import type { SortMode } from './core/query.ts'
import { gemOf } from './core/feed.ts'
import { projectStatus } from './core/scoring.ts'
import type { Project, Topic } from './types.ts'

export function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? 'No verificado' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date)
}

export function formatDateTime(value: string | null | undefined) {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? 'No verificado' : new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat('es', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export const licenseLabel = (license: string | null) => (license ? `Licencia ${license}` : 'Sin licencia declarada')

export function whyInteresting(project: Project, topics: Topic[]) {
  if (project.description.trim().length < 20) {
    return { verified: false, lines: ['GitHub no ofrece una descripción suficiente para explicar su utilidad: no verificado. Revisa el repositorio para saber qué hace.'] }
  }
  const lines: string[] = []
  const platforms = project.consoles.length ? ` y sus metadatos mencionan ${project.consoles.map((name) => `Nintendo ${name}`).join(', ')}` : ''
  lines.push(`Está clasificado como «${project.category}»${platforms}.`)
  lines.push(`Su autor lo resume así (puede estar en otro idioma): «${project.description.trim()}»`)
  if (gemOf(project)) lines.push('Combina poca visibilidad con señales de calidad verificables, por eso aparece entre las joyas ocultas.')
  if (project.version) lines.push(`Hay una versión publicada (${project.version}) que normalmente se descarga desde la página de versiones de GitHub.`)
  else if (project.releaseChecked) lines.push('No publica versiones descargables: probablemente haya que seguir las instrucciones del README para usarlo.')
  if (project.homepage) lines.push('Tiene una web propia donde ampliar información.')
  const channelLabels = project.channels.map((id) => topics.find((topic) => topic.id === id)?.label).filter(Boolean)
  if (channelLabels.length) lines.push(`Forma parte de ${channelLabels.length > 1 ? 'las temáticas' : 'la temática'} ${channelLabels.map((label) => `«${label}»`).join(', ')} del radar.`)
  const status = projectStatus(project)
  if (status.id === 'archived' || status.id === 'stale' || status.id === 'quiet') lines.push(`Ten en cuenta: ${status.detail.toLowerCase()}`)
  return { verified: true, lines }
}

export const sortLabels: Record<SortMode, string> = {
  interest: 'Interés',
  gems: 'Joyas ocultas',
  recent: 'Actividad reciente',
  new: 'Más nuevos',
  stars: 'Popularidad',
}

export function sortProjects(list: Project[], mode: SortMode, relevance?: Map<number, number>) {
  const rel = (project: Project) => relevance?.get(project.id) ?? 0
  const sorted = [...list]
  if (mode === 'gems') sorted.sort((a, b) => (gemOf(b)?.score ?? -1) - (gemOf(a)?.score ?? -1) || b.score - a.score)
  else if (mode === 'recent') sorted.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
  else if (mode === 'new') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  else if (mode === 'stars') sorted.sort((a, b) => b.stars - a.stars)
  else sorted.sort((a, b) => (b.score + rel(b) * 20) - (a.score + rel(a) * 20))
  return sorted
}
