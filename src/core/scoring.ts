// Puntuación explicable, estado del proyecto y detección de joyas ocultas.
// Todas las señales proceden de metadatos públicos de GitHub; ninguna puntuación
// es una garantía de calidad o seguridad.
import { daysSince, relativeDays } from './text.ts'

export type ReleaseInfo = { tag: string; publishedAt: string | null; url: string | null }

export type RepoSignals = {
  stars: number
  pushedAt: string
  createdAt: string
  description: string
  topics: string[]
  /** null = no comprobado (p. ej. resultados en vivo sin enriquecer). */
  hasReadme: boolean | null
  readmeQuality: boolean | null
  release: ReleaseInfo | null
  releaseChecked: boolean
  license: string | null
  homepage: string | null
  archived: boolean
  isList: boolean
  starsDelta?: number | null
  starsDeltaDays?: number | null
}

export type Gem = { score: number; verified: boolean; summary: string; reasons: string[] }

export type StatusId = 'archived' | 'active' | 'maintained' | 'quiet' | 'stale'
export type ProjectStatus = { id: StatusId; label: string; detail: string }

export function projectStatus(signals: Pick<RepoSignals, 'archived' | 'pushedAt'>, now = Date.now()): ProjectStatus {
  if (signals.archived) return { id: 'archived', label: 'Archivado', detail: 'El autor lo marcó como archivado en GitHub: ya no recibe cambios.' }
  const days = daysSince(signals.pushedAt, now)
  if (days <= 90) return { id: 'active', label: 'Activo', detail: 'Tiene cambios en los últimos 3 meses.' }
  if (days <= 365) return { id: 'maintained', label: 'Activo este año', detail: 'Tiene cambios en los últimos 12 meses.' }
  if (days <= 730) return { id: 'quiet', label: 'Poco activo', detail: 'No tiene cambios desde hace más de un año.' }
  return { id: 'stale', label: 'Posiblemente abandonado', detail: 'No tiene cambios desde hace más de dos años.' }
}

/**
 * Puntuación de interés de 0 a 100.
 * relevancia 25 · actividad 20 · documentación 15 · versión 10 · popularidad 10 ·
 * madurez 5 · descripción 5 · licencia/temas/web 10. Las listas de recursos restan 10.
 */
export function interestScore(signals: RepoSignals, relevance: number, relevanceReason: string | null, now = Date.now()) {
  const reasons: string[] = []
  let score = Math.round(Math.max(0, Math.min(1, relevance)) * 25)
  if (relevanceReason) reasons.push(relevanceReason)

  const days = daysSince(signals.pushedAt, now)
  if (signals.archived) reasons.push('Archivado por su autor: no recibe cambios.')
  else if (days <= 30) { score += 20; reasons.push('Actividad en los últimos 30 días.') }
  else if (days <= 90) { score += 16; reasons.push('Actividad en los últimos 3 meses.') }
  else if (days <= 365) { score += 10; reasons.push('Tuvo actividad durante el último año.') }
  else if (days <= 730) score += 4

  if (signals.hasReadme === null) reasons.push('Documentación no comprobada todavía.')
  else if (signals.readmeQuality) { score += 15; reasons.push('README con contenido y secciones de documentación.') }
  else if (signals.hasReadme) { score += 10; reasons.push('Dispone de README en el repositorio.') }
  else reasons.push('No se encontró README.')

  if (signals.release) { score += 10; reasons.push(`Tiene una versión publicada: ${signals.release.tag}.`) }
  else if (!signals.releaseChecked) reasons.push('Versiones publicadas no comprobadas todavía.')

  const stars = Math.max(0, signals.stars)
  // Escala logarítmica: 10 ★ ≈ 2, 1.000 ★ ≈ 6, 100.000 ★ = 10. La popularidad no domina.
  score += Math.min(10, Math.round(Math.log10(stars + 1) * 2))
  if (stars > 1000) reasons.push(`Popularidad respaldada por ${stars.toLocaleString('es')} estrellas.`)

  const age = daysSince(signals.createdAt, now)
  if (age >= 365 && days <= 365 && !signals.archived) { score += 5; reasons.push('Lleva más de un año en desarrollo y sigue activo.') }
  else if (age < 365) score += 2

  if (signals.description.trim().length > 24) { score += 5; reasons.push('Descripción del proyecto disponible en GitHub.') }
  if (signals.license) { score += 4; reasons.push(`Licencia declarada: ${signals.license}.`) }
  if (signals.topics.length >= 2) score += 3
  if (signals.homepage) { score += 3; reasons.push('Tiene web o documentación externa.') }
  if (signals.isList) { score -= 10; reasons.push('Es una lista de recursos, no una herramienta.') }

  return { score: Math.min(100, Math.max(0, score)), reasons }
}

export const GEM_MIN_STARS = 3
export const GEM_MAX_STARS = 400

/**
 * Una joya oculta necesita poca visibilidad Y señales de calidad verificables.
 * No basta con tener pocas estrellas: se exigen documentación o versión publicada
 * (o, si aún no se comprobaron, varias señales indirectas) y actividad en el último año.
 */
export function gemAnalysis(signals: RepoSignals, now = Date.now()): Gem | null {
  const stars = signals.stars
  const days = daysSince(signals.pushedAt, now)
  if (signals.archived || signals.isList) return null
  if (stars < GEM_MIN_STARS || stars > GEM_MAX_STARS) return null
  if (days > 365 || signals.description.trim().length < 20) return null

  const verified = signals.hasReadme !== null && signals.releaseChecked
  const indirect = [Boolean(signals.license), Boolean(signals.homepage), signals.topics.length >= 3, signals.description.trim().length >= 60]
  if (verified && !signals.readmeQuality && !signals.release) return null
  if (!verified && indirect.filter(Boolean).length < 3) return null

  const parts: string[] = [`poca popularidad (${stars} ★)`]
  const reasons: string[] = [`Solo ${stars} estrellas: todavía pasa desapercibido.`]
  let score = 0
  if (signals.readmeQuality) { score += 25; parts.push('documentación completa'); reasons.push('README con secciones y contenido sustancial.') }
  else if (signals.hasReadme) { score += 12; parts.push('README'); reasons.push('Tiene README.') }
  if (signals.release) { score += 20; parts.push(`versión ${signals.release.tag} publicada`); reasons.push(`Publica versiones oficiales (última: ${signals.release.tag}).`) }
  if (signals.license) { score += 8; reasons.push(`Licencia ${signals.license}.`) }
  if (signals.homepage) { score += 7; reasons.push('Tiene web o documentación propia.') }
  if (signals.topics.length >= 3) score += 5

  if (days <= 30) score += 20
  else if (days <= 90) score += 15
  else if (days <= 180) score += 8
  else score += 3
  parts.push(`actividad ${relativeDays(signals.pushedAt, now)}`)
  reasons.push(`Último cambio ${relativeDays(signals.pushedAt, now)}.`)

  score += stars >= 10 && stars <= 150 ? 15 : 8
  if (daysSince(signals.createdAt, now) >= 90) score += 5

  const delta = signals.starsDelta ?? 0
  if (delta > 0) {
    score += Math.min(10, Math.round((delta / Math.max(stars - delta, 5)) * 40))
    reasons.push(`Ha ganado ${delta} estrellas desde recopilaciones anteriores.`)
  }
  if (!verified) {
    score = Math.round(score * 0.85)
    reasons.push('README y versiones aún sin comprobar: abre la ficha para verificarlos.')
  }

  const final = Math.min(100, score)
  if (final < 45) return null
  const summary = `Proyecto con ${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}.`
  return { score: final, verified, summary, reasons }
}
