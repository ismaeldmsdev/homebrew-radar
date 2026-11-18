import { gemOf } from '../core/feed.ts'
import { projectStatus } from '../core/scoring.ts'
import { relativeDays } from '../core/text.ts'
import { compactNumber, formatDate } from '../explain.ts'
import type { Project } from '../types.ts'
import { Icon } from './Icon.tsx'

export type CardActions = {
  isFavorite: (id: number) => boolean
  isHidden: (id: number) => boolean
  isSeen: (id: number) => boolean
  onOpen: (project: Project) => void
  onFavorite: (project: Project) => void
  onHide: (project: Project) => void
}

const categoryIcon = (category: string) =>
  /Juegos|Emuladores|Retro/.test(category) ? 'compass' : /Inteligencia/.test(category) ? 'spark' : /terminal|desarrollo/i.test(category) ? 'code' : /Lista/.test(category) ? 'bookmark' : 'tag'

export function ProjectCard({ project, actions, note, highlight }: { project: Project; actions: CardActions; note?: string; highlight?: 'gem' | 'news' | 'trend' }) {
  const favorite = actions.isFavorite(project.id)
  const hidden = actions.isHidden(project.id)
  const seen = actions.isSeen(project.id)
  const status = projectStatus(project)
  const gem = gemOf(project)
  const line = note ?? (highlight === 'gem' && gem ? gem.summary : project.reasons[0]) ?? 'Encontrado en GitHub.'
  return (
    <article className={`project-card${seen ? ' is-seen' : ''}${highlight ? ` is-${highlight}` : ''}`}>
      <div className="card-topline">
        <span className="category-label"><Icon name={categoryIcon(project.category)} size={14} />{project.category}</span>
        <div className="card-actions">
          <button className={`icon-button${hidden ? ' is-on' : ''}`} onClick={() => actions.onHide(project)} aria-label={hidden ? `Volver a mostrar ${project.name}` : `Ocultar ${project.name}`} title={hidden ? 'Volver a mostrar' : 'Ocultar'}>
            <Icon name={hidden ? 'restore' : 'hide'} size={17} />
          </button>
          <button className={`icon-button favorite${favorite ? ' is-on' : ''}`} onClick={() => actions.onFavorite(project)} aria-pressed={favorite} aria-label={favorite ? `Quitar ${project.name} de favoritos` : `Guardar ${project.name} en favoritos`} title={favorite ? 'Quitar de favoritos' : 'Guardar'}>
            <Icon name="heart" size={18} filled={favorite} />
          </button>
        </div>
      </div>
      <button className="card-main" onClick={() => actions.onOpen(project)} aria-label={`Ver ficha de ${project.name}`}>
        <span className="card-title-row">
          <span className="card-title">{project.name}</span>
          <span className="score-pill" title="Puntuación orientativa de interés (0-100)">{project.score}</span>
        </span>
        <span className="project-owner">{project.owner}{project.language ? ` · ${project.language}` : ''}</span>
        <span className="project-description">{project.description || 'Sin descripción en GitHub.'}</span>
        <span className={`reason-line${highlight === 'gem' && gem ? ' gem-line' : ''}`}><Icon name={highlight === 'gem' ? 'gem' : highlight === 'trend' ? 'trend' : 'spark'} size={14} />{line}</span>
      </button>
      <div className="card-meta">
        <div className="tags">
          {project.consoles.map((name) => <span className="tag platform" key={name}>{name}</span>)}
          {status.id !== 'active' && status.id !== 'maintained' && <span className={`tag status-${status.id}`}>{status.label}</span>}
          {gem && highlight !== 'gem' && <span className="tag gem-tag"><Icon name="gem" size={12} />Joya</span>}
          {project.labels.filter((label) => label !== 'Poco conocido').map((label) => <span className={`tag ${label === 'Nuevo' || label === 'Nueva versión' ? 'new-tag' : ''}`} key={label}>{label}</span>)}
          {project.source === 'live' && <span className="tag live-tag" title="Resultado obtenido en vivo de GitHub">En vivo</span>}
          {seen && <span className="tag">Visto</span>}
        </div>
        <div className="card-stats">
          <span title={`${project.stars.toLocaleString('es')} estrellas en GitHub`}><Icon name="star" size={13} />{compactNumber(project.stars)}</span>
          <span title={`Última actividad: ${formatDate(project.pushedAt)}`}><Icon name="clock" size={13} />{relativeDays(project.pushedAt)}</span>
        </div>
      </div>
    </article>
  )
}
