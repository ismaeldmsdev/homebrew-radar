import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyCategory, classifyConsoles, collect, createLabels, request, resolveQualifiers, scoreRepository, selectCandidates, starHistory } from './collect.mjs'

test('solo declara consolas cuando hay una evidencia concreta', () => {
  assert.deepEqual(classifyConsoles({ name: '3DS Homebrew', description: 'Tool', topics: [] }), ['3DS'])
  assert.deepEqual(classifyConsoles({ name: 'nds-bootstrap', description: 'DSi and Nintendo DS', topics: [] }), ['DSi', 'DS'])
  assert.deepEqual(classifyConsoles({ name: 'game', description: '', topics: [] }), [])
})

test('clasifica categorías y limita la puntuación explicable a 100', () => {
  assert.equal(classifyCategory({ name: 'save-manager', description: '', topics: [] }), 'Herramientas para partidas guardadas')
  const project = {
    name: 'tiny-3ds-tool', description: 'Useful utility for 3DS', topics: ['homebrew'],
    pushed_at: new Date().toISOString(), stargazers_count: 2, archived: false,
    has_readme: true, release: null,
  }
  const result = scoreRepository(project)
  assert.ok(result.score >= 0 && result.score <= 100)
  assert.ok(result.reasons.length > 0)
  assert.ok(result.reasons.some((reason) => reason.includes('README')))
})

test('detecta una publicación oficial nueva aunque no cambie el commit', () => {
  const publishedAt = new Date().toISOString()
  const pushedAt = '2024-01-01T00:00:00Z'
  const repo = {
    id: 5, created_at: '2020-01-01T00:00:00Z', pushed_at: pushedAt,
    stargazers_count: 150, release: { published_at: publishedAt, tag_name: 'v2' },
  }
  const old = new Map([[5, { pushedAt, releasePublishedAt: '2023-01-01T00:00:00Z', version: 'v1' }]])
  const labels = createLabels(repo, old, new Date().toISOString())
  assert.ok(labels.includes('Actualizado'))
  assert.ok(labels.includes('Nueva versión'))
})

test('reserva espacio para consolas menos frecuentes en el catálogo', () => {
  const repositories = [
    ...Array.from({ length: 15 }, (_, id) => ({ id, name: `3ds-app-${id}`, description: '', topics: [], pushed_at: new Date(2026, 9, id + 1).toISOString() })),
    ...Array.from({ length: 5 }, (_, id) => ({ id: id + 15, name: `dsi-app-${id}`, description: '', topics: [], pushed_at: new Date(2026, 8, id + 1).toISOString() })),
    ...Array.from({ length: 5 }, (_, id) => ({ id: id + 20, name: `nds-app-${id}`, description: '', topics: [], pushed_at: new Date(2026, 7, id + 1).toISOString() })),
  ]
  const selected = selectCandidates(repositories)
  assert.equal(selected.length, 25)
  assert.equal(selected.filter((repo) => repo.name.startsWith('dsi')).length, 5)
  assert.equal(selected.filter((repo) => repo.name.startsWith('nds')).length, 5)
})

test('calcula estrellas ganadas a partir del historial y del catálogo v1', () => {
  const now = '2026-11-18T12:00:00Z'
  const fromV1 = starHistory({ stars: 40 }, 52, now, '2026-11-10T12:00:00Z')
  assert.equal(fromV1.starsDelta, 12)
  assert.equal(fromV1.starsDeltaDays, 8)
  const none = starHistory(undefined, 52, now, undefined)
  assert.equal(none.starsDelta, null)
  assert.equal(none.starHistory.length, 1)
})

test('sustituye {days:N} por una fecha ISO', () => {
  assert.equal(resolveQualifiers('pushed:>{days:10}', Date.parse('2026-11-18T00:00:00Z')), 'pushed:>2026-11-08')
})

function response(status, body, headers = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body, text: async () => JSON.stringify(body),
  }
}

test('reintenta errores temporales 5xx antes de fallar', async () => {
  let calls = 0
  const ctx = { fetch: async () => (++calls < 3 ? response(502, {}) : response(200, { ok: true })), sleep: async () => {} }
  assert.deepEqual(await request('/x', ctx), { ok: true })
  assert.equal(calls, 3)
})

function repo(id, extra = {}) {
  return {
    id, name: `tool-${id}`, full_name: `dev/tool-${id}`, owner: { login: `dev${id}`, type: 'User' }, description: 'A useful command line tool for files',
    html_url: `https://github.com/dev/tool-${id}`, homepage: null, stargazers_count: 20, forks_count: 1, size: 10, fork: false, archived: false,
    created_at: '2025-01-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', pushed_at: '2026-11-01T00:00:00Z', topics: ['cli'], language: 'Go', license: { spdx_id: 'MIT' },
    ...extra,
  }
}

const config = {
  defaults: { qualifiers: '', limit: 5 },
  topics: [
    { id: 'terminal', label: 'Terminal', queries: ['topic:cli'] },
    { id: 'ia', label: 'IA', queries: ['topic:llm'] },
  ],
}

function fakeGithub({ failTopic = null } = {}) {
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search
    if (path.startsWith('/search/repositories')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('q'))
      if (failTopic && q.includes(failTopic)) return response(500, {})
      return response(200, { items: q.includes('llm') ? [repo(2, { topics: ['llm'] })] : [repo(1)] })
    }
    if (path.endsWith('/readme')) return response(200, { content: Buffer.from(`# Tool\n\n${'Documentación. '.repeat(50)}`).toString('base64'), encoding: 'base64' })
    if (path.endsWith('/releases/latest')) return response(404, {})
    return response(404, {})
  }
}

test('conserva la última recopilación válida de una temática que falla', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-'))
  const output = join(dir, 'projects.json')
  const quiet = () => {}
  const first = await collect({ output, config, fetch: fakeGithub(), sleep: async () => {}, log: quiet })
  assert.equal(first.projects.length, 2)
  assert.equal(first.projects.find((item) => item.id === 1).hasReadme, true)
  assert.equal(first.projects.find((item) => item.id === 1).releaseChecked, true)

  const second = await collect({ output, config, fetch: fakeGithub({ failTopic: 'llm' }), sleep: async () => {}, log: quiet })
  assert.equal(second.topics.find((topic) => topic.id === 'ia').status, 'stale')
  assert.ok(second.projects.some((project) => project.id === 2), 'el proyecto de la temática fallida se conserva')
})

test('no sobrescribe el catálogo si todas las temáticas fallan', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-'))
  const output = join(dir, 'projects.json')
  const valid = JSON.stringify({ generatedAt: '2026-01-01T00:00:00Z', projects: [{ id: 9 }] })
  await writeFile(output, valid)
  const failing = async () => response(503, {})
  await assert.rejects(collect({ output, config, fetch: failing, sleep: async () => {}, log: () => {} }))
  assert.equal(await readFile(output, 'utf8'), valid)
})
