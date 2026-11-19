import { useMemo, useState } from 'react'
import { consoleFacets, consoleSections, filterConsoleProjects, NEW_PROJECT_DAYS, NEW_RELEASE_DAYS } from '../core/consoleRadar.ts'
import { platformLabel, type ToolTypeId } from '../core/consoles.ts'
import { relativeDays } from '../core/text.ts'
import { formatDate } from '../explain.ts'
import { Icon } from '../components/Icon.tsx'
import { ProjectCard, type CardActions } from '../components/ProjectCard.tsx'
import { Section } from '../components/Section.tsx'
import type { Feed, Project } from '../types.ts'

type Props = { feed: Feed | null; visible: Project[]; actions: CardActions; onSearch: (query: string) => void }

export function Consoles({ feed, visible, actions, onSearch }: Props) {
  const [platform, setPlatform] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolTypeId | null>(null)
  const facets = useMemo(() => consoleFacets(visible), [visible])
  const filtered = useMemo(() => filterConsoleProjects(visible, { platform, tool }), [visible, platform, tool])
  const sections = useMemo(() => consoleSections(filtered), [filtered])
  const topic = feed?.topics.find((item) => item.id === 'consolas')
  const filterLabel = [platform && platformLabel(platform), tool && facets.tools.find((item) => item.id === tool)?.label].filter(Boolean).join(' · ')
  const empty = sections.featured.length + sections.newProjects.length + sections.releases.length + sections.revived.length + sections.gems.length === 0

  const card = (project: Project, note?: string) => <ProjectCard key={project.id} project={project} actions={actions} note={note} />

  return (
    <section className="consoles-view" aria-labelledby="consoles-title">
      <p className="eyebrow"><Icon name="gamepad" size={13} /> Tu radar personal</p>
      <h1 id="consoles-title" className="view-title">Radar de Consolas</h1>
      <p className="view-lead">
        Homebrew, CFW, jailbreak, emuladores y utilidades para consolas de todas las generaciones, recopilados automáticamente de GitHub
        {topic?.collectedAt ? ` (última recopilación ${relativeDays(topic.collectedAt)})` : ''}. Solo proyectos públicos; se excluyen los que enlazan copias no autorizadas de juegos.
        Esta sección refleja tus intereses: las búsquedas generales no se ven afectadas.
      </p>

      <div className="facet-group" role="group" aria-label="Filtrar por consola">
        <button className={`chip${platform === null ? ' is-active' : ''}`} aria-pressed={platform === null} onClick={() => setPlatform(null)}>Todas las consolas</button>
        {facets.platforms.map(([id, count]) => (
          <button key={id} className={`chip${platform === id ? ' is-active' : ''}`} aria-pressed={platform === id} onClick={() => setPlatform(platform === id ? null : id)}>
            {platformLabel(id)} <small>{count}</small>
          </button>
        ))}
      </div>
      <div className="facet-group" role="group" aria-label="Filtrar por tipo de herramienta">
        <button className={`chip${tool === null ? ' is-active' : ''}`} aria-pressed={tool === null} onClick={() => setTool(null)}>Todos los tipos</button>
        {facets.tools.map((item) => (
          <button key={item.id} className={`chip${tool === item.id ? ' is-active' : ''}`} aria-pressed={tool === item.id} onClick={() => setTool(tool === item.id ? null : item.id)}>
            {item.label} <small>{item.count}</small>
          </button>
        ))}
      </div>
      <p className="hint">{sections.total} proyectos{filterLabel ? ` de ${filterLabel}` : ''} en el catálogo. Para buscar en todo GitHub:{' '}
        <button className="link-button" onClick={() => onSearch(`${platform ? platformLabel(platform) : 'consolas'} ${tool ? facets.tools.find((item) => item.id === tool)?.label ?? '' : 'homebrew'}`.trim())}>buscar en vivo</button>.
      </p>

      {empty && (
        <div className="empty-state">
          <Icon name="gamepad" size={28} />
          <h3>Aún no hay proyectos con estos filtros</h3>
          <p>El catálogo de consolas se amplía cada 12 horas. Prueba otra consola o busca en vivo en GitHub.</p>
        </div>
      )}

      {sections.newProjects.length > 0 && (
        <Section id="consoles-new" icon="news" title="Proyectos nuevos" subtitle={`Repositorios creados en los últimos ${NEW_PROJECT_DAYS} días. Un cambio reciente en un proyecto antiguo no cuenta como nuevo.`}>
          {sections.newProjects.map((project) => card(project, `Creado el ${formatDate(project.createdAt)} (${relativeDays(project.createdAt)}).`))}
        </Section>
      )}
      {sections.releases.length > 0 && (
        <Section id="consoles-releases" icon="download" title="Nuevas versiones" subtitle={`Publicaciones oficiales (releases) de los últimos ${NEW_RELEASE_DAYS} días, no simples commits.`}>
          {sections.releases.map((project) => card(project, `Versión ${project.version} publicada ${relativeDays(project.releasePublishedAt)}.`))}
        </Section>
      )}
      {sections.gems.length > 0 && (
        <Section id="consoles-gems" icon="gem" title="Joyas poco conocidas" subtitle="Pocas estrellas, pero con documentación o versiones publicadas y actividad reciente.">
          {sections.gems.map((project) => card(project))}
        </Section>
      )}
      {sections.revived.length > 0 && (
        <Section id="consoles-revived" icon="refresh" title="Recuperados" subtitle="Volvieron a tener actividad tras más de 6 meses sin cambios.">
          {sections.revived.map((project) => card(project, `Actividad de nuevo ${relativeDays(project.pushedAt)}.`))}
        </Section>
      )}
      {sections.featured.length > 0 && (
        <Section id="consoles-featured" icon="spark" title="Destacados" subtitle="Lo mejor puntuado, variando de consola y de autor para no repetir siempre los mismos." layout="grid">
          {sections.featured.map((project) => card(project))}
        </Section>
      )}
    </section>
  )
}
