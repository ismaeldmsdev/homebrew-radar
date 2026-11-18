import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGithubQueries, interpretQuery, matchProject } from './query.ts'
import { gemAnalysis, interestScore, projectStatus, type RepoSignals } from './scoring.ts'
import { mergeUnique, normalizeFeed, pickFeatured, pickTrending, recommend } from './feed.ts'
import type { Project } from '../types.ts'

const NOW = Date.parse('2026-11-18T12:00:00Z')

test('interpreta consultas en español a términos y filtros de GitHub', () => {
  const ai = interpretQuery('Herramientas poco conocidas de inteligencia artificial')
  assert.deepEqual(ai.concepts.map((concept) => concept.id), ['ai'])
  assert.equal(ai.maxStars, 400)
  assert.equal(ai.sort, 'gems')
  assert.deepEqual(ai.freeTerms, [])
  const { primary } = buildGithubQueries(ai, { now: NOW })
  assert.match(primary, /^ai OR llm OR machine-learning stars:3\.\.400 pushed:>2025-11-18 archived:false$/)

  const windows = interpretQuery('Aplicaciones gratuitas para Windows')
  assert.deepEqual(windows.concepts.map((concept) => concept.id), ['windows'])
  assert.ok(windows.notes.some((note) => note.includes('licencia')))

  const n3ds = interpretQuery('Proyectos interesantes para Nintendo 3DS')
  assert.deepEqual(n3ds.concepts.map((concept) => concept.id), ['3ds'])
  assert.equal(n3ds.concepts[0].channel, 'nintendo')

  const indie = interpretQuery('Proyectos curiosos desarrollados por programadores independientes')
  assert.equal(indie.ownerType, 'User')
  assert.deepEqual(indie.freeTerms, [])
  assert.equal(buildGithubQueries(indie, { now: NOW }).generic, true)

  const files = interpretQuery('Herramientas para analizar archivos')
  assert.deepEqual(files.concepts.map((concept) => concept.id).sort(), ['analyze', 'files'])
  assert.ok(buildGithubQueries(files, { now: NOW }).fallbacks.some((query) => query.includes(' OR ')))

  const consoles = interpretQuery('Software útil para modificar y personalizar consolas')
  assert.deepEqual(consoles.freeTerms, [], '«útil» no es un término de búsqueda')
  assert.equal(buildGithubQueries(consoles, { now: NOW }).fallbacks.length, 2)
})

test('reconoce lenguaje de programación y conserva nombres propios como texto libre', () => {
  const interp = interpretQuery('gestor de notas escrito en rust')
  assert.equal(interp.language, 'rust')
  const free = interpretQuery('pkhex alternativas')
  assert.ok(free.freeTerms.includes('pkhex'))
  const { primary, fallbacks } = buildGithubQueries(interpretQuery('emulador gameboy'), { now: NOW })
  assert.match(primary, /^emulator gameboy/)
  assert.match(fallbacks[0] ?? '', /^emulator stars/)
})

test('copias de seguridad no se confunde con seguridad', () => {
  const interp = interpretQuery('copias de seguridad de partidas')
  assert.deepEqual(interp.concepts.map((concept) => concept.id), ['backup'])
})

function signals(extra: Partial<RepoSignals> = {}): RepoSignals {
  return {
    stars: 40, pushedAt: '2026-11-10T00:00:00Z', createdAt: '2025-06-01T00:00:00Z', description: 'Small tool that converts and inspects binary files quickly',
    topics: ['cli', 'files', 'converter'], hasReadme: true, readmeQuality: true, release: { tag: 'v1.2.0', publishedAt: '2026-10-01T00:00:00Z', url: null },
    releaseChecked: true, license: 'MIT', homepage: null, archived: false, isList: false, ...extra,
  }
}

test('una joya oculta exige señales de calidad, no solo pocas estrellas', () => {
  const gem = gemAnalysis(signals(), NOW)
  assert.ok(gem)
  assert.match(gem.summary, /poca popularidad \(40 ★\)/)
  assert.match(gem.summary, /documentación completa/)
  assert.ok(gem.verified)

  assert.equal(gemAnalysis(signals({ readmeQuality: false, hasReadme: false, release: null }), NOW), null, 'sin README ni versión no es joya')
  assert.equal(gemAnalysis(signals({ stars: 0 }), NOW), null, 'cero estrellas no basta')
  assert.equal(gemAnalysis(signals({ stars: 5000 }), NOW), null, 'demasiado popular')
  assert.equal(gemAnalysis(signals({ archived: true }), NOW), null)
  assert.equal(gemAnalysis(signals({ pushedAt: '2024-01-01T00:00:00Z' }), NOW), null, 'inactivo')
  assert.equal(gemAnalysis(signals({ isList: true }), NOW), null)
})

