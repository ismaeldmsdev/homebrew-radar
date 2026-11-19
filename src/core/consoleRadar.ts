// Radar de Consolas: secciones del catálogo (actualizado por GitHub Actions) dedicadas
// al homebrew y la modificación de consolas. Se distingue con cuidado:
// · Proyecto nuevo   → el repositorio se CREÓ hace poco (no basta con un commit reciente).
// · Nueva versión    → hay una publicación oficial (release) reciente.
// · Recuperado       → volvió a tener actividad tras más de 6 meses parado.
import { detectToolType, isConsoleRelated, looksLikePiracy, toolTypeLabel, TOOL_TYPES, type ToolTypeId } from './consoles.ts'
import { gemOf } from './feed.ts'
import { platformsOf } from './query.ts'
import { daysSince } from './text.ts'
import type { Project } from '../types.ts'

export const NEW_PROJECT_DAYS = 90
export const NEW_RELEASE_DAYS = 45

export function isConsoleProject(project: Project) {
  if (project.archived || project.isList || looksLikePiracy(project)) return false
  return project.channels.includes('consolas') || isConsoleRelated(project)
}

const toolCache = new WeakMap<Project, ToolTypeId>()
export function toolTypeOf(project: Project): ToolTypeId {
  let tool = toolCache.get(project)
  if (!tool) {
    tool = (TOOL_TYPES.find((type) => type.label === project.category)?.id) ?? detectToolType(project) ?? 'homebrew'
    toolCache.set(project, tool)
  }
  return tool
}

export type ConsoleFilters = { platform: string | null; tool: ToolTypeId | null }

export function filterConsoleProjects(projects: Project[], { platform, tool }: ConsoleFilters) {
  return projects.filter((project) => (!platform || platformsOf(project).includes(platform)) && (!tool || toolTypeOf(project) === tool))
}

/** Máximo uno por autor y dos por consola, para no repetir siempre lo mismo. */
function varied(list: Project[], limit: number, perPlatform = 2) {
  const owners = new Set<string>()
  const platforms = new Map<string, number>()
  const picked: Project[] = []
  for (const project of list) {
    const main = platformsOf(project)[0] ?? 'otras'
    if (owners.has(project.owner) || (platforms.get(main) ?? 0) >= perPlatform) continue
    owners.add(project.owner)
    platforms.set(main, (platforms.get(main) ?? 0) + 1)
    picked.push(project)
    if (picked.length >= limit) break
  }
  // Si la variedad deja huecos (p. ej. al filtrar una consola), se completan en orden.
  for (const project of list) { if (picked.length >= limit) break; if (!picked.includes(project)) picked.push(project) }
  return picked
}

export function consoleSections(projects: Project[], now = Date.now(), limit = 8) {
  const pool = projects.filter(isConsoleProject)
  const used = new Set<number>()
  const take = (list: Project[]) => { const result = list.filter((project) => !used.has(project.id)).slice(0, limit); result.forEach((project) => used.add(project.id)); return result }

  const newProjects = take(pool.filter((project) => daysSince(project.createdAt, now) <= NEW_PROJECT_DAYS).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const releases = take(pool
    .filter((project) => project.version && project.releasePublishedAt && daysSince(project.releasePublishedAt, now) <= NEW_RELEASE_DAYS)
    .sort((a, b) => (b.releasePublishedAt ?? '').localeCompare(a.releasePublishedAt ?? '')))
  const revived = take(pool.filter((project) => project.labels.includes('Reactivado')).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)))
  const gems = take(pool.map((project) => ({ project, gem: gemOf(project, now) })).filter((item) => item.gem).sort((a, b) => b.gem!.score - a.gem!.score).map((item) => item.project))
  const featured = take(varied(pool.filter((project) => !used.has(project.id)).sort((a, b) => b.score - a.score), limit))
  return { total: pool.length, featured, newProjects, releases, revived, gems }
}

/** Plataformas y tipos presentes, con su número de proyectos (para los filtros). */
export function consoleFacets(projects: Project[]) {
  const pool = projects.filter(isConsoleProject)
  const platforms = new Map<string, number>()
  const tools = new Map<ToolTypeId, number>()
  for (const project of pool) {
    for (const id of platformsOf(project)) platforms.set(id, (platforms.get(id) ?? 0) + 1)
    tools.set(toolTypeOf(project), (tools.get(toolTypeOf(project)) ?? 0) + 1)
  }
  return {
    platforms: [...platforms.entries()].sort((a, b) => b[1] - a[1]),
    tools: TOOL_TYPES.filter((type) => tools.has(type.id)).map((type) => ({ id: type.id, label: toolTypeLabel(type.id), count: tools.get(type.id)! })),
  }
}
