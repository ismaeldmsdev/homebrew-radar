import { useState } from 'react'
import { assessSecurity, executableAssets, hashLookupLinks, latestIsPatched, severityLabel, STATUS_LABEL, type SecurityStatus } from '../core/security.ts'
import { formatDate } from '../explain.ts'
import { checkSecurity, GithubError } from '../github.ts'
import type { Project } from '../types.ts'
import { Icon, type IconName } from './Icon.tsx'

const ORDER: SecurityStatus[] = ['warning', 'manual', 'verified', 'unknown']
const ICON: Record<SecurityStatus, IconName> = { verified: 'check', warning: 'info', unknown: 'info', manual: 'search' }
const COUNT_LABEL: Record<SecurityStatus, string> = { warning: 'advertencias', manual: 'por revisar', verified: 'verificadas', unknown: 'sin datos' }

/** «1 crítica, 3 altas» a partir de las gravedades de los avisos. */
function severitySummary(advisories: { severity: string | null }[]) {
  const order = ['critical', 'high', 'medium', 'moderate', 'low']
  const counts = new Map<string, number>()
  for (const advisory of advisories) { const key = advisory.severity?.toLowerCase() ?? 'sin indicar'; counts.set(key, (counts.get(key) ?? 0) + 1) }
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([key, count]) => `${count} de gravedad ${severityLabel(key)}`).join(', ')
}

