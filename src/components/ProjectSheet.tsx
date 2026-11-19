import { useEffect, useRef, useState } from 'react'
import { gemOf, summaryOf } from '../core/feed.ts'
import { KIND_HELP, KIND_LABELS } from '../core/summary.ts'
import { projectStatus } from '../core/scoring.ts'
import { relativeDays } from '../core/text.ts'
import { formatDate, whyInteresting } from '../explain.ts'
import { enrichProject, GithubError } from '../github.ts'
import type { Project, Topic } from '../types.ts'
import { Icon } from './Icon.tsx'

type Props = {
  project: Project
  topics: Topic[]
  isFavorite: boolean
  isHidden: boolean
  onClose: () => void
  onFavorite: (project: Project) => void
  onHide: (project: Project) => void
  onUpdate: (project: Project) => void
}

export function ProjectSheet({ project, topics, isFavorite, isHidden, onClose, onFavorite, onHide, onUpdate }: Props) {
  const dialog = useRef<HTMLElement>(null)
  const [failure, setFailure] = useState<{ id: number; message: string } | null>(null)
  const needsCheck = !project.releaseChecked || project.hasReadme === null
  const verifyError = failure?.id === project.id ? failure.message : ''
  const verifying = verifyError ? 'error' : needsCheck ? 'loading' : 'idle'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && dialog.current) {
        const focusable = [...dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
      previous?.focus?.()
    }
  }, [onClose])

  // Los resultados en vivo llegan sin README ni versiones: se comprueban al abrir la ficha.
  useEffect(() => {
    if (!needsCheck) return
    const controller = new AbortController()
    enrichProject(project, controller.signal)
      .then(onUpdate)
      .catch((error: unknown) => {
        if ((error as Error).name === 'AbortError') return
        setFailure({ id: project.id, message: error instanceof GithubError ? error.message : 'No se pudo comprobar en GitHub.' })
      })
    return () => controller.abort()
  }, [project, needsCheck, onUpdate])

  const status = projectStatus(project)
  const gem = gemOf(project)
  const why = whyInteresting(project, topics)
  const summary = summaryOf(project)
  const when = summary.updatedAt ? ` (${formatDate(summary.updatedAt)})` : ''
  const provenance = summary.origin === 'curated'
    ? `Resumen revisado: redactado con IA a partir del README y la descripción del repositorio${when}, revisado y validado. Puede contener errores: compruébalo en GitHub antes de instalar nada.`
    : summary.origin === 'llm'
      ? `Resumen automático: generado con un modelo de IA abierto que se ejecuta gratis en GitHub Actions${summary.generator ? ` (${summary.generator})` : ''}${when}, sin revisión humana. Una validación automática comprueba el formato y que plataformas, nombres y cifras aparezcan en la documentación, pero no garantiza que cada afirmación sea exacta.`
      : 'Descripción básica construida solo con los metadatos de GitHub (categoría, lenguaje y etiquetas). No se ha generado todavía un resumen a partir del README.'
  const requestUrl = __REPOSITORY__ && summary.origin === 'rules'
    ? `https://github.com/${__REPOSITORY__}/issues/new?title=${encodeURIComponent(`Resumen: ${project.fullName}`)}&body=${encodeURIComponent(`Solicitud de resumen automático en español para https://github.com/${project.fullName}\n\nGitHub Actions lo generará con IA local y gratuita (sin revisión humana). Solo se procesan las solicitudes del propietario de Radar.`)}`
    : null
  const channelLabels = project.channels.map((id) => topics.find((topic) => topic.id === id)?.label).filter(Boolean) as string[]
  const docs = project.hasReadme === null ? (verifying === 'loading' ? 'Comprobando…' : 'No comprobado') : project.readmeQuality ? 'README completo' : project.hasReadme ? 'README básico' : 'Sin README'
  const version = project.version ? `${project.version}${project.releasePublishedAt ? ` · ${formatDate(project.releasePublishedAt)}` : ''}` : project.releaseChecked ? 'Sin versiones publicadas' : verifying === 'loading' ? 'Comprobando…' : 'No comprobado'

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="project-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1} ref={dialog} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <button className="sheet-close icon-button" onClick={onClose} aria-label="Cerrar ficha"><Icon name="close" size={22} /></button>
        <p className="eyebrow"><Icon name="info" size={13} /> Ficha del proyecto {project.source === 'live' && '· resultado en vivo'}</p>
        <h2 id="sheet-title">{project.name}</h2>
        <p className="sheet-owner">
          de <a href={`https://github.com/${project.owner}`} target="_blank" rel="noreferrer">{project.owner}</a>
          {project.ownerType === 'User' ? ' (cuenta personal)' : project.ownerType === 'Organization' ? ' (organización)' : ''}
        </p>

        <div className="tags sheet-tags">
          <span className="tag category-tag">{project.category}</span>
          <span className={`tag status-${status.id}`} title={status.detail}>{status.label}</span>
          {project.consoles.map((name) => <span className="tag platform" key={name}>{name}</span>)}
          {project.labels.map((label) => <span className="tag" key={label}>{label}</span>)}
          {channelLabels.map((label) => <span className="tag channel-tag" key={label}>{label}</span>)}
        </div>

        <section className={`summary-box${summary.origin === 'rules' ? ' is-basic' : ''}`} aria-labelledby="summary-title">
          <h3 id="summary-title">¿Qué es y para qué sirve?</h3>
          <p className="summary-full">{summary.text}</p>
          {summary.detail && <p className="summary-detail">{summary.detail}</p>}
          {summary.kinds.length > 0 && (
            <ul className="kind-list">
              {summary.kinds.map((kind) => <li key={kind}><span className={`kind-chip kind-${kind}`}>{KIND_LABELS[kind]}</span><span>{KIND_HELP[kind]}</span></li>)}
            </ul>
          )}
          {summary.outdated && <p className="inline-error">La descripción del repositorio cambió después de redactar este resumen; puede estar desactualizado.</p>}
          <p className="fine-print">{provenance}</p>
          {requestUrl && (
            <div className="summary-request">
              <a className="secondary-button" href={requestUrl} target="_blank" rel="noreferrer">Pedir resumen automático <Icon name="external" size={15} /></a>
              <p className="fine-print">Abre una solicitud en GitHub con tu cuenta de propietario de Radar. GitHub Actions genera el resumen con IA local gratuita en unos minutos y lo publica; aparecerá aquí y en futuras búsquedas. Desde el navegador no se puede generar al instante sin un servicio externo.</p>
            </div>
          )}
        </section>

        {project.description
          ? <blockquote className="source-description"><span>Descripción original en GitHub</span>{project.description}</blockquote>
          : <p className="muted">El autor no ha escrito una descripción en GitHub.</p>}

        {gem && <div className="gem-box"><Icon name="gem" size={18} /><div><strong>{gem.verified ? 'Joya oculta' : 'Posible joya oculta'} · {gem.score}/100</strong><p>{gem.summary}</p></div></div>}

        <h3>¿Por qué podría interesarte?</h3>
        <ul className={`why-list${why.verified ? '' : ' unverified'}`}>{why.lines.map((line) => <li key={line}>{line}</li>)}</ul>

        <dl className="detail-grid">
          <div><dt>Creado</dt><dd>{formatDate(project.createdAt)}</dd></div>
          <div><dt>Última actividad</dt><dd>{formatDate(project.pushedAt)} <small>({relativeDays(project.pushedAt)})</small></dd></div>
          <div><dt>Última versión</dt><dd>{version}</dd></div>
          <div><dt>Popularidad</dt><dd>★ {project.stars.toLocaleString('es')} · {project.forks.toLocaleString('es')} copias (forks){project.starsDelta ? ` · +${project.starsDelta} en ${Math.round(project.starsDeltaDays ?? 0)} días` : ''}</dd></div>
          <div><dt>Estado</dt><dd>{status.detail}</dd></div>
          <div><dt>Documentación</dt><dd>{docs}</dd></div>
          <div><dt>Licencia</dt><dd>{project.license ?? 'No declarada o no verificada'}</dd></div>
          <div><dt>Lenguaje</dt><dd>{project.language ?? 'No verificado'}</dd></div>
        </dl>
        {verifying === 'error' && <p className="inline-error">{verifyError}</p>}

        <h3>Motivos de la puntuación ({project.score}/100)</h3>
        <ul className="reason-list">{project.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <p className="fine-print">La puntuación es orientativa: resume señales públicas de GitHub y no garantiza calidad, seguridad ni compatibilidad.</p>

        {project.topics.length > 0 && <div className="tags topic-tags" aria-label="Temas de GitHub">{project.topics.slice(0, 12).map((topic) => <span className="tag" key={topic}>#{topic}</span>)}</div>}

        <div className="sheet-actions">
          <a className="primary-button" href={project.url} target="_blank" rel="noreferrer">Abrir repositorio <Icon name="external" size={16} /></a>
          {project.releaseUrl && <a className="secondary-button" href={project.releaseUrl} target="_blank" rel="noreferrer">Ver versión {project.version} <Icon name="external" size={16} /></a>}
          {project.homepage && /^https?:\/\//.test(project.homepage) && <a className="secondary-button" href={project.homepage} target="_blank" rel="noreferrer">Web oficial <Icon name="external" size={16} /></a>}
        </div>
        <div className="sheet-actions secondary">
          <button className={`ghost-button${isFavorite ? ' is-on' : ''}`} onClick={() => onFavorite(project)} aria-pressed={isFavorite}><Icon name="heart" size={17} filled={isFavorite} />{isFavorite ? 'En favoritos' : 'Guardar en favoritos'}</button>
          <button className="ghost-button" onClick={() => onHide(project)}><Icon name={isHidden ? 'restore' : 'hide'} size={17} />{isHidden ? 'Volver a mostrar' : 'Ocultar'}</button>
        </div>
      </section>
    </div>
  )
}
