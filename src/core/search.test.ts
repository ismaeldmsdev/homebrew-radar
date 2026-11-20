import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPlatforms, detectToolType, extractCompat, isConsoleRelated, isMacHomebrew, looksLikePiracy } from './consoles.ts'
import { normalizeProject } from './feed.ts'
import { buildGithubQueries, interpretQuery, relevanceOf } from './query.ts'
import { rankSearch } from './search.ts'
import type { Project } from '../types.ts'

const NOW = Date.parse('2026-11-19T12:00:00Z')

function project(id: number, extra: Record<string, unknown> = {}): Project {
  return normalizeProject({
    id, name: `p${id}`, fullName: `owner${id}/p${id}`, owner: `owner${id}`, url: `https://github.com/owner${id}/p${id}`,
    description: '', topics: [], stars: 50, pushedAt: '2026-11-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z',
    hasReadme: true, readmeQuality: true, releaseChecked: true, license: 'MIT', ...extra,
  })!
}

test('entiende consultas de consolas y las traduce a términos de GitHub', () => {
  const vita = interpretQuery('Custom firmware para PS Vita')
  assert.deepEqual(vita.concepts.map((concept) => concept.id).sort(), ['cfw', 'vita'])
  const queries = buildGithubQueries(vita, { now: NOW })
  assert.match(queries.primary, /^psvita custom-firmware/)
  assert.ok(queries.fallbacks.some((query) => query.startsWith('vita custom-firmware')))

  assert.deepEqual(interpretQuery('Herramientas para Wii U').concepts.map((concept) => concept.id), ['wiiu'], 'Wii U no se confunde con Wii')
  assert.deepEqual(interpretQuery('Homebrew para Xbox 360').concepts.map((concept) => concept.id).sort(), ['homebrew', 'x360'])
  assert.deepEqual(interpretQuery('Herramientas para gestionar partidas guardadas de 3DS').concepts.map((concept) => concept.id).sort(), ['3ds', 'organize', 'saves'])
  const sd = interpretQuery('Herramientas para la tarjeta SD de la Nintendo DSi')
  assert.deepEqual(sd.concepts.map((concept) => concept.id).sort(), ['dsi', 'storage'], '«Nintendo» sobra si hay una consola concreta')
})

test('traduce vocabulario general y no envía palabras españolas sueltas a GitHub', () => {
  const passwords = interpretQuery('Gestor de contraseñas autoalojado')
  assert.deepEqual(passwords.concepts.map((concept) => concept.id).sort(), ['organize', 'passwords', 'selfhosted'])
  assert.deepEqual(passwords.freeTerms, [])
  assert.doesNotMatch(buildGithubQueries(passwords, { now: NOW }).primary, /contrasen|(^| )manager( |$)/, '«gestor» es blando y no se exige')

  const notes = interpretQuery('Programa para tomar notas en Markdown')
  assert.deepEqual(notes.concepts.map((concept) => concept.id).sort(), ['markdown', 'notes'])
  assert.equal(notes.kind, 'app')
  assert.deepEqual(notes.freeTerms, [])

  const pdf = interpretQuery('Biblioteca de Python para leer archivos PDF')
  assert.equal(pdf.kind, 'library')
  assert.equal(pdf.language, 'python')
  assert.doesNotMatch(buildGithubQueries(pdf, { now: NOW }).primary, /biblioteca|leer/)
})

test('la relevancia exige palabras completas y plataformas detectadas de verdad', () => {
  const files = interpretQuery('buscar archivos')
  assert.equal(relevanceOf(project(1, { description: 'Edit your user profile pages' }), files, NOW).value, 0, '«file» no encaja dentro de «profile»')
  assert.ok(relevanceOf(project(2, { name: 'fselect', description: 'Find files with SQL-like queries' }), files, NOW).value > 0.7)

  const switchHb = interpretQuery('homebrew para Switch')
  assert.equal(relevanceOf(project(3, { description: 'Homebrew network switch configuration tool' }), switchHb, NOW).value, 0, 'un switch de red no es una Nintendo Switch')
  assert.ok(relevanceOf(project(4, { description: 'A homebrew menu for the Nintendo Switch', topics: ['nintendo-switch', 'homebrew'] }), switchHb, NOW).value > 0.8)

  const retro = interpretQuery('emuladores retro')
  assert.equal(relevanceOf(project(5, { description: 'Retro-futuristic terminal emulator for Windows' }), retro, NOW).value, 0, 'un emulador de terminal no es un emulador de consolas')
})

