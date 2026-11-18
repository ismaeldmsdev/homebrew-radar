export type Library = { favorites: number[]; seen: number[]; hidden: number[] }

const KEY = 'homebrew-radar-library'
const EMPTY: Library = { favorites: [], seen: [], hidden: [] }

export function loadLibrary(storage: Pick<Storage, 'getItem'> = localStorage): Library {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return { ...EMPTY }
    const value = data as Partial<Library>
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter(Number.isInteger) : [],
      seen: Array.isArray(value.seen) ? value.seen.filter(Number.isInteger) : [],
      hidden: Array.isArray(value.hidden) ? value.hidden.filter(Number.isInteger) : [],
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveLibrary(library: Library, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(KEY, JSON.stringify(library))
}
