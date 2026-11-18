import { relativeDays } from '../core/text.ts'
import { GEM_MAX_STARS, GEM_MIN_STARS } from '../core/scoring.ts'
import { Icon } from '../components/Icon.tsx'
import { formatDateTime } from '../explain.ts'
import { clearSearchCache, getLastRate } from '../github.ts'
import type { useUpdateCheck } from '../update.ts'
import type { Feed } from '../types.ts'

type Props = {
  feed: Feed | null
  feedNote: string
  online: boolean
  update: ReturnType<typeof useUpdateCheck>
  notify: (message: string) => void
}

const updateText: Record<string, string> = {
  dev: 'Modo desarrollo: la comprobación solo funciona en la web publicada.',
  idle: 'Sin comprobar todavía.',
  checking: 'Comprobando…',
  current: 'Estás usando la última versión publicada.',
  available: 'Hay una versión nueva publicada.',
  pending: 'Ya se intentó actualizar, pero el servidor aún entrega la versión anterior. Vuelve a intentarlo en unos minutos.',
  error: 'No se pudo comprobar. Inténtalo más tarde.',
  offline: 'Sin conexión: no se puede comprobar.',
}

export function Settings({ feed, feedNote, online, update, notify }: Props) {
  const rate = getLastRate()
  return (
    <section className="settings-view" aria-labelledby="settings-title">
      <h1 id="settings-title" className="view-title">Información y ajustes</h1>

      <div className="info-grid">
        <div className="info-card">
          <h2><Icon name="refresh" size={18} />Versión de la aplicación</h2>
          <dl>
            <div><dt>Versión</dt><dd>{__APP_VERSION__}</dd></div>
            <div><dt>Código en uso</dt><dd><code>{update.running ?? 'desarrollo local'}</code></dd></div>
            <div><dt>Publicada</dt><dd>{update.remote ? <>{update.remote.version} · commit <code>{update.remote.commit ?? '—'}</code> · {formatDateTime(update.remote.builtAt)}</> : '—'}</dd></div>
            <div><dt>Estado</dt><dd>{updateText[update.state]}{update.checkedAt ? ` (${formatDateTime(update.checkedAt)})` : ''}</dd></div>
          </dl>
          <div className="row-actions">
            <button className="ghost-button" onClick={() => void update.check()} disabled={update.state === 'checking'}><Icon name="refresh" size={16} />Comprobar actualizaciones</button>
            {(update.state === 'available' || update.state === 'pending') && <button className="primary-button" onClick={update.apply}>Recargar ahora</button>}
          </div>
          <p className="fine-print">La app comprueba si hay versión nueva al abrirla y al volver a ella. Recargar no borra favoritos ni preferencias. Si el iPhone está sin conexión o Safari mantiene la copia en caché, la actualización llegará en la siguiente apertura con conexión.</p>
        </div>

        <div className="info-card">
          <h2><Icon name="library" size={18} />Datos del catálogo</h2>
          <dl>
            <div><dt>Última recopilación</dt><dd>{feed ? `${formatDateTime(feed.generatedAt)} (${relativeDays(feed.generatedAt)})` : '—'}</dd></div>
            <div><dt>Proyectos</dt><dd>{feed?.projects.length ?? 0}</dd></div>
            <div><dt>Fuente</dt><dd>API REST oficial de GitHub, recopilada por GitHub Actions cada 12 horas.</dd></div>
          </dl>
          {feedNote && <p className="hint">{feedNote}</p>}
          {feed && <ul className="topic-status">{feed.topics.map((topic) => (
            <li key={topic.id}><span className={`dot ${topic.status}`} aria-hidden="true" />{topic.label}<small>{topic.count} · {topic.status === 'ok' ? `actualizada ${relativeDays(topic.collectedAt)}` : `sin actualizar desde ${topic.collectedAt ? relativeDays(topic.collectedAt) : 'el inicio'} (se conservan los datos anteriores)`}</small></li>
          ))}</ul>}
        </div>

        <div className="info-card">
          <h2><Icon name="wifi" size={18} />Conectividad</h2>
          <dl>
            <div><dt>Conexión</dt><dd>{online ? 'En línea' : 'Sin conexión: se muestra la última copia guardada del catálogo'}</dd></div>
            <div><dt>Búsquedas en vivo</dt><dd>{rate ? `${rate.remaining} de ${rate.limit} disponibles (${rate.resource === 'search' ? 'búsquedas por minuto' : 'consultas por hora'}), se renuevan a las ${new Intl.DateTimeFormat('es', { timeStyle: 'short' }).format(new Date(rate.resetAt))}` : 'Sin consultas en esta sesión'}</dd></div>
          </dl>
          <button className="ghost-button" onClick={() => { clearSearchCache(); notify('Caché de búsquedas borrada. Tu biblioteca no se ha tocado.') }}><Icon name="trash" size={16} />Borrar caché de búsquedas</button>
        </div>
      </div>

      <div className="explainers">
        <details className="explainer" open>
          <summary>Qué cubre este buscador</summary>
          <p>Hoy la única fuente conectada es <strong>GitHub</strong>: repositorios públicos de código abierto. No es un buscador de todo Internet ni incluye tiendas de aplicaciones.</p>
          <p>Cada búsqueda combina dos orígenes: el <strong>catálogo del radar</strong> (temáticas recopiladas y verificadas cada 12 horas) y la <strong>búsqueda en vivo</strong> de GitHub desde tu navegador, sin cuenta, limitada por GitHub a 10 búsquedas por minuto.</p>
        </details>
        <details className="explainer">
          <summary>Cómo se interpreta lo que escribes</summary>
          <p>Con <strong>reglas y palabras clave</strong>, no con inteligencia artificial: expresiones como «inteligencia artificial», «Windows» o «poco conocidas» se traducen a términos y filtros de GitHub. Las palabras no reconocidas se buscan tal cual. La ficha de resultados muestra siempre la consulta exacta enviada.</p>
        </details>
        <details className="explainer">
          <summary>Cómo se calcula la puntuación de interés</summary>
          <p>De 0 a 100, sumando: relevancia para la búsqueda o temática (25), actividad reciente (20), documentación README (15), versión publicada (10), popularidad en escala logarítmica (10), madurez (5), descripción (5) y licencia, temas y web (10). Las listas de recursos restan 10. Es orientativa: no garantiza calidad ni seguridad.</p>
        </details>
        <details className="explainer">
          <summary>Qué es una joya oculta</summary>
          <p>Un proyecto con entre {GEM_MIN_STARS} y {GEM_MAX_STARS} estrellas, activo en el último año, con descripción, que no esté archivado ni sea una lista, y que tenga un README documentado o una versión publicada. Pocas estrellas no bastan. Si README y versiones no se han comprobado aún, se marca como «posible joya».</p>
        </details>
        <details className="explainer">
          <summary>Añadir a la pantalla de inicio del iPhone</summary>
          <p>Abre la web en Safari, pulsa <strong>Compartir → Añadir a pantalla de inicio</strong>. Se abrirá a pantalla completa. Cuando se publique una versión nueva no hace falta reinstalarla: verás un aviso para recargar.</p>
        </details>
        <details className="explainer">
          <summary>Privacidad</summary>
          <p>Favoritos, historial, ocultos y temáticas se guardan solo en este navegador. Las búsquedas en vivo se envían directamente a la API de GitHub desde tu dispositivo. No hay cuentas ni servidores propios.</p>
        </details>
      </div>
    </section>
  )
}
