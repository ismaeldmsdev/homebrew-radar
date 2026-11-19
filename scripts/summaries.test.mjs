import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanReadme, fallbackSummary, fromCompact, inferKinds, isOutdated, KIND_LABELS, shortHash, summaryProblems } from '../src/core/summary.ts'
import { normalizeProject } from '../src/core/feed.ts'
import { interpretQuery, matchProject } from '../src/core/query.ts'
import { applySummaries } from './summaries.mjs'
import { collect } from './collect.mjs'

const store = JSON.parse(await readFile(new URL('../data/summaries.json', import.meta.url), 'utf8'))
const feed = JSON.parse(await readFile(new URL('../public/data/projects.json', import.meta.url), 'utf8'))
const byName = (name) => Object.values(store.summaries).find((entry) => entry.fullName === name)

test('todos los resúmenes guardados están en español, tienen 2-3 frases y tipos válidos', () => {
  const entries = Object.values(store.summaries)
  assert.ok(entries.length >= 20, 'hay al menos 20 proyectos reales evaluados')
  for (const entry of entries) {
    assert.deepEqual(summaryProblems(entry.text, entry.kinds), [], `${entry.fullName}: ${summaryProblems(entry.text, entry.kinds).join(' ')}`)
    assert.ok(entry.basis && typeof entry.basis.description === 'string', `${entry.fullName} guarda la huella de su documentación`)
  }
})

test('el catálogo publicado lleva el resumen de cada proyecto en caché', () => {
  const cached = feed.projects.filter((project) => store.summaries[String(project.id)])
  assert.ok(cached.length > 0)
  for (const project of cached) assert.equal(project.summary?.text, store.summaries[String(project.id)].text, project.fullName)
})

// Muestra de 24 proyectos reales de categorías distintas: el tipo asignado debe coincidir
// con lo que documenta cada README (aplicación, terminal, biblioteca, autoalojado…).
const expectations = [
  ['wickenico/WailBrew', 'app', 'Multimedia/macOS'],
  ['julyx10/lap', 'app', 'Fotografía'],
  ['LinwoodDev/Butterfly', 'app', 'Notas'],
  ['gopher64/gopher64', 'app', 'Emuladores'],
  ['erez-c137/NetSpeedTray', 'app', 'Windows'],
  ['Aidoku/Aidoku', 'app', 'iOS'],
  ['bahdotsh/wrkflw', 'cli', 'Desarrollo'],
  ['hledgerorg/hledger', 'cli', 'Finanzas'],
  ['ravachol/kew', 'cli', 'Música en terminal'],
  ['jhspetersson/fselect', 'cli', 'Archivos'],
  ['emmercm/igir', 'cli', 'Retro'],
  ['crossterm-rs/crossterm', 'library', 'Rust'],
  ['langroid/langroid', 'library', 'IA'],
  ['blocksds/libnds', 'library', 'Nintendo DS'],
  ['JonathanSalwan/Triton', 'library', 'Seguridad'],
  ['dbos-inc/dbos-transact-golang', 'library', 'Automatización'],
  ['fccview/jotty', 'selfhosted', 'Productividad'],
  ['nilsteampassnet/TeamPass', 'selfhosted', 'Contraseñas'],
  ['zelon88/HRConvert2', 'selfhosted', 'Conversión'],
  ['IvanMurzak/Unity-MCP', 'plugin', 'Videojuegos'],
  ['papersgpt/papersgpt-for-zotero', 'plugin', 'Investigación'],
  ['neo-engine/neo', 'experimental', 'Homebrew DS'],
  ['agonisingbasher/ocarina-of-time-dsi', 'experimental', 'Homebrew DSi'],
  ['nextcode4u/gloam-shell-theme-directory', 'list', 'Temas'],
]

test('diferencia aplicaciones, herramientas de terminal, bibliotecas y proyectos experimentales', () => {
  for (const [name, kind] of expectations) {
    const entry = byName(name)
    assert.ok(entry, `${name} tiene resumen`)
    assert.ok(entry.kinds.includes(kind), `${name} debería marcarse como «${KIND_LABELS[kind]}» (tiene ${entry.kinds.join(', ') || 'ninguno'})`)
  }
  // Una biblioteca nunca se presenta como aplicación lista para usar.
  for (const name of ['crossterm-rs/crossterm', 'langroid/langroid', 'blocksds/libnds']) assert.ok(!byName(name).kinds.includes('app'), name)
})

test('los proyectos con documentación escasa se marcan como limitados y lo dicen', () => {
  for (const name of ['TASEmulators/desmume', 'digital-asset/daml', 'sammwyy/gtasands', 'fabianquilpue/Laura_WordProcessor_3DS', 'Darknesstate/Tomodachi-Life-Save-Editor-']) {
    const entry = byName(name)
    assert.equal(entry.limited, true, name)
    assert.match(entry.text, /faltan datos/i, name)
  }
})

test('la descripción básica no inventa: dice qué falta y solo usa metadatos', () => {
  const sparse = fallbackSummary({ name: 'thing', description: '', topics: [], language: null, category: 'Otros proyectos interesantes' })
  assert.equal(sparse.limited, true)
  assert.equal(sparse.origin, 'rules')
  assert.match(sparse.text, /faltan datos/)
  assert.deepEqual(sparse.kinds, [])

  const cli = fallbackSummary({ name: 'fastgrep', description: 'A fast grep replacement written in Rust', topics: ['cli', 'search'], language: 'Rust', category: 'Herramientas de terminal' })
  assert.match(cli.text, /^Proyecto para la terminal, escrito en Rust\./)
  assert.match(cli.text, /programa de línea de comandos/)
  assert.match(cli.text, /descripción original/)
  assert.doesNotMatch(cli.text, /fácil|rápid|potente/i, 'no añade valoraciones que no se han comprobado')

  const ds = fallbackSummary({ name: 'menu', description: 'Menu for DSi', topics: [], consoles: ['DSi'], category: 'Aplicaciones y utilidades' })
  assert.match(ds.text, /Nintendo DSi/)
})

