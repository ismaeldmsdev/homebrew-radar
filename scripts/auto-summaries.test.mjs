import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { groundingProblems, isThinEvidence, namedTerms } from '../src/core/grounding.ts'
import { shortHash } from '../src/core/summary.ts'
import { validateGenerated, PROMPT_VERSION } from './summarizer.mjs'
import { auto, compactStore, generatorFor, parseRequest, pendingProjects, request, requestComment } from './summaries.mjs'

const evidence = {
  name: 'photo-sorter', description: 'Desktop app that sorts photos into folders by date', topics: ['photos', 'windows'],
  readme: 'Download the installer for Windows from the releases page. Select a folder and it moves each picture into year/month folders and detects duplicate files.',
}

test('rechaza plataformas, nombres y cifras que no aparecen en la documentación', () => {
  assert.deepEqual(groundingProblems({ text: 'Es una aplicación para Windows que ordena fotos por fecha.', kinds: ['app'] }, evidence), [])
  const invented = groundingProblems({ text: 'Es una aplicación para Windows, macOS y Android que ordena 5000 fotos con Lightroom.', kinds: ['app', 'library'] }, evidence)
  assert.ok(invented.some((problem) => problem.includes('macOS')))
  assert.ok(invented.some((problem) => problem.includes('Android')))
  assert.ok(invented.some((problem) => problem.includes('5000')))
  assert.ok(invented.some((problem) => problem.includes('Lightroom')))
  assert.ok(invented.some((problem) => problem.includes('library')), 'una aplicación no es una biblioteca sin pruebas')
})

test('acepta equivalencias habituales y no confunde palabras comunes con nombres propios', () => {
  const docs = { name: 'db-tool', description: 'Backups for Postgres', topics: ['3ds'], readme: 'Runs on Apple Silicon Macs.' }
  assert.deepEqual(groundingProblems({ text: 'Hace copias de PostgreSQL desde un Mac. Útil para una consola Nintendo.' }, docs), [])
  assert.deepEqual(namedTerms('Es una herramienta. Permite ordenar fotos con la API de GitHub.'), [])
})

test('la documentación escasa obliga a decir que faltan datos', () => {
  const thin = { fullName: 'a/b', description: 'Word processor', topics: [], readme: '# B\nWord processor', language: null }
  assert.equal(isThinEvidence({ name: 'b', ...thin }), true)
  const confident = validateGenerated({ texto: 'Es un procesador de textos para escribir documentos. Permite redactar y guardar textos largos. Útil para escritores.', tipos: [], faltan_datos: false }, thin)
  assert.ok(confident.problems.some((problem) => problem.includes('faltan datos')))
  const honest = validateGenerated({ texto: 'Según su descripción es un procesador de textos. Faltan datos en el repositorio para explicar sus funciones o cómo instalarlo.', tipos: [], faltan_datos: true }, thin)
  assert.deepEqual(honest.problems, [])
  assert.equal(honest.limited, true)
})

const config = { model: { name: 'modelo-prueba', file: 'm.gguf' }, runtime: { llamaCpp: 'b1' }, maxPerRun: 2, timeBudgetMinutes: 10, retryAfterDays: 14 }
const generator = generatorFor(config)

function project(id, extra = {}) {
  return { id, name: `p${id}`, fullName: `dev/p${id}`, description: `Tool number ${id} for sorting photos`, topics: ['photos'], score: 50, readmeLength: 500, archived: false, isList: false, ...extra }
}

test('prioriza proyectos sin resumen y no reintenta fallos recientes con la misma documentación', () => {
  const store = { summaries: { 2: { basis: { description: shortHash('changed before'), readmeLength: 500 } }, 3: { basis: { description: shortHash('Tool number 3 for sorting photos'), readmeLength: 500 } } } }
  const now = Date.parse('2026-11-19T12:00:00Z')
  const attempts = { attempts: { 4: { basis: { description: shortHash('Tool number 4 for sorting photos') }, generator: `${generator.model}|${generator.llamaCpp}|${generator.promptVersion}`, at: '2026-11-18T12:00:00Z' } } }
  const list = pendingProjects([project(1, { score: 10 }), project(2, { score: 90 }), project(3), project(4), project(5, { score: 80 })], store, attempts, generator, { now })
  assert.deepEqual(list.map((item) => item.id), [5, 1, 2], 'nuevos primero (por puntuación), luego desactualizados; 3 está al día y 4 falló ayer')
  const later = pendingProjects([project(4)], store, attempts, generator, { now: now + 20 * 86_400_000 })
  assert.deepEqual(later.map((item) => item.id), [4], 'pasado el plazo se vuelve a intentar')
})

