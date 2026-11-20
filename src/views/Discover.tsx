import { useMemo, useState } from 'react'
import { consoleSections } from '../core/consoleRadar.ts'
import { pickFeatured, pickGems, pickNews, recommend } from '../core/feed.ts'
import { interpretQuery } from '../core/query.ts'
import { Icon } from '../components/Icon.tsx'
import { ProjectCard, type CardActions } from '../components/ProjectCard.tsx'
import { SearchForm, Section } from '../components/Section.tsx'
import { exampleQueries } from '../examples.ts'
import type { Library } from '../library.ts'
import { formatDateTime } from '../explain.ts'
import { relativeDays } from '../core/text.ts'
import type { Feed, Project } from '../types.ts'

type Props = {
  feed: Feed | null
  visible: Project[]
  library: Library
  favorites: Project[]
  actions: CardActions
  onSearch: (query: string) => void
  onChannel: (channel: string) => void
  onGoLibrary: () => void
  onGoConsoles: () => void
}

export function Discover({ feed, visible, library, favorites, actions, onSearch, onChannel, onGoLibrary, onGoConsoles }: Props) {
  const [draft, setDraft] = useState('')
  const gems = useMemo(() => pickGems(visible), [visible])
  // Las joyas tienen su propia sección: no se repiten en destacados.
  const featured = useMemo(() => {
    const gemIds = new Set(gems.map((project) => project.id))
    return pickFeatured(visible.filter((project) => !gemIds.has(project.id)))
  }, [visible, gems])
  // Lo ya mostrado en destacados y joyas no se repite en las secciones siguientes.
  const shown = useMemo(() => new Set([...gems, ...featured].map((project) => project.id)), [gems, featured])
  const consolePicks = useMemo(() => consoleSections(visible.filter((project) => !shown.has(project.id)), undefined, 6).featured, [visible, shown])
  const news = useMemo(() => pickNews(visible.filter((project) => !shown.has(project.id))), [visible, shown])
  const forYou = useMemo(() => recommend(
    visible,
    library.interests.map((interest) => ({ label: interest.label, interp: interpretQuery(interest.query) })),
    favorites,
    new Set([...library.favorites, ...library.hidden]),
  ), [visible, library.interests, library.favorites, library.hidden, favorites])
  const topics = feed?.topics ?? []

  return (
    <>
      <section className="hero">
        <p className="eyebrow"><span className="pulse-dot" /> Radar de descubrimiento · datos públicos de GitHub</p>
        <h1>Descubre herramientas y proyectos <em>que probablemente no conocías.</em></h1>
        <p className="hero-lead">Describe lo que buscas con tus palabras. El radar busca en GitHub en tiempo real y en su propio catálogo, y te explica por qué cada proyecto podría interesarte.</p>
        <SearchForm value={draft} onChange={setDraft} onSubmit={(value) => onSearch(value)} />
        <div className="example-chips" aria-label="Ejemplos de búsqueda">
          {exampleQueries.slice(0, 5).map((query) => <button key={query} className="chip" onClick={() => onSearch(query)}>{query}</button>)}
        </div>
        {feed && <p className="hero-meta"><span className="live-dot" /> Catálogo actualizado {relativeDays(feed.generatedAt)} ({formatDateTime(feed.generatedAt)}) · {visible.length} proyectos en {topics.length} {topics.length === 1 ? 'temática' : 'temáticas'}</p>}
      </section>

      {topics.length > 0 && (
        <nav className="topic-strip" aria-label="Temáticas del radar">
          {[...topics].sort((a, b) => Number(b.featured) - Number(a.featured)).map((topic) => (
            <button key={topic.id} className={`topic-chip${topic.featured ? ' featured' : ''}`} onClick={() => onChannel(topic.id)}>
              {topic.featured && <Icon name="star" size={13} filled />}{topic.label}<small>{topic.count}</small>
            </button>
          ))}
        </nav>
      )}

      {!feed && <div className="loading-state"><span className="loader" /> Cargando el catálogo…</div>}

      {featured.length > 0 && (
        <Section id="featured" icon="spark" title="Descubrimientos destacados" subtitle="Lo mejor puntuado de cada temática: actividad, documentación, versiones y relevancia.">
          {featured.map((project) => <ProjectCard key={project.id} project={project} actions={actions} />)}
        </Section>
      )}

      <Section id="gems" icon="gem" title="Joyas ocultas" subtitle="Pocas estrellas, pero con documentación o versiones publicadas y actividad reciente. Cada tarjeta explica por qué.">
        {gems.length
          ? gems.map((project) => <ProjectCard key={project.id} project={project} actions={actions} highlight="gem" />)
          : <p className="empty-inline">Ningún proyecto del catálogo cumple ahora mismo los criterios de joya oculta.</p>}
      </Section>

      {consolePicks.length > 0 && (
        <Section id="consoles-preview" icon="gamepad" title="Radar de Consolas" subtitle="Homebrew, CFW, emuladores y utilidades para consolas: lo más interesante del radar dedicado."
          action={<button className="text-button" onClick={onGoConsoles}>Abrir el radar <Icon name="arrow" size={15} /></button>}>
          {consolePicks.map((project) => <ProjectCard key={project.id} project={project} actions={actions} />)}
        </Section>
      )}

      <Section id="news" icon="news" title="Proyectos recientes" subtitle="Proyectos nuevos, versiones recién publicadas y actividad detectada desde la recopilación anterior.">
        {news.length
          ? news.map((project) => <ProjectCard key={project.id} project={project} actions={actions} highlight="news" note={newsNote(project)} />)
          : <p className="empty-inline">No se detectaron novedades en la última recopilación.</p>}
      </Section>

      <Section
        id="for-you" icon="heart" title="Recomendado para ti"
        subtitle={library.interests.length ? `Según tus temáticas guardadas (${library.interests.map((item) => item.label).join(', ')}) y tus favoritos.` : 'Guarda temáticas o favoritos y aquí aparecerán recomendaciones relacionadas.'}
        action={<button className="text-button" onClick={onGoLibrary}>Mis temáticas <Icon name="arrow" size={15} /></button>}
      >
        {forYou.length
          ? forYou.map(({ project, reason }) => <ProjectCard key={project.id} project={project} actions={actions} note={reason} />)
          : <div className="empty-inline">
              <p>{library.interests.length ? 'Aún no hay coincidencias en el catálogo con tus temáticas. Pulsa una temática en tu biblioteca para buscarla en vivo.' : 'Prueba a guardar una temática:'}</p>
              {!library.interests.length && <div className="example-chips">{['Nintendo 3DS', 'Inteligencia artificial', 'Emuladores', 'Automatización'].map((query) => <button key={query} className="chip" onClick={() => onSearch(query)}>{query}</button>)}</div>}
            </div>}
      </Section>

      {favorites.length > 0 && (
        <Section id="mine" icon="library" title="Tu biblioteca" subtitle="Lo último que has guardado en este dispositivo." action={<button className="text-button" onClick={onGoLibrary}>Abrir biblioteca <Icon name="arrow" size={15} /></button>}>
          {favorites.slice(-6).reverse().map((project) => <ProjectCard key={project.id} project={project} actions={actions} />)}
        </Section>
      )}
    </>
  )
}

function newsNote(project: Project) {
  if (project.labels.includes('Nueva versión') && project.version) return `Nueva versión ${project.version} publicada ${relativeDays(project.releasePublishedAt)}.`
  if (project.labels.includes('Nuevo')) return `Proyecto nuevo, creado ${relativeDays(project.createdAt)}.`
  if (project.labels.includes('Reactivado')) return 'Vuelve a tener actividad tras más de seis meses parado.'
  return `Actualizado ${relativeDays(project.pushedAt)}.`
}
