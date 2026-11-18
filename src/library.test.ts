import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadLibrary, saveLibrary } from './library.ts'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('guarda y recupera favoritos, vistos y ocultos', () => {
  const storage = new MemoryStorage()
  const library = { favorites: [1, 7], seen: [7], hidden: [3] }
  saveLibrary(library, storage)
  assert.deepEqual(loadLibrary(storage), library)
})

test('descarta datos dañados e identificadores no numéricos', () => {
  const storage = new MemoryStorage()
  storage.setItem('homebrew-radar-library', '{"favorites":[2,"x"],"seen":null,"hidden":[4]}')
  assert.deepEqual(loadLibrary(storage), { favorites: [2], seen: [], hidden: [4] })
  storage.setItem('homebrew-radar-library', '{bad json')
  assert.deepEqual(loadLibrary(storage), { favorites: [], seen: [], hidden: [] })
})
