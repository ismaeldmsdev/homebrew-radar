// «Seguridad y confianza»: señales verificables sobre un repositorio y sus ejecutables,
// obtenidas SOLO de metadatos de APIs oficiales (GitHub y OpenSSF Scorecard). Radar no
// descarga ni ejecuta archivos y no es un antivirus: ninguna señal garantiza que un
// programa sea seguro. No hay puntuación numérica y la popularidad no interviene.

export type SecurityStatus = 'verified' | 'warning' | 'unknown' | 'manual'

export const STATUS_LABEL: Record<SecurityStatus, string> = {
  verified: 'Señal verificada',
  warning: 'Advertencia documentada',
  unknown: 'Información no disponible',
  manual: 'Requiere revisión manual',
}

export type ReleaseAsset = { name: string; size: number; digest: string | null; url: string }

export type Advisory = {
  id: string
  severity: string | null
  summary: string
  url: string
  publishedAt: string | null
  ranges: { package: string | null; vulnerable: string | null; patched: string | null }[]
}

/** Hechos en bruto (lo que se guarda en caché); el texto se genera al mostrarlo. */
export type SecurityFacts = {
  checkedAt: string
  repo: { createdAt: string; pushedAt: string; fork: boolean; archived: boolean; size: number | null; ownerType: string | null; ownerCreatedAt: string | null }
  /** null = sin releases estables; undefined no se usa (se marca releaseChecked=false). */
  release: { tag: string; url: string; publishedAt: string | null; immutable: boolean | null; assets: ReleaseAsset[] } | null
  releaseChecked: boolean
  /** Atestaciones registradas por huella (solo ejecutables comprobados). */
  attestations: Record<string, number>
  /** null = no se pudo consultar. */
  advisories: Advisory[] | null
  /** null = no se pudo consultar; 'none' = Scorecard no tiene datos de este repositorio. */
  scorecard: { date: string; checks: Record<string, number> } | 'none' | null
}

export type Signal = { id: string; status: SecurityStatus; title: string; detail: string; source?: string }

const DAY = 86_400_000

const EXECUTABLE = /\.(exe|msi|msix|msixbundle|appx|appxbundle|scr|bat|cmd|ps1)$/i
const ARCHIVE = /\.(zip|7z|rar)$/i
const INTEGRITY = /(checksums?|sha256sums?|sha512sums?|hashes)(\.txt)?$|\.(sha256|sha512|md5)$/i
const SIGNATURE = /\.(sig|asc|minisig|sigstore|sigstore\.json|pem|crt)$|\.intoto\.jsonl$|provenance/i

export const isWindowsExecutable = (name: string) => EXECUTABLE.test(name)
export const isArchive = (name: string) => ARCHIVE.test(name)

/** Archivos ejecutables de Windows o comprimidos que pueden contenerlos (por el nombre). */
export function executableAssets(assets: ReleaseAsset[]) {
  // Un comprimido solo cuenta si su nombre indica Windows («x64» a secas también aparece
  // en versiones para Linux o macOS). Los ejecutables directos van primero.
  const windowsArchive = (name: string) => isArchive(name) && /win(dows|32|64)?\b|[-_.]win[-_.]|setup|portable/i.test(name) && !/linux|osx|macos|darwin|android|\bmac\b/i.test(name)
  return assets
    .filter((asset) => isWindowsExecutable(asset.name) || windowsArchive(asset.name))
    .sort((a, b) => Number(isWindowsExecutable(b.name)) - Number(isWindowsExecutable(a.name)))
}

/** Compara versiones numéricas simples (1.2.10 > 1.2.9). null si el formato no lo permite. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string) => value.trim().replace(/^v/i, '').split(/[.-]/)
  const left = parse(a)
  const right = parse(b)
  if (![...left, ...right].every((part) => /^\d+$/.test(part))) return null
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = Number(left[index] ?? 0) - Number(right[index] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

const SEVERITY: Record<string, string> = { critical: 'crítica', high: 'alta', medium: 'media', moderate: 'media', low: 'baja' }
export const severityLabel = (value: string | null) => (value ? SEVERITY[value.toLowerCase()] ?? value : 'sin indicar')

/** ¿La última versión publicada es igual o posterior a la corregida? Solo si es comparable. */
export function latestIsPatched(advisory: Advisory, latestTag: string | null) {
  if (!latestTag) return null
  const patched = advisory.ranges.map((range) => range.patched).filter((value): value is string => Boolean(value))
  if (!patched.length) return null
  const results = patched.map((value) => compareVersions(latestTag, value))
  if (results.some((result) => result === null)) return null
  return results.every((result) => (result ?? -1) >= 0)
}

