import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { loadLibrary, saveLibrary, type Library } from './library'

type Console = '3DS' | 'DSi' | 'DS'
type Category =
  | 'Aplicaciones y utilidades'
  | 'Emuladores'
  | 'Multimedia'
  | 'Personalización'
  | 'Herramientas para partidas guardadas'
  | 'Juegos homebrew'
  | 'Herramientas de desarrollo'
  | 'Otros proyectos interesantes'

type Project = {
  id: number
  name: string
  fullName: string
  owner: string
  description: string
  url: string
  homepage: string | null
  stars: number
  updatedAt: string
  createdAt: string
  pushedAt: string
  category: Category
  consoles: Console[]
  version: string | null
  releasePublishedAt: string | null
  releaseUrl: string | null
  score: number
  reasons: string[]
  labels: string[]
  language: string | null
  topics: string[]
}

type Feed = { generatedAt: string; projects: Project[] }
type View = 'radar' | 'recent' | 'favorites' | 'hidden'

function getCachedFeed(): Feed | null {
  try {
    const cached = localStorage.getItem('radar-feed-cache')
    if (!cached) return null
    const parsed: Feed = JSON.parse(cached)
    return Array.isArray(parsed.projects) ? parsed : null
  } catch {
    return null
  }
}

const categories: Category[] = [
  'Aplicaciones y utilidades',
  'Emuladores',
  'Multimedia',
  'Personalización',
  'Herramientas para partidas guardadas',
  'Juegos homebrew',
  'Herramientas de desarrollo',
  'Otros proyectos interesantes',
]

const consoleNames: Record<Console, string> = { '3DS': '3DS', DSi: 'DSi', DS: 'DS' }

function relativeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no verificada'
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  if (days < 365) return `Hace ${Math.floor(days / 30)} meses`
  return `Hace ${Math.floor(days / 365)} años`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'No verificado' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date)
}

function spanishSummary(project: Project) {
  const platformEvidence = project.consoles.length
    ? `Los metadatos de GitHub mencionan ${project.consoles.map((consoleName) => `Nintendo ${consoleName}`).join(', ')}.`
    : 'La consola compatible no está verificada.'
  return `Proyecto de ${project.category.toLocaleLowerCase('es')}. ${platformEvidence}`
}

