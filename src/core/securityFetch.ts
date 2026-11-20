// Obtención de los hechos de seguridad mediante APIs oficiales (solo metadatos JSON).
// La función de red se inyecta: el navegador la usa sin credenciales y GitHub Actions
// con su token temporal. Nunca se descarga un archivo publicado ni se ejecuta nada.
import { executableAssets, type Advisory, type ReleaseAsset, type SecurityFacts } from './security.ts'

/** GET a la API de GitHub (ruta relativa). Devuelve null si es 404. */
export type GithubGet = (path: string) => Promise<unknown | null>
/** GET a una URL externa pública (Scorecard). Devuelve null si es 404. */
export type ExternalGet = (url: string) => Promise<unknown | null>

/** Máximo de ejecutables por release cuyas atestaciones se consultan (limita peticiones). */
export const MAX_ATTESTATION_CHECKS = 3

type RawRelease = { tag_name: string; html_url: string; published_at: string | null; immutable?: boolean; draft?: boolean; prerelease?: boolean; assets?: { name: string; size: number; digest?: string | null; browser_download_url: string }[] }
type RawRepo = { created_at: string; pushed_at: string; fork: boolean; archived: boolean; size?: number; owner?: { login: string; type?: string } }

export function releaseFromRaw(raw: RawRelease | null) {
  if (!raw || raw.draft || raw.prerelease) return null
  const assets: ReleaseAsset[] = (raw.assets ?? []).map((asset) => ({ name: asset.name, size: asset.size, digest: asset.digest ?? null, url: asset.browser_download_url }))
  return { tag: raw.tag_name, url: raw.html_url, publishedAt: raw.published_at, immutable: typeof raw.immutable === 'boolean' ? raw.immutable : null, assets }
}

export function advisoriesFromRaw(raw: unknown): Advisory[] | null {
  if (!Array.isArray(raw)) return null
  return raw.slice(0, 20).map((item: Record<string, unknown>) => ({
    id: String(item.ghsa_id ?? ''),
    severity: typeof item.severity === 'string' ? item.severity : null,
    summary: String(item.summary ?? ''),
    url: String(item.html_url ?? `https://github.com/advisories/${item.ghsa_id}`),
    publishedAt: typeof item.published_at === 'string' ? item.published_at : null,
    ranges: (Array.isArray(item.vulnerabilities) ? item.vulnerabilities : []).slice(0, 5).map((vulnerability: Record<string, unknown>) => ({
      package: typeof (vulnerability.package as Record<string, unknown> | undefined)?.name === 'string' ? (vulnerability.package as Record<string, string>).name : null,
      vulnerable: typeof vulnerability.vulnerable_version_range === 'string' ? vulnerability.vulnerable_version_range : null,
      patched: typeof vulnerability.patched_versions === 'string' ? vulnerability.patched_versions : null,
    })),
  }))
}

export function scorecardFromRaw(raw: unknown): SecurityFacts['scorecard'] {
  if (raw === null) return 'none'
  const value = raw as { date?: string; checks?: { name: string; score: number }[] }
  if (!value || !Array.isArray(value.checks)) return null
  return { date: value.date ?? '', checks: Object.fromEntries(value.checks.map((check) => [check.name, check.score])) }
}

/**
 * Consulta los hechos de seguridad de un repositorio. Peticiones a GitHub: repositorio
 * (si no se aporta), cuenta del autor, release, avisos y hasta 3 atestaciones; más una a
 * Scorecard. Si se aportan `repo` o `release` ya obtenidos (p. ej. en la recopilación),
 * no se repiten.
 */
export async function fetchSecurityFacts(fullName: string, { github, external, repo, release, ownerCreatedAt, now = Date.now() }: {
  github: GithubGet
  external: ExternalGet
  repo?: RawRepo
  release?: RawRelease | null
  ownerCreatedAt?: string | null
  now?: number
}): Promise<SecurityFacts> {
  const safe = async <T>(promise: Promise<T>): Promise<T | undefined> => { try { return await promise } catch { return undefined } }
  const repoData = repo ?? ((await github(`/repos/${fullName}`)) as RawRepo | null)
  if (!repoData) throw new Error(`No se encontró el repositorio ${fullName}.`)
  const owner = repoData.owner?.login ?? fullName.split('/')[0]
  const [ownerData, releaseData, advisoriesRaw, scorecardRaw] = await Promise.all([
    ownerCreatedAt !== undefined ? Promise.resolve({ created_at: ownerCreatedAt }) : safe(github(`/users/${owner}`) as Promise<{ created_at?: string } | null>),
    release !== undefined ? Promise.resolve(release) : safe(github(`/repos/${fullName}/releases/latest`) as Promise<RawRelease | null>),
    safe(github(`/repos/${fullName}/security-advisories?state=published&per_page=20`)),
    safe(external(`https://api.securityscorecards.dev/projects/github.com/${fullName}`)),
  ])
  const parsedRelease = releaseData === undefined ? undefined : releaseFromRaw(releaseData)
  const attestations: Record<string, number> = {}
  if (parsedRelease) {
    for (const asset of executableAssets(parsedRelease.assets).filter((item) => item.digest).slice(0, MAX_ATTESTATION_CHECKS)) {
      const result = await safe(github(`/repos/${fullName}/attestations/${asset.digest}`) as Promise<{ attestations?: unknown[] } | null>)
      if (result === undefined) continue
      attestations[asset.digest!] = result?.attestations?.length ?? 0
    }
  }
  return {
    checkedAt: new Date(now).toISOString(),
    repo: {
      createdAt: repoData.created_at, pushedAt: repoData.pushed_at, fork: Boolean(repoData.fork), archived: Boolean(repoData.archived),
      size: typeof repoData.size === 'number' ? repoData.size : null, ownerType: repoData.owner?.type ?? null,
      ownerCreatedAt: (ownerData as { created_at?: string } | null | undefined)?.created_at ?? null,
    },
    release: parsedRelease ?? null,
    releaseChecked: parsedRelease !== undefined,
    attestations,
    advisories: advisoriesRaw === undefined ? null : advisoriesFromRaw(advisoriesRaw ?? []),
    scorecard: scorecardRaw === undefined ? null : scorecardFromRaw(scorecardRaw),
  }
}

/** ¿Hay que volver a comprobar? Si cambió la release o pasaron más de `maxAgeDays`. */
export function isStale(facts: SecurityFacts | null | undefined, latestTag: string | null, now = Date.now(), maxAgeDays = 14) {
  if (!facts) return true
  if ((facts.release?.tag ?? null) !== latestTag) return true
  return now - Date.parse(facts.checkedAt) > maxAgeDays * 86_400_000
}