const SCORECARD_CHECKS: { name: string; good: string; bad: string; warnBelow?: number }[] = [
  { name: 'Dangerous-Workflow', good: 'Sus flujos de GitHub Actions no usan patrones peligrosos conocidos.', bad: 'Scorecard detecta patrones peligrosos en sus flujos de GitHub Actions.', warnBelow: 10 },
  { name: 'Binary-Artifacts', good: 'El código fuente no incluye binarios sin compilar desde el propio código.', bad: 'El repositorio incluye archivos binarios dentro del código fuente: no se pueden revisar como el resto del código.' },
  { name: 'Security-Policy', good: 'Publica una política de seguridad (SECURITY.md) para informar de vulnerabilidades.', bad: 'No publica una política de seguridad para informar de vulnerabilidades.' },
  { name: 'Code-Review', good: 'Los cambios recientes pasan por revisión de código.', bad: 'Los cambios recientes no suelen pasar por revisión de código.' },
  { name: 'Vulnerabilities', good: 'Scorecard no encontró vulnerabilidades conocidas abiertas en sus dependencias.', bad: 'Scorecard encontró vulnerabilidades conocidas abiertas (OSV).', warnBelow: 10 },
]

export function assessSecurity(facts: SecurityFacts, fullName: string, now = Date.now()): Signal[] {
  const signals: Signal[] = []
  const repoUrl = `https://github.com/${fullName}`
  const days = (iso: string | null) => (iso ? (now - Date.parse(iso)) / DAY : Number.POSITIVE_INFINITY)
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso)) : 'fecha desconocida')

  // 1. Identidad y trayectoria (señales indirectas: no dicen nada del contenido).
  const repoAge = days(facts.repo.createdAt)
  const ownerAge = days(facts.repo.ownerCreatedAt)
  if (facts.repo.fork) {
    signals.push({ id: 'fork', status: 'manual', title: 'Es una copia (fork) de otro repositorio', detail: 'Comprueba que es la fuente oficial del programa y no una copia modificada.', source: repoUrl })
  } else if (repoAge < 30 && ownerAge < 90) {
    signals.push({ id: 'identity', status: 'manual', title: 'Repositorio y cuenta muy recientes', detail: `El repositorio se creó el ${date(facts.repo.createdAt)} y la cuenta ${facts.repo.ownerCreatedAt ? `el ${date(facts.repo.ownerCreatedAt)}` : 'en fecha desconocida'}. Sin trayectoria pública no hay historial que respalde al autor: extrema la precaución.`, source: repoUrl })
  } else {
    signals.push({ id: 'identity', status: 'verified', title: 'Trayectoria pública del repositorio', detail: `Creado el ${date(facts.repo.createdAt)} por ${facts.repo.ownerType === 'Organization' ? 'una organización' : 'una cuenta personal'}${facts.repo.ownerCreatedAt ? ` que existe desde ${date(facts.repo.ownerCreatedAt)}` : ''}. Es una señal indirecta: la antigüedad no garantiza que el software sea seguro.`, source: repoUrl })
  }

  // 2. Mantenimiento.
  if (facts.repo.archived) signals.push({ id: 'maintenance', status: 'warning', title: 'Archivado por su autor', detail: 'Ya no recibe cambios ni correcciones de seguridad.', source: repoUrl })
  else if (days(facts.repo.pushedAt) > 730) signals.push({ id: 'maintenance', status: 'warning', title: 'Sin mantenimiento reciente', detail: `No tiene cambios desde el ${date(facts.repo.pushedAt)}: si aparecen vulnerabilidades, probablemente no se corregirán.`, source: repoUrl })
  else signals.push({ id: 'maintenance', status: 'verified', title: 'Mantenimiento activo', detail: `Último cambio el ${date(facts.repo.pushedAt)}. Indica que el proyecto sigue vivo, no que su código sea seguro.`, source: repoUrl })

  // 3. Código fuente.
  if (facts.repo.size === 0) signals.push({ id: 'source', status: 'warning', title: 'Repositorio sin código', detail: 'El repositorio está vacío: no hay código fuente que revisar.', source: repoUrl })
  else signals.push({ id: 'source', status: 'verified', title: 'Código fuente público', detail: 'El código está publicado y se puede revisar. Eso no demuestra que los ejecutables se compilaran a partir de él.', source: repoUrl })

  // 4. Avisos de seguridad publicados.
  if (facts.advisories === null) signals.push({ id: 'advisories', status: 'unknown', title: 'Avisos de seguridad no consultados', detail: 'No se pudo consultar la lista de avisos de GitHub.', source: `${repoUrl}/security/advisories` })
  else if (facts.advisories.length) signals.push({ id: 'advisories', status: 'warning', title: `${facts.advisories.length} ${facts.advisories.length === 1 ? 'aviso de seguridad publicado' : 'avisos de seguridad publicados'}`, detail: 'Revisa a qué versiones afectan y si la que vas a usar está corregida (detalle más abajo).', source: `${repoUrl}/security/advisories` })
  else signals.push({ id: 'advisories', status: 'unknown', title: 'Sin avisos de seguridad publicados', detail: `Comprobado en GitHub el ${date(facts.checkedAt)}. Que no haya avisos no significa que no existan vulnerabilidades: muchos proyectos no publican avisos.`, source: `${repoUrl}/security/advisories` })

  // 5. Releases, ejecutables, integridad y procedencia.
  if (!facts.releaseChecked) {
    signals.push({ id: 'release', status: 'unknown', title: 'Releases no comprobadas', detail: 'Todavía no se han consultado las publicaciones oficiales.' })
    return signals
  }
  if (!facts.release) {
    signals.push({ id: 'release', status: 'manual', title: 'Sin releases oficiales', detail: 'No hay versiones publicadas en GitHub: tendrías que compilarlo tú o descargarlo de otra fuente, que Radar no puede evaluar.', source: `${repoUrl}/releases` })
    return signals
  }
  const release = facts.release
  signals.push({ id: 'release', status: 'verified', title: `Release oficial ${release.tag}`, detail: `Publicada en GitHub el ${date(release.publishedAt)} por el propio repositorio.`, source: release.url })
  if (release.immutable === true) signals.push({ id: 'immutable', status: 'verified', title: 'Release inmutable', detail: 'GitHub impide modificar o sustituir sus archivos después de publicarla.', source: release.url })
  else if (release.immutable === false) signals.push({ id: 'immutable', status: 'manual', title: 'Release modificable', detail: 'El autor puede sustituir sus archivos después de publicarla. Comprueba la huella SHA-256 del archivo que descargues.', source: release.url })

  const executables = executableAssets(release.assets)
  const withDigest = release.assets.filter((asset) => asset.digest)
  if (withDigest.length) signals.push({ id: 'digests', status: 'verified', title: 'Huellas SHA-256 publicadas por GitHub', detail: `GitHub calcula la huella de ${withDigest.length === release.assets.length ? 'todos los archivos' : `${withDigest.length} de ${release.assets.length} archivos`}. Sirve para comprobar que descargas exactamente ese archivo (integridad), no que sea inofensivo.`, source: release.url })
  else if (release.assets.length) signals.push({ id: 'digests', status: 'unknown', title: 'Sin huellas de GitHub', detail: 'Esta release no incluye huellas SHA-256 calculadas por GitHub (suele pasar en publicaciones antiguas).', source: release.url })

  const integrityFiles = release.assets.filter((asset) => INTEGRITY.test(asset.name))
  const signatureFiles = release.assets.filter((asset) => SIGNATURE.test(asset.name))
  if (integrityFiles.length || signatureFiles.length) {
    signals.push({ id: 'author-files', status: 'manual', title: 'El autor publica sumas o firmas', detail: `Archivos: ${[...integrityFiles, ...signatureFiles].map((asset) => asset.name).slice(0, 4).join(', ')}. Radar no los ha comprobado: verifícalos tú con las instrucciones del proyecto.`, source: release.url })
  }

  if (executables.length) {
    const checked = executables.filter((asset) => asset.digest && facts.attestations[asset.digest] !== undefined)
    const attested = checked.filter((asset) => (facts.attestations[asset.digest!] ?? 0) > 0)
    if (attested.length) {
      // Solo consta que GitHub guarda un registro para esa huella: su firma NO se ha
      // comprobado, así que no se presenta como señal verificada.
      signals.push({ id: 'provenance', status: 'manual', title: 'Atestación de procedencia registrada, firma NO verificada', detail: `GitHub tiene registrada una atestación para ${attested.map((asset) => asset.name).join(', ')} que afirma que el archivo se compiló en un flujo de este repositorio. Radar no ha comprobado su firma criptográfica, así que no la des por buena hasta verificarla tú con «gh attestation verify archivo -R ${fullName}». Incluso válida, solo indica de dónde viene el archivo, no que sea seguro.`, source: `${repoUrl}/attestations` })
    } else if (checked.length) {
      signals.push({ id: 'provenance', status: 'unknown', title: 'Sin atestación de procedencia', detail: 'No hay una atestación de GitHub para estos ejecutables, así que no se puede comprobar que se compilaran a partir de este código fuente.' })
    } else {
      signals.push({ id: 'provenance', status: 'unknown', title: 'Procedencia no comprobada', detail: 'No se ha podido consultar si los ejecutables tienen atestación de procedencia.' })
    }
    signals.push({ id: 'authenticode', status: 'manual', title: `${executables.length === 1 ? 'Ejecutable' : `${executables.length} ejecutables`} para Windows sin revisar`, detail: 'Radar no descarga ejecutables, así que no puede comprobar la firma digital de Windows (Authenticode) ni su contenido. Antes de abrirlo: mira Propiedades → Firmas digitales, compara la huella SHA-256 y, si quieres, busca la huella en un servicio de análisis.', source: release.url })
  }

  // 6. Prácticas evaluadas por OpenSSF Scorecard (si hay datos).
  if (facts.scorecard === 'none') {
    signals.push({ id: 'scorecard', status: 'unknown', title: 'Sin evaluación de OpenSSF Scorecard', detail: 'Scorecard no ha analizado este repositorio.', source: 'https://scorecard.dev/' })
  } else if (facts.scorecard) {
    const card = facts.scorecard
    for (const check of SCORECARD_CHECKS) {
      const score = card.checks[check.name]
      if (score === undefined || score < 0) continue
      const bad = score < (check.warnBelow ?? 5)
      signals.push({
        id: `scorecard-${check.name}`,
        status: bad ? (check.warnBelow ? 'warning' : 'manual') : 'verified',
        title: `${bad ? check.bad : check.good}`,
        detail: `Comprobación «${check.name}» de OpenSSF Scorecard (${score}/10, analizado el ${date(card.date)}). Evalúa prácticas del repositorio, no el contenido de los ejecutables.`,
        source: `https://scorecard.dev/viewer/?uri=github.com/${fullName}`,
      })
    }
  }
  return signals
}