/** Simula GitHub (README) y el modelo local con respuestas fijas. */
function fakeWorld(replies) {
  return async (url, options) => {
    if (String(url).includes('raw.githubusercontent.com')) return new Response(`# P\nDesktop app for Windows that sorts photos into folders by date and detects duplicate files. ${'More details. '.repeat(30)}`, { status: 200 })
    if (String(url).includes('api.github.com/repos/dev/p9')) return new Response(JSON.stringify({ id: 9, full_name: 'dev/p9', description: 'Tool number 9 for sorting photos', topics: ['photos'], language: 'Go', homepage: null, stargazers_count: 3, archived: false, private: false }), { status: 200 })
    if (String(url).endsWith('/chat/completions')) {
      const body = JSON.parse(options.body)
      const name = body.messages.at(-1).content.match(/dev\/p(\d+)/)?.[1] ?? body.messages.findLast((message) => message.content.includes('Repositorio: dev/'))?.content.match(/dev\/p(\d+)/)?.[1]
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replies[name]) } }], timings: { predicted_per_second: 10 } }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }
}

const good = { texto: 'Es una aplicación de escritorio para Windows que ordena tus fotos. Permite repartirlas en carpetas por fecha y detectar archivos duplicados. Útil si tienes muchas fotos desordenadas.', tipos: ['app'], faltan_datos: false }
const invented = { texto: 'Es una aplicación para Android y iPhone que ordena tus fotos. Permite subirlas a la nube de Dropbox y editarlas con filtros. Útil para fotógrafos profesionales.', tipos: ['app'], faltan_datos: false }

async function setup(projects, summaries = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'radar-auto-'))
  const paths = { feed: join(dir, 'projects.json'), store: join(dir, 'summaries.json'), attempts: join(dir, 'attempts.json') }
  await writeFile(paths.feed, JSON.stringify({ generatedAt: '2026-11-19T00:00:00Z', projects }))
  await writeFile(paths.store, JSON.stringify({ version: 1, summaries }))
  return paths
}

const fakeProvider = async () => ({ provider: { url: 'http://127.0.0.1:1/v1' }, close: async () => {} })

test('genera, valida y guarda con la huella del generador; rechaza lo inventado y respeta el límite', async () => {
  const curated = { id: 3, fullName: 'dev/p3', text: 'Texto revisado.', kinds: [], origin: 'curated', basis: { description: shortHash('Tool number 3 for sorting photos'), readmeLength: 500 }, updatedAt: '2026-11-19' }
  const paths = await setup([project(1, { score: 90 }), project(2, { score: 80 }), project(3), project(4, { score: 10 })], { 3: curated })
  const result = await auto({ env: {}, log: process.env.DEBUG_AUTO ? console.log : () => {}, fetch: fakeWorld({ 1: good, 2: invented, 4: good }), config, openProvider: fakeProvider, paths })
  assert.equal(result.pending, 3)
  assert.equal(result.generated, 1)
  assert.equal(result.rejected, 1)
  const store = JSON.parse(await readFile(paths.store, 'utf8')).summaries
  assert.equal(store[1].origin, 'llm')
  assert.deepEqual(store[1].generator, { model: 'modelo-prueba', file: 'm.gguf', llamaCpp: 'b1', promptVersion: PROMPT_VERSION })
  assert.equal(store[2], undefined, 'lo inventado no se guarda: queda la descripción básica')
  assert.equal(store[3].text, 'Texto revisado.', 'los resúmenes revisados vigentes no se tocan')
  assert.equal(store[4], undefined, 'maxPerRun = 2')
  const attempts = JSON.parse(await readFile(paths.attempts, 'utf8')).attempts
  assert.ok(attempts[2].problems.some((problem) => /Android|iPhone|Dropbox/.test(problem)))
  assert.equal(compactStore({ summaries: store })[1].g, 'modelo-prueba')
})

test('sin modelo disponible no falla ni toca la caché', async () => {
  const paths = await setup([project(1)])
  const result = await auto({ env: {}, log: () => {}, config, openProvider: async () => null, paths })
  assert.equal(result.skipped, true)
  assert.deepEqual(JSON.parse(await readFile(paths.store, 'utf8')).summaries, {})
})

test('las solicitudes solo aceptan owner/repo válidos', () => {
  assert.equal(parseRequest('Resumen: julyx10/lap'), 'julyx10/lap')
  assert.equal(parseRequest('resumen: https://github.com/julyx10/lap/'), 'julyx10/lap')
  assert.equal(parseRequest('Resumen: a/b; rm -rf /'), null)
  assert.equal(parseRequest('Otra cosa'), null)
  assert.equal(parseRequest('Resumen: $(curl x)/y'), null)
})

test('una solicitud genera el resumen de un repositorio fuera del catálogo', async () => {
  const paths = await setup([])
  const result = await request('dev/p9', { env: {}, log: () => {}, fetch: fakeWorld({ 9: good }), config, openProvider: fakeProvider, paths })
  assert.equal(result.status, 'generated')
  assert.match(requestComment(result), /sin revisión humana/)
  const store = JSON.parse(await readFile(paths.store, 'utf8')).summaries
  assert.equal(store[9].origin, 'llm')
})
