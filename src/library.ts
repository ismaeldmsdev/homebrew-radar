// Biblioteca personal guardada solo en este navegador (localStorage).
// Formato v2: conserva la misma clave y los campos v1 (favorites, seen, hidden)
// para que una versión anterior de la web siga leyendo los favoritos.
import type { SortMode } from './core/query.ts'
import { normalizeProject } from './core/feed.ts'
import type { Project } from './types.ts'

export type Interest = { id: string; label: string; query: string; createdAt: string; lastCheckedAt: string | null }
export type HistoryEntry = { id: number; at: string | null }
export type Prefs = { sort: SortMode; includeArchived: boolean }

export type Library = {
  version: 2
  favorites: number[]
  seen: number[]
  hidden: number[]
  history: HistoryEntry[]
  /** Copia de los proyectos guardados que pueden no estar en el catálogo (p. ej. búsquedas en vivo). */
  snapshots: Record<string, Project>
  interests: Interest[]
  prefs: Prefs
}

export const LIBRARY_KEY = 'homebrew-radar-library'
export const HISTORY_LIMIT = 100
const sorts: SortMode[] = ['interest', 'gems', 'recent', 'stars', 'new']

export function emptyLibrary(): Library {
  return { version: 2, favorites: [], seen: [], hidden: [], history: [], snapshots: {}, interests: [], prefs: { sort: 'interest', includeArchived: false } }
}

function ids(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter(Number.isInteger) as number[])] : []
}

export function parseLibrary(raw: unknown): Library {
  if (!raw || typeof raw !== 'object') return emptyLibrary()
  const value = raw as Record<string, unknown>
  const library = emptyLibrary()
  library.favorites = ids(value.favorites)
  library.seen = ids(value.seen)
  library.hidden = ids(value.hidden)

  if (Array.isArray(value.history)) {
    library.history = value.history
      .filter((entry): entry is HistoryEntry => Boolean(entry) && typeof entry === 'object' && Number.isInteger((entry as HistoryEntry).id))
      .map((entry) => ({ id: entry.id, at: typeof entry.at === 'string' ? entry.at : null }))
      .slice(0, HISTORY_LIMIT)
  } else {
    // Migración desde v1: «seen» solo guardaba identificadores en orden de visita.
    library.history = [...library.seen].reverse().slice(0, HISTORY_LIMIT).map((id) => ({ id, at: null }))
  }

  if (value.snapshots && typeof value.snapshots === 'object') {
    for (const [key, item] of Object.entries(value.snapshots as Record<string, unknown>)) {
      const project = normalizeProject(item)
      if (project && String(project.id) === key) library.snapshots[key] = project
    }
  }

  if (Array.isArray(value.interests)) {
    library.interests = value.interests
      .filter((item): item is Interest => Boolean(item) && typeof item === 'object' && typeof (item as Interest).query === 'string' && typeof (item as Interest).id === 'string')
      .map((item) => ({
        id: item.id, query: item.query, label: typeof item.label === 'string' && item.label ? item.label : item.query,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        lastCheckedAt: typeof item.lastCheckedAt === 'string' ? item.lastCheckedAt : null,
      }))
  }

  if (value.prefs && typeof value.prefs === 'object') {
    const prefs = value.prefs as Partial<Prefs>
    if (prefs.sort && sorts.includes(prefs.sort)) library.prefs.sort = prefs.sort
    if (typeof prefs.includeArchived === 'boolean') library.prefs.includeArchived = prefs.includeArchived
  }
  return library
}

export function loadLibrary(storage: Pick<Storage, 'getItem'> = localStorage): Library {
  try {
    const raw = storage.getItem(LIBRARY_KEY)
    return raw ? parseLibrary(JSON.parse(raw)) : emptyLibrary()
  } catch {
    return emptyLibrary()
  }
}

/** Elimina copias que ya no se usan para no llenar el almacenamiento. */
export function pruneSnapshots(library: Library): Library {
  const keep = new Set([...library.favorites, ...library.hidden, ...library.history.map((entry) => entry.id)].map(String))
  const snapshots = Object.fromEntries(Object.entries(library.snapshots).filter(([key]) => keep.has(key)))
  return { ...library, snapshots }
}

export function saveLibrary(library: Library, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify(pruneSnapshots(library)))
    return true
  } catch {
    return false
  }
}

function withSnapshot(library: Library, project: Project) {
  return { ...library.snapshots, [String(project.id)]: project }
}

export function toggleFavorite(library: Library, project: Project): Library {
  const active = library.favorites.includes(project.id)
  return {
    ...library,
    favorites: active ? library.favorites.filter((id) => id !== project.id) : [...library.favorites, project.id],
    hidden: library.hidden.filter((id) => id !== project.id),
    snapshots: withSnapshot(library, project),
  }
}

export function toggleHidden(library: Library, project: Project): Library {
  const active = library.hidden.includes(project.id)
  return {
    ...library,
    hidden: active ? library.hidden.filter((id) => id !== project.id) : [...library.hidden, project.id],
    favorites: active ? library.favorites : library.favorites.filter((id) => id !== project.id),
    snapshots: withSnapshot(library, project),
  }
}

export function markSeen(library: Library, project: Project, now = new Date().toISOString()): Library {
  const history = [{ id: project.id, at: now }, ...library.history.filter((entry) => entry.id !== project.id)].slice(0, HISTORY_LIMIT)
  return {
    ...library,
    seen: library.seen.includes(project.id) ? library.seen : [...library.seen, project.id],
    history,
    snapshots: withSnapshot(library, project),
  }
}

export function addInterest(library: Library, query: string, label = query, now = new Date().toISOString()): Library {
  const clean = query.trim()
  if (!clean || library.interests.some((item) => item.query.toLowerCase() === clean.toLowerCase())) return library
  const id = `i-${Date.parse(now).toString(36)}-${library.interests.length}`
  return { ...library, interests: [...library.interests, { id, label: label.trim() || clean, query: clean, createdAt: now, lastCheckedAt: null }] }
}

export function removeInterest(library: Library, id: string): Library {
  return { ...library, interests: library.interests.filter((item) => item.id !== id) }
}

/** Exportación manual: la única forma de llevar la biblioteca a otro dispositivo. */
export function exportLibrary(library: Library) {
  return JSON.stringify({ app: 'radar', exportedAt: new Date().toISOString(), library: pruneSnapshots(library) }, null, 2)
}

/** Importa y combina sin borrar nada de lo que ya hay en este dispositivo. */
export function importLibrary(current: Library, text: string): Library {
  const data: unknown = JSON.parse(text)
  const incoming = parseLibrary(data && typeof data === 'object' && 'library' in data ? (data as { library: unknown }).library : data)
  const union = (a: number[], b: number[]) => [...new Set([...a, ...b])]
  const merged = { ...current }
  merged.favorites = union(current.favorites, incoming.favorites)
  merged.hidden = union(current.hidden, incoming.hidden).filter((id) => !merged.favorites.includes(id))
  merged.seen = union(current.seen, incoming.seen)
  const history = new Map<number, HistoryEntry>()
  for (const entry of [...current.history, ...incoming.history]) if (!history.has(entry.id)) history.set(entry.id, entry)
  merged.history = [...history.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, HISTORY_LIMIT)
  merged.snapshots = { ...incoming.snapshots, ...current.snapshots }
  let interests = current
  for (const interest of incoming.interests) interests = addInterest(interests, interest.query, interest.label)
  merged.interests = interests.interests
  return merged
}
