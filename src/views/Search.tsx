import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { PLATFORMS } from '../core/consoles.ts'
import { DOC_LANGUAGE_FILTER_LABEL, DOC_LANGUAGE_FILTERS, matchesDocLanguage, type DocLanguageFilter } from '../core/docLanguage.ts'
import { buildGithubQueries, describeInterpretation, interpretQuery, isEmptyInterpretation, platformsOf, type SortMode } from '../core/query.ts'
import { projectStatus } from '../core/scoring.ts'
import { rankSearch } from '../core/search.ts'
import { relativeDays } from '../core/text.ts'
import { Icon } from '../components/Icon.tsx'
import { ProjectCard, type CardActions } from '../components/ProjectCard.tsx'
import { SearchForm } from '../components/Section.tsx'
import { exampleQueries } from '../examples.ts'
import { formatDateTime, sortLabels } from '../explain.ts'
import { GithubError, searchGithub, type LiveSearch } from '../github.ts'
import type { Prefs } from '../library.ts'
import type { Feed, Project } from '../types.ts'

type Props = {
  feed: Feed | null
  visible: Project[]
  query: string
  channel: string
  prefs: Prefs
  savedQueries: string[]
  actions: CardActions
  onQuery: (query: string) => void
  onChannel: (channel: string) => void
  onPrefs: (prefs: Prefs) => void
  onSaveInterest: (query: string) => void
}

type LiveResult = { status: 'done' | 'error'; data: LiveSearch | null; error: string; key: string }