test('distingue aplicaciones de bibliotecas según lo que se pide', () => {
  const app = interpretQuery('Aplicación para organizar fotografías')
  const library = project(6, { name: 'photo_manager', description: 'A Flutter plugin that provides photo management APIs', topics: ['photos', 'library'], summary: { text: 'Es una biblioteca de Flutter para gestionar fotos.', kinds: ['library'], origin: 'curated' } })
  const desktop = project(7, { name: 'lap', description: 'An offline-first photo manager', summary: { text: 'Es un gestor de fotos de escritorio.', kinds: ['app'], origin: 'curated' } })
  assert.ok(relevanceOf(desktop, app, NOW).value > relevanceOf(library, app, NOW).value + 0.3)
})

test('la relevancia manda sobre la popularidad y se limita a 2 proyectos por autor', () => {
  const interp = interpretQuery('reproductor de música para Android')
  const famousLoose = project(8, { name: 'mega-suite', description: 'Android utilities, including a small music player', stars: 60_000 })
  const exact = project(9, { name: 'android-music-player', description: 'Music player for Android', topics: ['android', 'music', 'player'], stars: 30 })
  const ranked = rankSearch([famousLoose, exact], [], interp, { now: NOW })
  assert.equal(ranked[0].project.id, 9)

  const same = [10, 11, 12].map((id) => project(id, { owner: 'solo', fullName: `solo/p${id}`, description: 'Music player for Android', topics: ['android', 'music', 'player'] }))
  const other = project(13, { description: 'Music player for Android', topics: ['android', 'music'], stars: 5 })
  const diverse = rankSearch([...same, other], [], interp, { now: NOW })
  assert.ok(diverse.slice(0, 3).some((item) => item.project.id === 13), 'el tercero del mismo autor cede el puesto')
})

test('respeta el orden que pide la consulta', () => {
  const interp = interpretQuery('herramientas populares de backup')
  assert.equal(interp.sort, 'stars')
  const small = project(14, { description: 'Backup tool', topics: ['backup'], stars: 10 })
  const big = project(15, { description: 'Backup tool', topics: ['backup'], stars: 9000 })
  assert.equal(rankSearch([small, big], [], interp, { now: NOW })[0].project.id, 15)
})

test('consolas: detecta plataformas, tipo de herramienta, Homebrew de macOS y piratería', () => {
  assert.deepEqual(detectPlatforms({ name: 'VitaShell', description: 'File manager for PS Vita with HENkaku' }), ['vita'])
  assert.deepEqual(detectPlatforms({ name: 'goldhen', description: 'GoldHEN for PS4' }), ['ps4'])
  assert.equal(detectToolType({ name: 'Checkpoint', description: 'Fast and simple homebrew save manager for 3DS and Switch' }), 'saves')
  assert.equal(detectToolType({ name: 'ps4-jb', description: 'PS4 jailbreak host with GoldHEN' }), 'cfw')
  assert.equal(isMacHomebrew({ name: 'WailBrew', description: 'Minimalistic Homebrew GUI made with Go', topics: ['homebrew', 'macos'] }), true)
  assert.equal(isMacHomebrew({ name: 'TWiLightMenu', description: 'DSi Menu replacement', topics: ['homebrew', 'nds'] }), false)
  assert.equal(isConsoleRelated({ name: 'install', fullName: 'Homebrew/install', description: 'Homebrew (un)installer', topics: ['homebrew'] }), false)
  assert.equal(looksLikePiracy({ name: 'switch-shop', description: 'Free NSP download links for your Switch' }), true)
  assert.equal(looksLikePiracy({ name: 'ppsspp', description: 'A PSP emulator' }), false)
})

test('extrae menciones literales de compatibilidad del README sin interpretarlas', () => {
  const compat = extractCompat('Works on Old 3DS and New 3DS XL. Supports firmware 11.14 - 11.17. Requires Luma3DS v13 or later installed on the SD card.')
  assert.deepEqual(compat?.models, ['New 3DS', 'Old 3DS'])
  assert.deepEqual(compat?.firmware, ['firmware 11.14 - 11.17'])
  assert.equal(compat?.requires.length, 1)
  assert.equal(extractCompat('A small text editor written in Rust.'), null)
})

