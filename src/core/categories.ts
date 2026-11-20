// Clasificación por palabras clave de los metadatos públicos (nombre, descripción y temas).
import { detectPlatforms, isMacHomebrew, PLATFORMS } from './consoles.ts'
import { classifyNintendo, classifyProject } from './classify.ts'

type Evidence = { name: string; description?: string | null; topics?: string[]; full_name?: string; fullName?: string }

function evidenceText(repo: Evidence) {
  return [repo.name, repo.description, repo.full_name ?? repo.fullName, ...(repo.topics ?? [])].filter(Boolean).join(' ').toLowerCase()
}

export function classifyConsoles(repo: Evidence) {
  const text = evidenceText(repo)
  const consoles: string[] = []
  if (/\b3ds\b|3ds[-_ ]|new nintendo 3ds|nintendo 3ds/.test(text)) consoles.push('3DS')
  if (/\bdsi\b|dsi[-_ ]|nintendo dsi/.test(text)) consoles.push('DSi')
  if (/\bnds\b|nintendo ds|nitro.?ds|libnds|twl/.test(text)) consoles.push('DS')
  return consoles
}

export function isNintendoRelevant(repo: Evidence) {
  if (classifyConsoles(repo).length > 0) return true
  // «Homebrew» a secas también es el gestor de paquetes de macOS (WailBrew, brew…): no cuenta.
  if (isMacHomebrew(repo)) return false
  return /nds-bootstrap|twilight.?menu|nds.?bootstrap|libnds|3dsx|\.cia\b|\bcia\b|\bfbi\b/i.test(evidenceText(repo)) ||
    (/\bhomebrew\b/i.test(evidenceText(repo)) && detectPlatforms(repo).some((id) => PLATFORMS.find((platform) => platform.id === id)?.family === 'Nintendo'))
}

type Context = { summary?: string | null; readme?: string | null }

const inputOf = (repo: Evidence, context: Context = {}) => ({ name: repo.name, description: repo.description, topics: repo.topics, summary: context.summary, readme: context.readme })

/** Categorías específicas de Nintendo, por evidencia (ver classify.ts). */
export function classifyCategory(repo: Evidence, context: Context = {}) {
  return classifyNintendo(inputOf(repo, context)).category
}

/**
 * Categoría general por evidencia. Antes era la PRIMERA expresión que encajaba en
 * cualquier parte del texto, así que «PHP terminal emulator» acababa en «Emuladores».
 */
export function classifyGeneralCategory(repo: Evidence, context: Context = {}) {
  if (isNintendoRelevant(repo) && classifyConsoles(repo).length) return classifyCategory(repo, context)
  return classifyProject(inputOf(repo, context)).category
}

export function classifyWithEvidence(repo: Evidence, context: Context = {}, nintendo = false) {
  return nintendo || (isNintendoRelevant(repo) && classifyConsoles(repo).length) ? classifyNintendo(inputOf(repo, context)) : classifyProject(inputOf(repo, context))
}
