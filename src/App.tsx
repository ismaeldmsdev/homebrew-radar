import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { normalizeFeed } from './core/feed.ts'
import { Icon, type IconName } from './components/Icon.tsx'
import type { CardActions } from './components/ProjectCard.tsx'
import { ProjectSheet } from './components/ProjectSheet.tsx'
import { formatDateTime } from './explain.ts'
import { addInterest, loadLibrary, markSeen, removeInterest, saveLibrary, toggleFavorite, toggleHidden, type Library } from './library.ts'
import type { Feed, Project } from './types.ts'
import { useOnline, useUpdateCheck } from './update.ts'
import { Discover } from './views/Discover.tsx'
import { LibraryView } from './views/LibraryView.tsx'
import { Search } from './views/Search.tsx'
import { Settings } from './views/Settings.tsx'

type View = 'discover' | 'search' | 'library' | 'settings'
type Route = { view: View; query: string; channel: string }

const FEED_CACHE = 'radar-feed-cache'
const slugs: Record<View, string> = { discover: 'descubrir', search: 'buscar', library: 'biblioteca', settings: 'ajustes' }

function parseRoute(hash = window.location.hash): Route {
  const [path, search = ''] = hash.replace(/^#\/?/, '').split('?')
  const view = (Object.keys(slugs) as View[]).find((key) => slugs[key] === path) ?? 'discover'
  const params = new URLSearchParams(search)
  return { view, query: params.get('q') ?? '', channel: params.get('t') ?? 'todas' }
}

function routeHash(route: Route) {
  const params = new URLSearchParams()
  if (route.view === 'search' && route.query) params.set('q', route.query)
  if (route.view === 'search' && route.channel !== 'todas') params.set('t', route.channel)
  const search = params.toString()
  return `#/${slugs[route.view]}${search ? `?${search}` : ''}`
}

function getCachedFeed(): Feed | null {
  try {
    const cached = localStorage.getItem(FEED_CACHE)
    return cached ? normalizeFeed(JSON.parse(cached)) : null
  } catch {
    return null
  }
}

function App() {
  const [feed, setFeed] = useState<Feed | null>(() => getCachedFeed())
  const [feedError, setFeedError] = useState('')
  const [library, setLibrary] = useState<Library>(() => loadLibrary())
  const [route, setRoute] = useState<Route>(() => parseRoute())
  const [selected, setSelected] = useState<Project | null>(null)
  const [toast, setToast] = useState('')
  const online = useOnline()
  const update = useUpdateCheck()

  useEffect(() => {
    let active = true
    fetch(`${import.meta.env.BASE_URL}data/projects.json`, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`El catálogo no está disponible (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((data) => {
        const normalized = normalizeFeed(data)
        if (!normalized) throw new Error('El catálogo recibido no tiene el formato esperado.')
        if (!active) return
        setFeed(normalized)
        setFeedError('')
        try { localStorage.setItem(FEED_CACHE, JSON.stringify(data)) } catch { /* la caché es opcional */ }
      })
      .catch((cause: unknown) => {
        if (active) setFeedError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => { saveLibrary(library) }, [library])

  useEffect(() => {
    // Atrás/adelante del navegador: cambia de vista y cierra la ficha abierta.
    const onHash = () => { setRoute(parseRoute()); setSelected(null) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const navigate = useCallback((next: Partial<Route>) => {
    const target = { ...parseRoute(), ...next }
    const hash = routeHash(target)
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(target)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (parseRoute().view !== 'search') navigate({ view: 'search' })
        window.setTimeout(() => document.getElementById('search-compact')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const catalog = useMemo(() => new Map((feed?.projects ?? []).map((project) => [project.id, project])), [feed])
  const visible = useMemo(() => (feed?.projects ?? []).filter((project) => !library.hidden.includes(project.id)), [feed, library.hidden])
  const resolve = useCallback((id: number) => catalog.get(id) ?? library.snapshots[String(id)] ?? null, [catalog, library.snapshots])
  const favorites = useMemo(() => library.favorites.map(resolve).filter((project): project is Project => project !== null), [library.favorites, resolve])

  const actions: CardActions = useMemo(() => ({
    isFavorite: (id) => library.favorites.includes(id),
    isHidden: (id) => library.hidden.includes(id),
    isSeen: (id) => library.seen.includes(id),
    onOpen: (project) => { setSelected(project); setLibrary((current) => markSeen(current, project)) },
    onFavorite: (project) => {
      const adding = !library.favorites.includes(project.id)
      setLibrary((current) => toggleFavorite(current, project))
      setToast(adding ? `«${project.name}» guardado en favoritos.` : `«${project.name}» quitado de favoritos.`)
    },
    onHide: (project) => {
      const hiding = !library.hidden.includes(project.id)
      setLibrary((current) => toggleHidden(current, project))
      setToast(hiding ? `«${project.name}» oculto. Puedes recuperarlo en Biblioteca → Ocultos.` : `«${project.name}» vuelve a mostrarse.`)
    },
  }), [library.favorites, library.hidden, library.seen])

  const onEnriched = useCallback((project: Project) => {
    setSelected((current) => current?.id === project.id ? project : current)
    setLibrary((current) => String(project.id) in current.snapshots ? { ...current, snapshots: { ...current.snapshots, [String(project.id)]: project } } : current)
  }, [])

  const closeSheet = useCallback(() => setSelected(null), [])

  const saveInterest = (query: string) => {
    setLibrary((current) => addInterest(current, query))
    setToast(`Temática «${query}» guardada. Aparecerá en «Para ti».`)
  }

  const feedNote = feedError && feed ? `No se pudo descargar el catálogo actualizado (${feedError}). Se muestra la copia guardada del ${formatDateTime(feed.generatedAt)}.` : ''
  const nav: { id: View; label: string; icon: IconName }[] = [
    { id: 'discover', label: 'Descubrir', icon: 'compass' },
    { id: 'search', label: 'Buscar', icon: 'search' },
    { id: 'library', label: 'Biblioteca', icon: 'library' },
    { id: 'settings', label: 'Ajustes', icon: 'settings' },
  ]

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <a href="#/descubrir" className="brand" onClick={(event) => { event.preventDefault(); navigate({ view: 'discover' }) }} aria-label="Radar, inicio">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>radar<span className="brand-light">descubrimientos</span></span>
        </a>
        <nav className="tabbar" aria-label="Navegación principal">
          {nav.map((item) => (
            <button key={item.id} className={route.view === item.id ? 'tab active' : 'tab'} aria-current={route.view === item.id ? 'page' : undefined} onClick={() => navigate({ view: item.id, ...(item.id === 'search' ? { query: '', channel: 'todas' } : {}) })}>
              <Icon name={item.icon} size={22} /><span>{item.label}</span>
              {item.id === 'library' && library.favorites.length > 0 && <small className="badge">{library.favorites.length}</small>}
            </button>
          ))}
        </nav>
      </header>

      {!online && <div className="offline-bar" role="status"><Icon name="wifi" size={15} /> Sin conexión: se muestra la última copia guardada. La búsqueda en vivo no está disponible.</div>}
      {(update.state === 'available' || update.state === 'pending') && (
        <div className="update-banner" role="status">
          <Icon name="refresh" size={18} />
          <span>{update.state === 'available' ? 'Hay una versión nueva de la app.' : 'La versión nueva aún se está publicando. Prueba de nuevo en unos minutos.'}</span>
          <button className="primary-button" onClick={update.apply}>Recargar</button>
        </div>
      )}

      <main id="contenido">
        {feedError && !feed && <div className="notice"><Icon name="info" size={18} /><div><strong>No se pudo cargar el catálogo</strong><p>{feedError} Comprueba la conexión o vuelve más tarde. La búsqueda en vivo puede seguir funcionando.</p></div></div>}
        {feedNote && route.view === 'discover' && <div className="notice soft"><Icon name="info" size={18} /><p>{feedNote}</p></div>}

        {route.view === 'discover' && (
          <Discover feed={feed} visible={visible} library={library} favorites={favorites} actions={actions}
            onSearch={(query) => navigate({ view: 'search', query, channel: 'todas' })}
            onChannel={(channel) => navigate({ view: 'search', query: '', channel })}
            onGoLibrary={() => navigate({ view: 'library' })} />
        )}
        {route.view === 'search' && (
          <Search key={route.query} feed={feed} visible={visible} query={route.query} channel={route.channel} prefs={library.prefs}
            savedQueries={library.interests.map((item) => item.query)} actions={actions}
            onQuery={(query) => navigate({ view: 'search', query })}
            onChannel={(channel) => navigate({ view: 'search', channel })}
            onPrefs={(prefs) => setLibrary((current) => ({ ...current, prefs }))}
            onSaveInterest={saveInterest} />
        )}
        {route.view === 'library' && (
          <LibraryView feed={feed} library={library} resolve={resolve} actions={actions} onLibrary={setLibrary}
            onAddInterest={saveInterest} onRemoveInterest={(id) => setLibrary((current) => removeInterest(current, id))}
            onSearch={(query) => navigate({ view: 'search', query, channel: 'todas' })} notify={setToast} />
        )}
        {route.view === 'settings' && <Settings feed={feed} feedNote={feedNote} online={online} update={update} notify={setToast} />}

        <footer className="site-footer">
          <span className="footer-brand">radar<span>descubrimientos</span></span>
          <span>Datos públicos de GitHub. Las puntuaciones son orientativas, no garantías de calidad o seguridad.</span>
          <span>Sin cuentas: tu biblioteca vive solo en este dispositivo.</span>
        </footer>
      </main>

      {selected && (
        <ProjectSheet project={selected} topics={feed?.topics ?? []} isFavorite={library.favorites.includes(selected.id)} isHidden={library.hidden.includes(selected.id)}
          onClose={closeSheet} onFavorite={actions.onFavorite} onHide={actions.onHide} onUpdate={onEnriched} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

export default App