test('detecta el tipo de proyecto solo con evidencias', () => {
  assert.deepEqual(inferKinds({ name: 'x', description: 'Rust library for parsing', topics: [] }), ['library'])
  assert.deepEqual(inferKinds({ name: 'x', description: 'Self-hosted wiki', topics: ['docker'], readme: 'Run with docker compose up' }), ['selfhosted', 'config'])
  assert.deepEqual(inferKinds({ name: 'x', description: 'Prototype of a new shell', topics: ['cli'] }), ['cli', 'experimental'])
  assert.deepEqual(inferKinds({ name: 'photos', description: 'Photo viewer', topics: [] }), [], 'sin evidencia no se clasifica')
  assert.deepEqual(inferKinds({ name: 'awesome-x', description: 'list', topics: [], isList: true }), ['list'])
})

test('limpia el README antes de resumir', () => {
  const text = cleanReadme('# T\n[![b](https://x/b.svg)](https://x)\n<p align="center"><img src="a.png"></p>\nUses [Docker](https://docker.com).\n```sh\nrm -rf /\n```\n| a | b |\n')
  assert.equal(text, '# T\nUses Docker.')
})

test('marca el resumen como desactualizado cuando cambia la documentación', () => {
  const basis = { description: shortHash('A tool'), readmeLength: 4000 }
  assert.equal(isOutdated(basis, 'A tool', 4100), false)
  assert.equal(isOutdated(basis, 'A tool  ', 4000), false, 'los espacios no cuentan como cambio')
  assert.equal(isOutdated(basis, 'A different tool', 4000), true)
  assert.equal(isOutdated(basis, 'A tool', 9000), true)
  assert.equal(fromCompact({ t: 'x', d: null, k: ['cli'], o: 'curated', l: 0, h: shortHash('A tool'), u: '2026-11-19' }, 'Other').outdated, true)
})

test('rechaza resúmenes en inglés, genéricos o con promesas sin pruebas', () => {
  const work = [{ id: 1, fullName: 'a/b', basis: { description: 'h', readmeLength: 10 } }]
  const target = { version: 1, summaries: {} }
  const rejected = applySummaries(target, [
    { id: 1, text: 'This is a tool that lets you manage files. It is fast and works with your system.', kinds: [] },
    { fullName: 'a/b', text: 'Es una herramienta de código abierto para mejorar la productividad. Es potente y fácil de usar para todos.', kinds: [] },
    { id: 1, text: 'Es un gestor de archivos para la terminal que permite moverse por carpetas con el teclado. Útil para quien trabaja en servidores sin escritorio.', kinds: ['cli', 'magia'] },
  ], work)
  assert.equal(rejected.length, 3)
  assert.equal(Object.keys(target.summaries).length, 0)
  assert.deepEqual(applySummaries(target, [{ fullName: 'A/B', text: 'Es un gestor de archivos para la terminal que permite moverse por carpetas con el teclado. Útil para quien trabaja en servidores sin escritorio.', kinds: ['cli'] }], work), [])
  assert.equal(target.summaries['1'].origin, 'curated')
})

test('las búsquedas en español encuentran proyectos por su resumen', () => {
  const project = normalizeProject({ id: 5, name: 'lap', url: 'https://github.com/julyx10/lap', description: 'An offline-first photo manager', summary: { text: 'Es un gestor de fotos de escritorio para organizar tus fotografías sin conexión.', kinds: ['app'], origin: 'curated' } })
  assert.ok(matchProject(project, interpretQuery('organizar fotografías')) > 0)
})

test('el recopilador añade los resúmenes de la caché al catálogo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-sum-'))
  const output = join(dir, 'projects.json')
  const summariesPath = join(dir, 'summaries.json')
  const description = 'A useful command line tool'
  await writeFile(summariesPath, JSON.stringify({ version: 1, summaries: { 1: {
    id: 1, fullName: 'dev/tool-1', text: 'Es una herramienta de terminal de prueba. Sirve para comprobar que el recopilador copia los resúmenes guardados.',
    kinds: ['cli'], origin: 'curated', basis: { description: shortHash(description), readmeLength: null }, updatedAt: '2026-11-19T00:00:00Z',
  } } }))
  const repo = { id: 1, name: 'tool-1', full_name: 'dev/tool-1', owner: { login: 'dev', type: 'User' }, description, html_url: 'https://github.com/dev/tool-1',
    homepage: null, stargazers_count: 20, forks_count: 1, size: 10, fork: false, archived: false, created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z', pushed_at: '2026-11-01T00:00:00Z', topics: ['cli'], language: 'Go', license: null }
  const fake = async (url) => {
    const path = new URL(url).pathname
    if (path.startsWith('/search/repositories')) return new Response(JSON.stringify({ items: [repo] }), { status: 200 })
    if (path.endsWith('/readme')) return new Response(JSON.stringify({ content: Buffer.from('# Tool\n\nTexto.').toString('base64'), encoding: 'base64' }), { status: 200 })
    return new Response('{}', { status: 404 })
  }
  const config = { defaults: { qualifiers: '' }, topics: [{ id: 'terminal', label: 'Terminal', queries: ['topic:cli'] }] }
  const result = await collect({ output, config, fetch: fake, sleep: async () => {}, log: () => {}, summariesPath })
  const project = result.projects.find((item) => item.id === 1)
  assert.equal(project.summary.origin, 'curated')
  assert.equal(project.summary.outdated, false)
  assert.equal(typeof project.readmeLength, 'number')
})
