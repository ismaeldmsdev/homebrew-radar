import { useState } from 'react'
import { assessSecurity, executableAssets, hashLookupLinks, latestIsPatched, severityLabel, STATUS_LABEL, type SecurityStatus } from '../core/security.ts'
import { formatDate } from '../explain.ts'
import { checkSecurity, GithubError } from '../github.ts'
import type { Project } from '../types.ts'
import { Icon, type IconName } from './Icon.tsx'

const ORDER: SecurityStatus[] = ['warning', 'manual', 'verified', 'unknown']
const ICON: Record<SecurityStatus, IconName> = { verified: 'check', warning: 'info', unknown: 'info', manual: 'search' }

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
  const executables = facts?.release ? executableAssets(facts.release.assets) : []

  return (
    <section className="security-box" aria-labelledby="security-title">
      <h3 id="security-title"><Icon name="info" size={16} /> Seguridad y confianza</h3>
      <p className="security-disclaimer">
        Radar no es un antivirus: muestra señales públicas de GitHub y OpenSSF Scorecard para ayudarte a decidir. Ninguna garantiza que un programa sea seguro,
        y Radar nunca descarga ni ejecuta los archivos. La popularidad no se tiene en cuenta.
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
          <ul className="signal-list">
            {signals.map((signal) => (
              <li key={signal.id} className={`signal signal-${signal.status}`}>
                <span className={`signal-status status-${signal.status}`}><Icon name={ICON[signal.status]} size={13} />{STATUS_LABEL[signal.status]}</span>
                <strong>{signal.title}</strong>
                <span>{signal.detail}</span>
                {signal.source && <a href={signal.source} target="_blank" rel="noreferrer">Fuente <Icon name="external" size={12} /></a>}
              </li>
            ))}
          </ul>

          {facts.advisories && facts.advisories.length > 0 && (
            <div className="advisories">
              <h4>Avisos de seguridad publicados</h4>
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
            </div>
          )}

          {executables.length > 0 && (
            <div className="executables">
              <h4>Ejecutables de la release {facts.release?.tag}</h4>
              <ul>
                {executables.map((asset) => (
                  <li key={asset.name}>
                    <strong>{asset.name}</strong> · {size(asset.size)}
                    {asset.digest
                      ? <code title={asset.digest} className="digest">{asset.digest}</code>
                      : <span className="fine-print"> · sin huella publicada por GitHub</span>}
                    <span className="fine-print">
                      {asset.digest && facts.attestations[asset.digest] !== undefined
                        ? facts.attestations[asset.digest] > 0 ? 'Atestación de procedencia registrada en GitHub.' : 'Sin atestación de procedencia.'
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
            </div>
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