function App() {
  const [feed, setFeed] = useState<Feed | null>(() => getCachedFeed())
  const [error, setError] = useState('')
  const [library, setLibrary] = useState<Library>(() => loadLibrary())
  const [view, setView] = useState<View>('radar')
  const [query, setQuery] = useState('')
  const [consoleFilter, setConsoleFilter] = useState('Todas')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [sort, setSort] = useState('score')
  const [selected, setSelected] = useState<Project | null>(null)

  useEffect(() => {
    let active = true
    fetch(`${import.meta.env.BASE_URL}data/projects.json`, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`El catálogo no está disponible (${response.status}).`)
        return response.json() as Promise<Feed>
      })
      .then((data) => {
        if (!Array.isArray(data.projects)) throw new Error('El catálogo recibido no tiene el formato esperado.')
        if (active) {
          setFeed(data)
          localStorage.setItem('radar-feed-cache', JSON.stringify(data))
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => saveLibrary(library), [library])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.getElementById('project-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const projects = useMemo(() => feed?.projects ?? [], [feed])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    let result = projects.filter((project) => {
      if (view !== 'hidden' && library.hidden.includes(project.id)) return false
      if (view === 'favorites' && !library.favorites.includes(project.id)) return false
      if (view === 'hidden') return library.hidden.includes(project.id)
      if (view === 'recent' && !project.labels.some((label) => ['Nuevo', 'Actualizado', 'Reactivado'].includes(label))) return false
      if (consoleFilter !== 'Todas' && !project.consoles.includes(consoleFilter as Console)) return false
      if (categoryFilter !== 'Todas' && project.category !== categoryFilter) return false
      if (term && !`${project.name} ${project.fullName} ${project.description} ${project.category} ${project.topics.join(' ')}`.toLocaleLowerCase('es').includes(term)) return false
      return true
    })
    result.sort((a, b) => sort === 'date' ? b.pushedAt.localeCompare(a.pushedAt) : sort === 'popular' ? b.stars - a.stars : b.score - a.score)
    return result
  }, [projects, library, view, query, consoleFilter, categoryFilter, sort])

  function toggleList(key: 'favorites' | 'hidden', id: number) {
    setLibrary((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id],
      ...(key === 'hidden' && !current.hidden.includes(id) ? { favorites: current.favorites.filter((item) => item !== id) } : {}),
    }))
  }

  function markSeen(id: number) {
    setLibrary((current) => current.seen.includes(id) ? current : { ...current, seen: [...current.seen, id] })
  }

  const nav: { id: View; label: string; icon: string }[] = [
    { id: 'radar', label: 'Radar', icon: '◉' },
    { id: 'recent', label: 'Descubrimientos recientes', icon: '✳' },
    { id: 'favorites', label: 'Mi biblioteca', icon: '♡' },
    { id: 'hidden', label: 'Ocultos', icon: '⊘' },
  ]

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#inicio" className="brand" onClick={() => setView('radar')} aria-label="Homebrew Radar, inicio">
          <span className="brand-mark"><span /></span>
          <span>homebrew<span className="brand-light">radar</span></span>
        </a>
        <nav className="topnav" aria-label="Navegación principal">
          {nav.map((item) => <button key={item.id} className={view === item.id ? 'nav-link active' : 'nav-link'} onClick={() => setView(item.id)}>{item.label}</button>)}
        </nav>
        <a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
      </header>

      <main id="inicio">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> RADAR ACTIVO <span className="eyebrow-divider">/</span> NINTENDO HANDHELD</div>
            <h1>Encuentra tu<br /><em>próximo descubrimiento.</em></h1>
            <p>Una selección viva de homebrew para tus consolas Nintendo. Proyectos reales, hallazgos inesperados.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => { setView('radar'); document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' }) }}>Explorar el radar <span>↓</span></button>
              <span className="updated-note"><span className="live-dot" /> {feed ? `Actualizado ${relativeDate(feed.generatedAt)}` : 'Preparando el radar'}</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="console-art"><div className="console-screen"><div className="screen-glow"><span>HB</span><i>RADAR</i></div></div><div className="console-hinge" /><div className="console-lower"><span className="dpad" /><span className="buttons"><i /><i /><i /><i /></span><span className="speaker" /></div></div>
            <div className="floating-chip chip-one">03 / DS</div><div className="floating-chip chip-two">SIGNAL FOUND <span>✦</span></div>
            <span className="spark spark-a">✳</span><span className="spark spark-b">✳</span>
          </div>
          <div className="hero-bottom"><span>HECHO PARA CURIOSOS</span><span>3DS <b>·</b> DSi <b>·</b> DS</span></div>
        </section>

        <section className="stats-strip" aria-label="Resumen del radar">
          <div><strong>{projects.length.toString().padStart(2, '0')}</strong><span>PROYECTOS EN EL RADAR</span></div>
          <div><strong>{projects.filter((project) => project.labels.includes('Nuevo')).length.toString().padStart(2, '0')}</strong><span>HALLAZGOS RECIENTES</span></div>
          <div><strong>{new Set(projects.map((project) => project.owner)).size.toString().padStart(2, '0')}</strong><span>CREADORES</span></div>
          <div className="stats-caption">Curado con datos públicos<br />de GitHub, no con humo.</div>
        </section>

        <section className="catalog-section" id="catalogo">
          <div className="section-heading">
            <div><div className="eyebrow section-eyebrow"><span className="pulse-dot" /> TU SEÑAL PERSONAL</div><h2>{view === 'recent' ? 'Descubrimientos recientes' : view === 'favorites' ? 'Tu biblioteca' : view === 'hidden' ? 'Proyectos ocultos' : 'El radar'}</h2><p>{view === 'favorites' ? 'Tus proyectos guardados en este dispositivo.' : view === 'recent' ? 'Nuevos proyectos y actividad detectada en la última recopilación.' : 'Una selección de proyectos para explorar más allá de lo conocido.'}</p></div>
            <span className="result-count">{filtered.length} {filtered.length === 1 ? 'PROYECTO' : 'PROYECTOS'} <i>↗</i></span>
          </div>

          <div className="filter-toolbar">
            <label className="search-box"><span>⌕</span><input id="project-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyectos, herramientas..." aria-label="Buscar proyectos" /><kbd>⌘ K</kbd></label>
            <div className="filter-group">
              <label className="sr-only" htmlFor="console-filter">Filtrar por consola</label>
              <select id="console-filter" value={consoleFilter} onChange={(event) => setConsoleFilter(event.target.value)}><option>Todas</option><option>3DS</option><option>DSi</option><option>DS</option></select>
              <label className="sr-only" htmlFor="category-filter">Filtrar por categoría</label>
              <select id="category-filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>Todas</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
              <label className="sr-only" htmlFor="sort-filter">Ordenar proyectos</label>
              <select id="sort-filter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">Relevancia</option><option value="date">Más recientes</option><option value="popular">Popularidad</option></select>
            </div>
          </div>

          {error && <div className="notice error-notice"><span>!</span><div><strong>No se pudo cargar el catálogo</strong><p>{error} Comprueba la conexión o vuelve más tarde.</p></div></div>}
          {!feed && !error && <div className="loading-state"><span className="loader" /> Afinando la señal del radar…</div>}
          {feed && filtered.length === 0 && <div className="empty-state"><span>⌕</span><h3>No hay proyectos en esta señal</h3><p>Prueba otra búsqueda o cambia los filtros.</p></div>}

          <div className="project-grid">
            {filtered.map((project, index) => {
              const isFavorite = library.favorites.includes(project.id)
              const isSeen = library.seen.includes(project.id)
              return <article className={`project-card ${isSeen ? 'is-seen' : ''}`} key={project.id} style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
                <div className="card-topline"><span className="category-label"><span className="category-mark">{project.category === 'Juegos homebrew' ? '◈' : project.category === 'Emuladores' ? '⌘' : project.category === 'Multimedia' ? '◉' : project.category === 'Herramientas de desarrollo' ? '⌬' : '✳'}</span>{project.category}</span><div className="card-actions"><button className={`hide-button ${view === 'hidden' ? 'restore-button' : ''}`} onClick={() => toggleList('hidden', project.id)} aria-label={view === 'hidden' ? 'Mostrar en el radar' : 'Ocultar proyecto'} title={view === 'hidden' ? 'Mostrar en el radar' : 'Ocultar proyecto'}>{view === 'hidden' ? '↶' : '⊘'}</button><button className={`favorite-button ${isFavorite ? 'favorited' : ''}`} onClick={() => toggleList('favorites', project.id)} aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={isFavorite}>{isFavorite ? '♥' : '♡'}</button></div></div>
                <div className="card-title-row"><h3>{project.name}</h3><span className="score-pill">{project.score}<small>/100</small></span></div>
                <p className="project-owner">{project.owner} <span>·</span> {project.language ?? 'Lenguaje no verificado'}</p>
                <p className="project-description">{spanishSummary(project)}</p>
                <div className="reason-line"><span>✦</span>{project.reasons[0] ?? 'Coincide con una búsqueda del ecosistema homebrew.'}</div>
                <div className="card-meta">
                  <div className="platform-tags">{project.consoles.length ? project.consoles.map((consoleName) => <span key={consoleName}>{consoleNames[consoleName]}</span>) : <span className="unverified-tag">Consola no verificada</span>}{project.labels.map((label) => <span className={`status-tag ${label === 'Nuevo' ? 'new-tag' : label === 'Poco conocido' ? 'niche-tag' : ''}`} key={label}>{label}</span>)}{isSeen && <span className="status-tag">Visto</span>}</div>
                  <div className="card-stats"><span>★ {project.stars.toLocaleString('es')}</span><span title={formatDate(project.pushedAt)}>↻ {relativeDate(project.pushedAt)}</span></div>
                </div>
                <div className="card-footer"><button className="details-link" onClick={() => { setSelected(project); markSeen(project.id) }}>Ver ficha <span>↗</span></button><a href={project.url} target="_blank" rel="noreferrer" onClick={() => markSeen(project.id)}>Repositorio <span>↗</span></a></div>
              </article>
            })}
          </div>
          {feed && <p className="catalog-footnote">Datos de GitHub · recopilación {formatDate(feed.generatedAt)} · puntuación explicable de 0 a 100</p>}
        </section>

        <footer className="site-footer"><a href="#inicio" className="footer-brand">homebrew<span>radar</span></a><span>Una pequeña revista para grandes curiosos.</span><span>Sin cuentas. Tus favoritos viven solo en este dispositivo.</span></footer>
      </main>

      {selected && <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setSelected(null)} aria-label="Cerrar ficha">×</button>
        <div className="eyebrow section-eyebrow"><span className="pulse-dot" /> FICHA DEL PROYECTO</div>
        <h2 id="modal-title">{selected.name}</h2><p className="modal-owner">{selected.owner} · {selected.category}</p>
        <p className="modal-description">{spanishSummary(selected)}</p>
        {selected.description && <div className="source-description"><span>DESCRIPCIÓN ORIGINAL DE GITHUB · PUEDE ESTAR EN OTRO IDIOMA</span><p>{selected.description}</p></div>}
        <div className="detail-grid"><div><span>CONSOLA</span><strong>{selected.consoles.length ? selected.consoles.join(', ') : 'No verificado'}</strong></div><div><span>ÚLTIMA ACTUALIZACIÓN</span><strong>{formatDate(selected.pushedAt)}</strong></div><div><span>VERSIÓN</span><strong>{selected.version ?? 'No verificado'}</strong></div><div><span>ESTRELLAS</span><strong>★ {selected.stars.toLocaleString('es')}</strong></div><div><span>PUNTUACIÓN</span><strong>{selected.score}/100</strong></div><div><span>DOCUMENTACIÓN</span><strong>{selected.reasons.some((reason) => reason.toLowerCase().includes('documentación')) ? 'README disponible' : 'No verificado'}</strong></div></div>
        <h3>Por qué podría interesarte</h3><ul className="reason-list">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <div className="modal-actions"><a className="primary-button" href={selected.url} target="_blank" rel="noreferrer">Abrir repositorio ↗</a>{selected.releaseUrl && <a className="secondary-button" href={selected.releaseUrl} target="_blank" rel="noreferrer">Ver última versión ↗</a>}</div>
      </section></div>}
    </div>
  )
}

export default App
