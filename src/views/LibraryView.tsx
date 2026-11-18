import { useRef, useState } from 'react'
import { interpretQuery } from '../core/query.ts'
import { relativeDays } from '../core/text.ts'
import { Icon } from '../components/Icon.tsx'
import { ProjectCard, type CardActions } from '../components/ProjectCard.tsx'
import { exportLibrary, importLibrary, type Library } from '../library.ts'
import type { Feed, Project } from '../types.ts'

type Tab = 'favorites' | 'history' | 'interests' | 'hidden'

type Props = {
  feed: Feed | null
  library: Library
  resolve: (id: number) => Project | null
  actions: CardActions
  onLibrary: (library: Library) => void
  onAddInterest: (query: string) => void
  onRemoveInterest: (id: string) => void
  onSearch: (query: string) => void
  notify: (message: string) => void
}

const presets = ['Nintendo 3DS', 'Inteligencia artificial', 'Software para Windows', 'Emuladores', 'Automatización', 'Herramientas curiosas']

export function LibraryView({ feed, library, resolve, actions, onLibrary, onAddInterest, onRemoveInterest, onSearch, notify }: Props) {
  const [tab, setTab] = useState<Tab>('favorites')
  const [draft, setDraft] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const repo = __REPOSITORY__

  const list = (ids: number[]) => ids.map(resolve).filter((project): project is Project => project !== null)
  const favorites = list([...library.favorites].reverse())
  const history = library.history.map((entry) => ({ entry, project: resolve(entry.id) })).filter((item): item is { entry: typeof item.entry; project: Project } => item.project !== null)
  const hidden = list(library.hidden)
  const missing = library.favorites.length - favorites.length

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'favorites', label: 'Favoritos', count: library.favorites.length },
    { id: 'history', label: 'Historial', count: history.length },
    { id: 'interests', label: 'Temáticas', count: library.interests.length },
    { id: 'hidden', label: 'Ocultos', count: library.hidden.length },
  ]

  function tracking(query: string) {
    const interp = interpretQuery(query)
    const channels = interp.concepts.map((concept) => concept.channel).filter(Boolean)
    const topic = feed?.topics.find((item) => channels.includes(item.id))
    return topic ? `Seguimiento automático: incluida en «${topic.label}» (se actualiza cada 12 h).` : 'Sin seguimiento automático: se busca en GitHub en vivo al abrirla.'
  }

  function download() {
    const blob = new Blob([exportLibrary(library)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `radar-biblioteca-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function upload(file: File) {
    try {
      onLibrary(importLibrary(library, await file.text()))
      notify('Biblioteca importada y combinada con la de este dispositivo.')
    } catch {
      notify('El archivo no es una copia válida de la biblioteca.')
    }
  }

  const snippet = (query: string) => JSON.stringify({ id: query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: query, description: `Temática propuesta desde la app: ${query}.`, queries: ['escribe-aquí-la-búsqueda-de-github'] }, null, 2)

  return (
    <section className="library-view" aria-labelledby="library-title">
      <h1 id="library-title" className="view-title">Mi biblioteca</h1>
      <p className="view-lead">Se guarda solo en este navegador. No hay cuentas ni sincronización automática entre dispositivos; puedes llevarla a otro con una copia manual.</p>

      <div className="segmented" role="tablist" aria-label="Secciones de la biblioteca">
        {tabs.map((item) => (
          <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label} <small>{item.count}</small>
          </button>
        ))}
      </div>

      {tab === 'favorites' && (
        <>
          {missing > 0 && <p className="hint">{missing === 1 ? '1 favorito antiguo ya no está' : `${missing} favoritos antiguos ya no están`} en el catálogo y no tiene copia guardada; se conserva en tu lista y volverá a mostrarse si reaparece.</p>}
          {favorites.length ? <div className="project-grid">{favorites.map((project) => <ProjectCard key={project.id} project={project} actions={actions} />)}</div>
            : <div className="empty-state"><Icon name="heart" size={28} /><h3>Aún no tienes favoritos</h3><p>Pulsa el corazón de cualquier tarjeta para guardarla aquí.</p></div>}
        </>
      )}

      {tab === 'history' && (
        history.length ? <div className="project-grid">{history.map(({ entry, project }) => <ProjectCard key={project.id} project={project} actions={actions} note={entry.at ? `Visto ${relativeDays(entry.at)}.` : 'Visto en una versión anterior de la app.'} />)}</div>
          : <div className="empty-state"><Icon name="clock" size={28} /><h3>Sin historial</h3><p>Los proyectos cuya ficha abras aparecerán aquí.</p></div>
      )}

      {tab === 'hidden' && (
        hidden.length ? <div className="project-grid">{hidden.map((project) => <ProjectCard key={project.id} project={project} actions={actions} />)}</div>
          : <div className="empty-state"><Icon name="hide" size={28} /><h3>No has ocultado nada</h3><p>Lo que ocultes desaparece del radar y puedes recuperarlo aquí.</p></div>
      )}

      {tab === 'interests' && (
        <div className="interests">
          <form className="interest-form" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { onAddInterest(draft.trim()); setDraft('') } }}>
            <label htmlFor="interest-input">Nueva temática (cualquier tema o búsqueda)</label>
            <div>
              <input id="interest-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ej.: herramientas para fotografía" />
              <button className="primary-button" type="submit"><Icon name="plus" size={16} />Añadir</button>
            </div>
          </form>
          <div className="example-chips">
            {presets.filter((preset) => !library.interests.some((item) => item.query.toLowerCase() === preset.toLowerCase())).map((preset) => (
              <button key={preset} className="chip" onClick={() => onAddInterest(preset)}><Icon name="plus" size={13} />{preset}</button>
            ))}
          </div>
          {library.interests.length === 0 && <p className="hint">Tus temáticas personalizan la sección «Para ti» de la portada.</p>}
          <ul className="interest-list">
            {library.interests.map((interest) => (
              <li key={interest.id}>
                <div>
                  <strong>{interest.label}</strong>
                  <span>{tracking(interest.query)}</span>
                </div>
                <div className="interest-actions">
                  <button className="ghost-button" onClick={() => onSearch(interest.query)}><Icon name="search" size={15} />Explorar</button>
                  <button className="icon-button" onClick={() => onRemoveInterest(interest.id)} aria-label={`Quitar la temática ${interest.label}`}><Icon name="trash" size={17} /></button>
                </div>
              </li>
            ))}
          </ul>
          <details className="explainer">
            <summary>¿Cómo funciona el seguimiento automático?</summary>
            <p>GitHub Actions recopila cada 12 horas las temáticas públicas definidas en <code>config/topics.json</code> del repositorio. Tus temáticas guardadas aquí viven solo en tu navegador y GitHub Actions no puede leerlas, así que no se siguen en segundo plano: se consultan en vivo cuando las abres.</p>
            <p>Para que una temática se recopile automáticamente, añádela a ese archivo. Al guardar el cambio en la rama principal, el workflow recopila datos y publica la web.</p>
            {repo && <a className="secondary-button" href={`https://github.com/${repo}/edit/main/config/topics.json`} target="_blank" rel="noreferrer">Editar config/topics.json en GitHub <Icon name="external" size={15} /></a>}
            {library.interests[0] && <><p>Plantilla para tu primera temática (sustituye la búsqueda por términos de GitHub, por ejemplo <code>topic:photography</code>):</p><pre><code>{snippet(library.interests[0].query)}</code></pre></>}
          </details>
        </div>
      )}

      <div className="backup-box">
        <div><strong>Copia de seguridad manual</strong><p>Exporta favoritos, historial, ocultos y temáticas a un archivo, e impórtalo en otro dispositivo. Importar combina los datos, no borra nada.</p></div>
        <div className="backup-actions">
          <button className="ghost-button" onClick={download}><Icon name="download" size={16} />Exportar</button>
          <button className="ghost-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16} />Importar</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} />
        </div>
      </div>
    </section>
  )
}