const size = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export function SecurityPanel({ project, onUpdate }: { project: Project; onUpdate: (project: Project) => void }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'error'; message: string }>({ status: 'idle', message: '' })
  const facts = project.security

  const run = () => {
    setState({ status: 'loading', message: '' })
    checkSecurity(project)
      .then((security) => { setState({ status: 'idle', message: '' }); onUpdate({ ...project, security }) })
      .catch((error: unknown) => setState({ status: 'error', message: error instanceof GithubError ? error.message : 'No se pudo consultar la información de seguridad.' }))
  }

  const signals = facts ? assessSecurity(facts, project.fullName).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) : []
  const counts = signals.reduce<Partial<Record<SecurityStatus, number>>>((acc, signal) => ({ ...acc, [signal.status]: (acc[signal.status] ?? 0) + 1 }), {})
  const attention = signals.filter((signal) => signal.status === 'warning' || signal.status === 'manual')
  const verified = signals.filter((signal) => signal.status === 'verified')
  const unknown = signals.filter((signal) => signal.status === 'unknown')
  const renderSignal = (signal: (typeof signals)[number]) => (
    <li key={signal.id} className={`signal signal-${signal.status}`}>
      <span className={`signal-status status-${signal.status}`}><Icon name={ICON[signal.status]} size={13} />{STATUS_LABEL[signal.status]}</span>
      <strong>{signal.title}</strong>
      <span>{signal.detail}</span>
      {signal.source && <a href={signal.source} target="_blank" rel="noreferrer">Fuente <Icon name="external" size={12} /></a>}
    </li>
  )
  const executables = facts?.release ? executableAssets(facts.release.assets) : []

  return (
    <section className="security-box" aria-labelledby="security-title">
      <h3 id="security-title"><Icon name="info" size={16} /> Seguridad y confianza</h3>
      <p className="security-disclaimer">
        Señales públicas para ayudarte a decidir antes de descargar. Radar no es un antivirus: ninguna señal garantiza que un programa sea seguro.
      </p>

      {!facts && (
        <div className="security-check">
          <button className="secondary-button" onClick={run} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? <><span className="loader" /> Consultando GitHub…</> : <><Icon name="search" size={15} /> Comprobar señales de seguridad</>}
          </button>
          <p className="fine-print">Usa unas 5 consultas del límite de GitHub sin cuenta (60 por hora) y guarda el resultado 24 horas en este dispositivo.</p>
          {state.status === 'error' && <p className="inline-error">{state.message}</p>}
        </div>
      )}

      {facts && (
        <>
          {/* Resumen en una línea; a la vista solo lo que pide atención, el resto plegado. */}
          <p className="security-counts" aria-label="Resumen de señales">
            {ORDER.filter((status) => counts[status]).map((status) => (
              <span key={status} className={`signal-status status-${status}`}><Icon name={ICON[status]} size={13} />{counts[status]} {COUNT_LABEL[status]}</span>
            ))}
          </p>
          {attention.length > 0
            ? <ul className="signal-list">{attention.map(renderSignal)}</ul>
            : <p className="fine-print">No hay advertencias documentadas ni puntos que requieran revisión manual. Eso no garantiza que sea seguro.</p>}
          {verified.length > 0 && (
            <details className="security-more">
              <summary>Señales verificadas ({verified.length})</summary>
              <ul className="signal-list">{verified.map(renderSignal)}</ul>
            </details>
          )}
          {unknown.length > 0 && (
            <details className="security-more">
              <summary>Información no disponible ({unknown.length})</summary>
              <ul className="signal-list">{unknown.map(renderSignal)}</ul>
            </details>
          )}

          {facts.advisories && facts.advisories.length > 0 && (
            <details className="security-more advisories">
              <summary>Avisos de seguridad publicados ({facts.advisories.length}: {severitySummary(facts.advisories)})</summary>
              <ul>
                {facts.advisories.map((advisory) => {
                  const patched = latestIsPatched(advisory, facts.release?.tag ?? null)
                  return (
                    <li key={advisory.id}>
                      <a href={advisory.url} target="_blank" rel="noreferrer">{advisory.id}</a> · gravedad {severityLabel(advisory.severity)}{advisory.publishedAt ? ` · ${formatDate(advisory.publishedAt)}` : ''}
                      <p>{advisory.summary}</p>
                      {advisory.ranges.map((range, index) => (
                        <p key={index} className="fine-print">
                          {range.package ? `${range.package}: ` : ''}versiones afectadas {range.vulnerable ?? 'no indicadas'}{range.patched ? ` · corregido en ${range.patched}` : ' · sin versión corregida indicada'}
                        </p>
                      ))}
                      <p className="fine-print">
                        {patched === true ? `La última release (${facts.release?.tag}) es igual o posterior a la versión corregida, según los números de versión.`
                          : patched === false ? `La última release (${facts.release?.tag}) parece anterior a la versión corregida: revisa el aviso.`
                            : 'No se puede comparar automáticamente con la última release: revisa el aviso.'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </details>
          )}

          {executables.length > 0 && (
            <details className="security-more executables">
              <summary>Archivos ejecutables y huellas SHA-256 ({executables.length})</summary>
              <ul>
                {executables.map((asset) => (
                  <li key={asset.name}>
                    <strong>{asset.name}</strong> · {size(asset.size)}
                    {asset.digest
                      ? <code title={asset.digest} className="digest">{asset.digest}</code>
                      : <span className="fine-print"> · sin huella publicada por GitHub</span>}
                    <span className="fine-print">
                      {asset.digest && facts.attestations[asset.digest] !== undefined
                        ? facts.attestations[asset.digest] > 0 ? 'Atestación registrada en GitHub, firma no verificada por Radar.' : 'Sin atestación de procedencia.'
                        : 'Procedencia no comprobada.'}
                    </span>
                    {asset.digest && (
                      <span className="hash-links">
                        Buscar esta huella en: {hashLookupLinks(asset.digest).map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="fine-print">
                Los enlaces solo buscan la huella; no se sube ningún archivo. Que un servicio no encuentre detecciones no certifica que el archivo sea seguro,
                y una huella o firma correctas solo prueban integridad o procedencia, no ausencia de malware.
              </p>
            </details>
          )}

          <p className="fine-print">
            Comprobado el {formatDate(facts.checkedAt)} con la API de GitHub{facts.scorecard && facts.scorecard !== 'none' ? ' y OpenSSF Scorecard' : ''}.{' '}
            {project.source === 'live' && <button className="link-button" onClick={run} disabled={state.status === 'loading'}>Volver a comprobar</button>}
          </p>
        </>
      )}
    </section>
  )
}