test('no confunde 3ds Max, pantallas DSI ni módulos de 3DS con consolas', async () => {
  const { detectPlatforms } = await import('./consoles.ts')
  assert.deepEqual(detectPlatforms({ name: 'tm', description: 'Custom UI themes for 3ds Max 2026' }), [])
  assert.deepEqual(detectPlatforms({ name: 'cm4', description: 'SD-card image for a CM4 with a MIPI DSI display' }), [])
  assert.deepEqual(detectPlatforms({ name: '3ds-recorder', description: 'Record your 3DS screen with a Luma3DS sysmodule' }), ['3ds'])
})

test('una consola que solo es el origen de un port no cuenta como homebrew para ella', () => {
  const x360 = interpretQuery('Homebrew para Xbox 360')
  const port = project(20, { description: 'Prototype (Xbox 360) homebrew recompilation for Nintendo Switch' })
  const native = project(21, { description: 'Homebrew app launcher for the Xbox 360 with RGH', topics: ['xbox360', 'homebrew'] })
  assert.equal(relevanceOf(port, x360, NOW).value, 0)
  assert.ok(relevanceOf(native, x360, NOW).value > 0.8)
  const multi = project(22, { description: 'Fast homebrew save manager for 3DS and Switch' })
  assert.ok(relevanceOf(multi, interpretQuery('homebrew para Switch'), NOW).value > 0.8, 'las listas heredan el destino')
})

test('siglas cortas en la descripción no bastan («AI» de pasada no es una herramienta de IA)', () => {
  const ai = interpretQuery('herramientas de inteligencia artificial')
  const incidental = project(23, { name: 'chipset-updater', description: 'Intel chipset INF installer reviewed by 6 AI systems' })
  const real = project(24, { name: 'local-ai-tool', description: 'Chat with local models', topics: ['ai', 'llm'] })
  assert.equal(relevanceOf(incidental, ai, NOW).value, 0)
  assert.ok(relevanceOf(real, ai, NOW).value > 0.8)
})

test('busca en la escena de la consola cuando se pide CFW', () => {
  const { fallbacks } = buildGithubQueries(interpretQuery('Custom firmware para PS Vita'), { now: NOW })
  assert.match(fallbacks[0], /^henkaku /)
})

test('Radar de Consolas: separa proyectos nuevos, versiones nuevas y recuperados', async () => {
  const { consoleSections, consoleFacets } = await import('./consoleRadar.ts')
  const fresh = project(30, { name: 'new-vita-tool', description: 'Homebrew file manager for PS Vita', createdAt: '2026-10-20T00:00:00Z', channels: ['consolas'] })
  const released = project(31, { name: 'goldhen-plugin', description: 'GoldHEN plugin for PS4', createdAt: '2023-01-01T00:00:00Z', version: 'v2.0', releasePublishedAt: '2026-11-10T00:00:00Z', channels: ['consolas'] })
  const touched = project(32, { name: 'old-wii-app', description: 'Wii homebrew channel app', createdAt: '2019-01-01T00:00:00Z', pushedAt: '2026-11-18T00:00:00Z', channels: ['consolas'] })
  const revived = project(33, { name: 'n64-tool', description: 'Nintendo 64 homebrew utility', createdAt: '2020-01-01T00:00:00Z', labels: ['Reactivado', 'Actualizado'], channels: ['consolas'] })
  const unrelated = project(34, { name: 'notes', description: 'Markdown notes app' })
  const sections = consoleSections([fresh, released, touched, revived, unrelated], NOW)
  assert.deepEqual(sections.newProjects.map((item) => item.id), [30])
  assert.deepEqual(sections.releases.map((item) => item.id), [31])
  assert.deepEqual(sections.revived.map((item) => item.id), [33])
  assert.ok(!sections.newProjects.some((item) => item.id === 32), 'un commit reciente en un proyecto antiguo no es un proyecto nuevo')
  assert.equal(sections.total, 4)
  const facets = consoleFacets([fresh, released, touched, revived, unrelated])
  assert.deepEqual(facets.platforms.map(([id]) => id).sort(), ['n64', 'ps4', 'vita', 'wii'])
})
