import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addInterest, emptyLibrary, exportLibrary, importLibrary, loadLibrary, markSeen, saveLibrary, toggleFavorite, toggleHidden } from './library.ts'
import { normalizeProject } from './core/feed.ts'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const project = (id: number) => normalizeProject({ id, name: `p${id}`, url: `https://github.com/x/p${id}`, source: 'live' })!

test('guarda y recupera favoritos, vistos y ocultos', () => {
  const storage = new MemoryStorage()
  const library = { ...emptyLibrary(), favorites: [1, 7], seen: [7], hidden: [3] }
  saveLibrary(library, storage)
  const loaded = loadLibrary(storage)
  assert.deepEqual(loaded.favorites, [1, 7])
  assert.deepEqual(loaded.seen, [7])
  assert.deepEqual(loaded.hidden, [3])
})

test('descarta datos dañados e identificadores no numéricos', () => {
  const storage = new MemoryStorage()
  storage.setItem('homebrew-radar-library', '{"favorites":[2,"x"],"seen":null,"hidden":[4]}')
  const loaded = loadLibrary(storage)
  assert.deepEqual([loaded.favorites, loaded.seen, loaded.hidden], [[2], [], [4]])
  storage.setItem('homebrew-radar-library', '{bad json')
  assert.deepEqual(loadLibrary(storage), emptyLibrary())
})

test('migra el formato v1 sin perder favoritos y mantiene los campos v1', () => {
  const storage = new MemoryStorage()
  storage.setItem('homebrew-radar-library', JSON.stringify({ favorites: [10, 11], seen: [10, 12], hidden: [5] }))
  const migrated = loadLibrary(storage)
  assert.equal(migrated.version, 2)
  assert.deepEqual(migrated.favorites, [10, 11])
  assert.deepEqual(migrated.history.map((entry) => entry.id), [12, 10])
  saveLibrary(migrated, storage)
  const raw = JSON.parse(storage.getItem('homebrew-radar-library')!)
  assert.deepEqual(raw.favorites, [10, 11], 'una versión anterior de la web sigue leyendo los favoritos')
})

test('guarda una copia de los proyectos en vivo y la conserva solo si se usa', () => {
  let library = toggleFavorite(emptyLibrary(), project(1))
  library = markSeen(library, project(2), '2026-11-18T00:00:00Z')
  library = toggleHidden(library, project(3))
  const storage = new MemoryStorage()
  saveLibrary(library, storage)
  const loaded = loadLibrary(storage)
  assert.deepEqual(Object.keys(loaded.snapshots).sort(), ['1', '2', '3'])
  assert.equal(loaded.snapshots['2'].source, 'live')
  const unfavorited = toggleFavorite(loaded, project(1))
  saveLibrary(unfavorited, storage)
  assert.ok(!('1' in loadLibrary(storage).snapshots))
})

test('ocultar un favorito lo quita de favoritos y las temáticas no se duplican', () => {
  let library = toggleFavorite(emptyLibrary(), project(1))
  library = toggleHidden(library, project(1))
  assert.deepEqual(library.favorites, [])
  library = addInterest(library, 'Nintendo 3DS')
  library = addInterest(library, 'nintendo 3ds')
  assert.equal(library.interests.length, 1)
})

test('saveLibrary no rompe la app si el almacenamiento falla', () => {
  assert.equal(saveLibrary(emptyLibrary(), { setItem: () => { throw new Error('QuotaExceededError') } }), false)
})

test('importar combina sin borrar datos existentes', () => {
  const here = addInterest(toggleFavorite(emptyLibrary(), project(1)), 'IA')
  const there = addInterest(toggleFavorite(emptyLibrary(), project(2)), 'Emuladores')
  const merged = importLibrary(here, exportLibrary(there))
  assert.deepEqual(merged.favorites.sort(), [1, 2])
  assert.deepEqual(merged.interests.map((item) => item.query), ['IA', 'Emuladores'])
  assert.throws(() => importLibrary(here, 'no es json'))
})