/** Enlaces de consulta manual por huella (el usuario decide; no se sube ningún archivo). */
export function hashLookupLinks(digest: string) {
  const hash = digest.replace(/^sha256:/, '')
  return [
    { label: 'VirusTotal', url: `https://www.virustotal.com/gui/file/${hash}` },
    { label: 'MalwareBazaar', url: `https://bazaar.abuse.ch/browse.php?search=sha256%3A${hash}` },
  ]
}

/** Valida los hechos guardados (catálogo o caché local); null si no son utilizables. */
export function normalizeSecurity(value: unknown): SecurityFacts | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<SecurityFacts>
  if (typeof raw.checkedAt !== 'string' || !raw.repo || typeof raw.repo.createdAt !== 'string') return null
  const release = raw.release && typeof raw.release === 'object' && typeof raw.release.tag === 'string'
    ? { ...raw.release, assets: Array.isArray(raw.release.assets) ? raw.release.assets.filter((asset) => asset && typeof asset.name === 'string') : [] }
    : null
  return {
    checkedAt: raw.checkedAt,
    repo: raw.repo,
    release,
    releaseChecked: raw.releaseChecked === true,
    attestations: raw.attestations && typeof raw.attestations === 'object' ? raw.attestations : {},
    advisories: Array.isArray(raw.advisories) ? raw.advisories : null,
    scorecard: raw.scorecard === 'none' || (raw.scorecard && typeof raw.scorecard === 'object') ? raw.scorecard : null,
  }
}

/**
 * Única advertencia de seguridad que se muestra en la tarjeta: avisos publicados de gravedad
 * alta o crítica que la última versión no corrige con seguridad. Es un dato comprobado en
 * GitHub, no una valoración. Todo lo demás queda en la ficha.
 */
export function cardSecurityWarning(facts: SecurityFacts | null): string | null {
  if (!facts?.advisories?.length) return null
  const serious = facts.advisories.filter((advisory) => /^(critical|high)$/i.test(advisory.severity ?? '') && latestIsPatched(advisory, facts.release?.tag ?? null) !== true)
  if (!serious.length) return null
  return serious.length === 1 ? 'Aviso de seguridad grave' : `${serious.length} avisos de seguridad graves`
}