test('la puntuación no inventa: lo no comprobado se indica como tal', () => {
  const { score, reasons } = interestScore(signals({ hasReadme: null, readmeQuality: null, release: null, releaseChecked: false }), 0.5, null, NOW)
  assert.ok(score <= 100 && score >= 0)
  assert.ok(reasons.includes('Documentación no comprobada todavía.'))
  assert.ok(reasons.includes('Versiones publicadas no comprobadas todavía.'))
})

test('identifica proyectos archivados y abandonados', () => {
  assert.equal(projectStatus({ archived: true, pushedAt: '2026-11-01T00:00:00Z' }, NOW).id, 'archived')
  assert.equal(projectStatus({ archived: false, pushedAt: '2023-01-01T00:00:00Z' }, NOW).id, 'stale')
  assert.equal(projectStatus({ archived: false, pushedAt: '2026-11-01T00:00:00Z' }, NOW).id, 'active')
})

function project(id: number, extra: Partial<Project> = {}): Project {
  const base = normalizeFeed({ schemaVersion: 2, generatedAt: '2026-11-18T00:00:00Z', projects: [{ id, name: `p${id}`, url: `https://github.com/x/p${id}`, pushedAt: '2026-11-10T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' }] })!.projects[0]
  return { ...base, ...extra }
}

test('lee el catálogo v1 sin perder datos y deduce lo que ya verificaba', () => {
  const feed = normalizeFeed({ generatedAt: '2026-11-18T00:00:00Z', projects: [{ id: 1, name: 'a', url: 'u', reasons: ['README con contenido y secciones de documentación.'], consoles: ['3DS'] }, { bad: true }] })!
  assert.equal(feed.projects.length, 1)
  assert.equal(feed.projects[0].hasReadme, true)
  assert.equal(feed.projects[0].readmeQuality, true)
  assert.deepEqual(feed.projects[0].channels, ['nintendo'])
  assert.equal(feed.topics[0].id, 'nintendo')
})

test('la portada varía temáticas y las tendencias usan crecimiento relativo', () => {
  const list = [
    project(1, { score: 90, channels: ['ia'] }), project(2, { score: 89, channels: ['ia'] }), project(3, { score: 88, channels: ['ia'] }),
    project(4, { score: 50, channels: ['windows'] }),
  ]
  assert.deepEqual(pickFeatured(list, 8, 2).map((item) => item.id), [1, 2, 4])
  const trending = pickTrending([
    project(5, { stars: 1000, starsDelta: 20, starsDeltaDays: 7 }),
    project(6, { stars: 30, starsDelta: 10, starsDeltaDays: 7 }),
    project(7, { stars: 30, starsDelta: 0, starsDeltaDays: 7 }),
  ])
  assert.deepEqual(trending.map((item) => item.id), [6, 5])
})

test('recomienda según temáticas guardadas y explica el motivo', () => {
  const list = [project(1, { description: 'Local LLM assistant', topics: ['llm'], channels: ['ia'] }), project(2, { description: 'Photo viewer', topics: ['image'] })]
  const result = recommend(list, [{ label: 'IA', interp: interpretQuery('inteligencia artificial') }], [], new Set(), 8, NOW)
  assert.deepEqual(result.map((item) => item.project.id), [1])
  assert.equal(result[0].reason, 'Porque sigues «IA».')
  assert.ok(matchProject(list[0], interpretQuery('ia'), NOW) > 0)
  assert.equal(matchProject(list[1], interpretQuery('ia'), NOW), 0)
})

test('evita duplicados al combinar catálogo y resultados en vivo', () => {
  const merged = mergeUnique([project(1, { source: 'catalog' })], [project(1, { source: 'live' }), project(2, { source: 'live' })])
  assert.deepEqual(merged.map((item) => [item.id, item.source]), [[1, 'catalog'], [2, 'live']])
})
