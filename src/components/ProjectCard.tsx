import { useState } from 'react'
import { gemOf, summaryOf } from '../core/feed.ts'
import { projectStatus } from '../core/scoring.ts'
import { cardSecurityWarning } from '../core/security.ts'
import { KIND_HELP, KIND_LABELS } from '../core/summary.ts'
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

const ORIGIN_LABEL = { curated: 'Revisado', llm: 'Automático', rules: 'Básico' } as const
const ORIGIN_HELP = {
  curated: 'Resumen redactado a partir del README y revisado.',
  llm: 'Resumen generado automáticamente con IA local, sin revisión humana.',
  rules: 'Descripción básica con metadatos de GitHub: aún no hay resumen del README.',
} as const

/** Avatar del autor en GitHub (carga diferida); si falla, la inicial del proyecto. */
export function ProjectAvatar({ project, size = 48 }: { project: Project; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed || !project.owner) return <span className="project-avatar fallback" style={{ width: size, height: size }} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
  return (
    <img className="project-avatar" src={`https://avatars.githubusercontent.com/${encodeURIComponent(project.owner)}?s=${size * 2}`}
      width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  )
}

export function ProjectCard({ project, actions, note, highlight }: { project: Project; actions: CardActions; note?: string; highlight?: 'gem' | 'news' | 'trend' }) {
  const favorite = actions.isFavorite(project.id)
  const hidden = actions.isHidden(project.id)
  const seen = actions.isSeen(project.id)
  const status = projectStatus(project)
  const gem = gemOf(project)
  const summary = summaryOf(project)
  const warning = cardSecurityWarning(project.security)
  const line = note ?? (highlight === 'gem' && gem ? gem.summary : project.reasons[0]) ?? 'Encontrado en GitHub.'
  const open = () => actions.onOpen(project)

  // Pocas etiquetas: primero el estado si no está activo, luego lo más informativo.
  const tags: { key: string; label: string; className: string; title?: string }[] = []
  if (status.id !== 'active' && status.id !== 'maintained') tags.push({ key: 'status', label: status.label, className: `status-${status.id}` })
  if (gem && highlight !== 'gem') tags.push({ key: 'gem', label: 'Joya oculta', className: 'gem-tag' })
  for (const label of project.labels) if (label === 'Nuevo' || label === 'Nueva versión' || label === 'Reactivado') tags.push({ key: label, label, className: 'new-tag' })
  if (project.source === 'live') tags.push({ key: 'live', label: 'En vivo', className: 'live-tag', title: 'Resultado obtenido en vivo de GitHub' })
  if (seen) tags.push({ key: 'seen', label: 'Visto', className: 'seen-tag' })

  return (
    <article className={`project-card${seen ? ' is-seen' : ''}${highlight ? ` is-${highlight}` : ''}`}>
      <div className="card-head">
        <button className="card-identity" onClick={open} aria-label={`Ver ficha de ${project.name}`}>
          <ProjectAvatar project={project} size={44} />
          <span className="card-identity-text">
            <span className="card-title">{project.name}</span>
            <span className="project-owner">{project.owner}</span>
          </span>
        </button>
        <div className="card-actions">
          <button className={`icon-button hide${hidden ? ' is-on' : ''}`} onClick={() => actions.onHide(project)} aria-label={hidden ? `Volver a mostrar ${project.name}` : `Ocultar ${project.name}`} title={hidden ? 'Volver a mostrar' : 'Ocultar'}>
            <Icon name={hidden ? 'restore' : 'hide'} size={17} />
          </button>
          <button className={`icon-button favorite${favorite ? ' is-on' : ''}`} onClick={() => actions.onFavorite(project)} aria-pressed={favorite} aria-label={favorite ? `Quitar ${project.name} de favoritos` : `Guardar ${project.name} en favoritos`} title={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}>
            <Icon name="heart" size={20} filled={favorite} />
          </button>
        </div>
      </div>

      {/* El botón de la cabecera es el acceso accesible a la ficha; aquí basta con el clic. */}
      <div className="card-summary" onClick={open}>
        <div className="summary-heading-row">
          <h3 className="summary-heading">¿Qué es y para qué sirve?</h3>
          <span className={`origin-badge origin-${summary.origin}`} title={ORIGIN_HELP[summary.origin]}>{ORIGIN_LABEL[summary.origin]}</span>
        </div>
        <p className={`summary-text${summary.limited ? ' is-limited' : ''}`}>{summary.text}</p>
        {summary.origin === 'rules' && project.description && <p className="summary-original" lang="en">«{project.description}»</p>}
        {summary.origin === 'rules'
          ? <p className="summary-note"><Icon name="info" size={12} /> Descripción básica: aún no hay un resumen verificado.</p>
          : summary.limited
            ? <p className="summary-note"><Icon name="info" size={12} /> Faltan datos en GitHub para un resumen completo.</p>
            : summary.outdated && <p className="summary-note"><Icon name="info" size={12} /> La descripción cambió después de redactar este resumen.</p>}
      </div>

      <ul className="card-facts" aria-label="Datos clave">
        <li className="fact-category">{project.category}</li>
        {project.consoles.slice(0, 2).map((name) => <li className="fact-platform" key={name} title="Plataforma detectada en la documentación">{name}</li>)}
        {summary.kinds.slice(0, 2).map((kind) => <li className={`fact-kind kind-${kind}`} key={kind} title={KIND_HELP[kind]}>{KIND_LABELS[kind]}</li>)}
        <li className="fact-activity" title={`Última actividad: ${formatDate(project.pushedAt)}`}><Icon name="clock" size={13} />{relativeDays(project.pushedAt)}</li>
      </ul>

      <p className={`reason-line${highlight === 'gem' && gem ? ' gem-line' : ''}`}><Icon name={highlight === 'gem' ? 'gem' : highlight === 'trend' ? 'trend' : 'spark'} size={14} />{line}</p>

      <div className="card-meta">
        <div className="tags">
          {warning && <span className="tag warning-tag" title="Avisos publicados en GitHub sin versión corregida confirmada. Detalles en la ficha."><Icon name="info" size={12} />{warning}</span>}
          {tags.slice(0, warning ? 2 : 3).map((tag) => <span className={`tag ${tag.className}`} key={tag.key} title={tag.title}>{tag.label}</span>)}
        </div>
        <div className="card-stats">
          <span title={`${project.stars.toLocaleString('es')} estrellas en GitHub`}><Icon name="star" size={13} />{compactNumber(project.stars)}</span>
          <span className="score-pill" title="Puntuación orientativa de interés (0-100)">{project.score}</span>
        </div>
      </div>
    </article>
  )
}
