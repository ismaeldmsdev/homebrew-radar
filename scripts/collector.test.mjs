import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCategory, classifyConsoles, createLabels, scoreRepository, selectCandidates } from './collect.mjs'

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
    stargazers_count: 150, release: { published_at: publishedAt },
  }
  const old = new Map([[5, { pushedAt, releasePublishedAt: '2023-01-01T00:00:00Z' }]])
  assert.ok(createLabels(repo, old, new Date().toISOString()).includes('Actualizado'))
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