// El componente se monta de nuevo con cada búsqueda enviada (key={query} en App).
export function Search({ feed, visible, query, channel, prefs, savedQueries, actions, onQuery, onChannel, onPrefs, onSaveInterest }: Props) {
  const [draft, setDraft] = useState(query)
  const [consoleFilter, setConsoleFilter] = useState('Todas')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [hideInactive, setHideInactive] = useState(true)
  const [result, setResult] = useState<LiveResult | null>(null)
  const [pickedSort, setPickedSort] = useState<SortMode | null>(null)
  const deferredDraft = useDeferredValue(draft)

  const term = query || deferredDraft
  const interp = useMemo(() => interpretQuery(term), [term])
  const liveKey = `${query}|${prefs.includeArchived}`
  const live = query.trim()
    ? result?.key === liveKey ? result : { status: 'loading' as const, data: null, error: '', key: liveKey }
    : { status: 'idle' as const, data: null, error: '', key: '' }

  // Búsqueda en vivo en GitHub solo al enviar (ahorra el límite de 10 búsquedas/minuto).
  useEffect(() => {
    if (!query.trim()) return
    const controller = new AbortController()
    searchGithub(interpretQuery(query), { includeArchived: prefs.includeArchived, signal: controller.signal })
      .then((data) => setResult({ status: 'done', data, error: '', key: liveKey }))
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return
        setResult({ status: 'error', data: null, error: error instanceof GithubError ? error.message : 'No se pudo consultar GitHub.', key: liveKey })
      })
    return () => controller.abort()
  }, [query, prefs.includeArchived, liveKey])

  const liveData = live.data
  const liveProjects = useMemo(() => (liveData?.projects ?? []).filter((project) => !actions.isHidden(project.id)), [liveData, actions])
  // Orden: el que elija el usuario en esta búsqueda; si no, el que pide la consulta
  // («poco conocidos», «populares», «nuevos»…); si no, su preferencia guardada.
  const sort: SortMode = pickedSort ?? interp.sort ?? prefs.sort

  // Relevancia y orden con el motor común (src/core/search.ts), sin filtros de estado.
  const ranked = useMemo(() => rankSearch(visible, liveProjects, interp, { sort, includeArchived: prefs.includeArchived, hideInactive: false }), [visible, liveProjects, interp, sort, prefs.includeArchived])
  const localMatches = useMemo(() => ranked.filter((item) => item.project.source === 'catalog'), [ranked])

  const filtered = useMemo(() => ranked.filter(({ project }) => {
    if (channel !== 'todas' && !project.channels.includes(channel)) return false
    if (consoleFilter !== 'Todas' && !platformsOf(project).includes(consoleFilter)) return false
    if (categoryFilter !== 'Todas' && project.category !== categoryFilter) return false
    if (hideInactive && projectStatus(project).id === 'stale') return false
    if (!matchesDocLanguage(project.docLanguage, prefs.docLanguage)) return false
    return true
  }), [ranked, channel, consoleFilter, categoryFilter, hideInactive, prefs.docLanguage])
  // Resultados en vivo cuyo idioma no se puede saber sin el README (solo hay descripción).
  const liveUndetermined = prefs.docLanguage === 'all' || prefs.docLanguage === 'unknown' ? 0
    : ranked.filter(({ project }) => project.source === 'live' && project.docLanguage.lang === 'unknown').length

  const results = filtered.map((item) => item.project)
  const notes = useMemo(() => new Map(filtered.map((item) => [item.project.id, item.why[0]])), [filtered])
  const categories = useMemo(() => [...new Set(ranked.map(({ project }) => project.category))].sort((a, b) => a.localeCompare(b, 'es')), [ranked])
  const platforms = useMemo(() => PLATFORMS.filter((platform) => ranked.some(({ project }) => platformsOf(project).includes(platform.id))), [ranked])
  const hiddenByStatus = ranked.length - filtered.length
  const queries = query ? buildGithubQueries(interpretQuery(query), { includeArchived: prefs.includeArchived }) : null
  const usedQuery = live.data?.queryUsed ?? queries?.primary ?? ''
  const alreadySaved = savedQueries.some((item) => item.toLowerCase() === query.trim().toLowerCase())

  return (
    <section className="search-view" aria-labelledby="search-title">
      <h1 id="search-title" className="view-title">Buscar</h1>
      <SearchForm value={draft} onChange={setDraft} onSubmit={(value) => onQuery(value.trim())} compact />
      {!query && !draft && (
        <div className="example-chips" aria-label="Ejemplos de búsqueda">
          {exampleQueries.map((example) => <button key={example} className="chip" onClick={() => onQuery(example)}>{example}</button>)}
        </div>
      )}
      {!query && draft.trim() && <p className="hint">Filtrando el catálogo mientras escribes. Pulsa <strong>Buscar</strong> para consultar también GitHub en vivo.</p>}

      {query && (
        <div className="interpretation" aria-live="polite">
          <div className="interpretation-head">
            <div>
              <p className="eyebrow"><Icon name="info" size={13} /> Cómo se ha interpretado</p>
              <p className="interpretation-main">{describeInterpretation(interp)}</p>
            </div>
            <button className="ghost-button" onClick={() => onSaveInterest(query)} disabled={alreadySaved}>
              <Icon name={alreadySaved ? 'check' : 'bookmark'} size={16} />{alreadySaved ? 'Temática guardada' : 'Guardar temática'}
            </button>
          </div>
          {interp.notes.length > 0 && <ul className="interpretation-notes">{interp.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
          <p className="fine-print">
            Interpretación basada en reglas y palabras clave (no usa inteligencia artificial). Consulta enviada a GitHub: <code>{usedQuery}</code>
            {live.data && live.data.queriesTried.length > 1 && ' (se amplió porque la consulta exacta no daba resultados)'}
            {' · '}<a href={`https://github.com/search?type=repositories&q=${encodeURIComponent(usedQuery)}`} target="_blank" rel="noreferrer">ver en GitHub</a>
          </p>
        </div>
      )}

      <div className="filter-toolbar">
        <label><span>Temática</span>
          <select value={channel} onChange={(event) => onChannel(event.target.value)}>
            <option value="todas">Todas</option>
            {(feed?.topics ?? []).map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
          </select>
        </label>
        <label><span>Consola</span>
          <select value={consoleFilter} onChange={(event) => setConsoleFilter(event.target.value)}>
            <option value="Todas">Todas</option>
            {platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
          </select>
        </label>
        <label><span>Categoría</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option>Todas</option>{categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label><span>Idioma</span>
          <select value={prefs.docLanguage} onChange={(event) => onPrefs({ ...prefs, docLanguage: event.target.value as DocLanguageFilter })} aria-label="Idioma de la documentación">
            {DOC_LANGUAGE_FILTERS.map((value) => <option key={value} value={value}>{DOC_LANGUAGE_FILTER_LABEL[value]}</option>)}
          </select>
        </label>
        <label><span>Ordenar</span>
          <select value={sort} onChange={(event) => { const value = event.target.value as SortMode; setPickedSort(value); onPrefs({ ...prefs, sort: value }) }}>
            {(Object.keys(sortLabels) as SortMode[]).map((mode) => <option key={mode} value={mode}>{sortLabels[mode]}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={hideInactive} onChange={(event) => setHideInactive(event.target.checked)} /> Ocultar abandonados</label>
        <label className="check"><input type="checkbox" checked={prefs.includeArchived} onChange={(event) => onPrefs({ ...prefs, includeArchived: event.target.checked })} /> Incluir archivados</label>
      </div>

      <div className="sources" aria-live="polite">
        <span><Icon name="library" size={14} /> Catálogo del radar: {localMatches.length} {localMatches.length === 1 ? 'coincidencia' : 'coincidencias'}{feed ? ` · actualizado ${relativeDays(feed.generatedAt)}` : ''}</span>
        {query && <span><Icon name="wifi" size={14} /> GitHub en vivo: {
          live.status === 'loading' ? 'consultando…'
            : live.status === 'error' ? 'no disponible'
              : live.data ? `${live.data.projects.length} de ${live.data.total.toLocaleString('es')} resultados · ${live.data.fromCache ? 'desde caché, ' : ''}${formatDateTime(live.data.fetchedAt)}${live.data.filteredOut ? ` · ${live.data.filteredOut} descartados por ser organizaciones` : ''}` : '—'
        }</span>}
        {hiddenByStatus > 0 && <span>{hiddenByStatus} ocultos por los filtros</span>}
      </div>
      {prefs.docLanguage !== 'all' && <p className="hint">El idioma es el de la documentación original (README y descripción), no el del resumen en español.</p>}
      {liveUndetermined > 0 && (
        <p className="hint"><Icon name="info" size={14} /> {liveUndetermined} {liveUndetermined === 1 ? 'resultado en vivo queda fuera' : 'resultados en vivo quedan fuera'} del filtro de idioma: GitHub solo da su descripción y es demasiado corta para saber el idioma.
          Elige «Idioma no determinado» para verlos; al abrir su ficha se lee el README y se comprueba.</p>
      )}

      {live.status === 'error' && <div className="notice"><Icon name="info" size={18} /><div><strong>La búsqueda en vivo no está disponible</strong><p>{live.error} Se muestran solo coincidencias del catálogo.</p></div></div>}
      {query && isEmptyInterpretation(interp) && <p className="hint">No se reconocieron temas concretos: se muestran herramientas y utilidades activas en general.</p>}

      {live.status === 'loading' && results.length === 0 && <div className="loading-state"><span className="loader" /> Buscando en GitHub…</div>}
      {results.length === 0 && live.status !== 'loading' && (term.trim() || channel !== 'todas') && (
        <div className="empty-state">
          <Icon name="search" size={28} />
          <h3>No hay resultados con estos criterios</h3>
          <p>Prueba con menos palabras, en inglés o con un nombre concreto. También puedes quitar filtros{prefs.docLanguage !== 'all' ? ', elegir «Todos los idiomas»' : ''}{hideInactive ? ' o mostrar los abandonados' : ''}.</p>
          {query && <a className="secondary-button" href={`https://github.com/search?type=repositories&q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">Buscar «{query}» directamente en GitHub <Icon name="external" size={15} /></a>}
        </div>
      )}

      <div className="project-grid">
        {results.map((project) => <ProjectCard key={project.id} project={project} actions={actions} note={term.trim() ? notes.get(project.id) : undefined} highlight={sort === 'gems' ? 'gem' : undefined} />)}
      </div>
    </section>
  )
}
