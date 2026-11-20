import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessSecurity, cardSecurityWarning, compareVersions, executableAssets, hashLookupLinks, latestIsPatched, type SecurityFacts } from './security.ts'
import { fetchSecurityFacts, isStale } from './securityFetch.ts'

const NOW = Date.parse('2026-11-19T12:00:00Z')

// Metadatos reales consultados el 19/11/2026 (API de GitHub y OpenSSF Scorecard).
const cli: SecurityFacts = {
  checkedAt: '2026-11-19T11:00:00Z',
  repo: { createdAt: '2019-10-03T00:00:00Z', pushedAt: '2026-11-18T00:00:00Z', fork: false, archived: false, size: 50000, ownerType: 'Organization', ownerCreatedAt: '2019-09-01T00:00:00Z' },
  release: {
    tag: 'v2.105.0', url: 'https://github.com/cli/cli/releases/tag/v2.105.0', publishedAt: '2026-11-12T00:00:00Z', immutable: true,
    assets: [
      { name: 'gh_2.105.0_checksums.txt', size: 1971, digest: 'sha256:4597138ea96e474c68001370c0a4955ff4834ba603c53900de6ebbef4cb0bed9', url: 'u' },
      { name: 'gh_2.105.0_windows_amd64.msi', size: 15_000_000, digest: 'sha256:aaaa', url: 'u' },
      { name: 'gh_2.105.0_linux_386.deb', size: 14_167_374, digest: 'sha256:4835dbdbdcf8ba8bcb69515da797375d2eb955f824ebe686df8df07876a69fe8', url: 'u' },
    ],
  },
  releaseChecked: true,
  attestations: { 'sha256:aaaa': 2 },
  advisories: [{ id: 'GHSA-39wj-f2f4-978v', severity: 'medium', summary: 'GitHub CLI filesystem operations can write outside intended destination', url: 'https://github.com/cli/cli/security/advisories/GHSA-39wj-f2f4-978v', publishedAt: '2026-09-30T00:00:00Z', ranges: [{ package: 'github.com/cli/cli/v2', vulnerable: '<= v2.101.0', patched: 'v2.102.0' }] }],
  scorecard: { date: '2026-11-16', checks: { 'Dangerous-Workflow': 10, 'Binary-Artifacts': 9, 'Security-Policy': 10, 'Code-Review': 10, 'Signed-Releases': 0 } },
}

const lenovo: SecurityFacts = {
  checkedAt: '2026-11-19T11:00:00Z',
  repo: { createdAt: '2025-04-01T00:00:00Z', pushedAt: '2026-11-10T00:00:00Z', fork: false, archived: false, size: 9000, ownerType: 'Organization', ownerCreatedAt: '2025-03-20T00:00:00Z' },
  release: { tag: 'v2.36.0.0', url: 'https://github.com/LenovoLegionToolkit-Team/LenovoLegionToolkit/releases/tag/v2.36.0.0', publishedAt: '2026-11-01T00:00:00Z', immutable: false, assets: [{ name: 'LenovoLegionToolkitSetup-v2.36.0.0.exe', size: 18_815_824, digest: 'sha256:446f8bc434c6e4d270539b059d44e76e7a072535e41d84b470105dad8f486416', url: 'u' }] },
  releaseChecked: true,
  attestations: { 'sha256:446f8bc434c6e4d270539b059d44e76e7a072535e41d84b470105dad8f486416': 0 },
  advisories: [],
  scorecard: 'none',
}

const byId = (signals: ReturnType<typeof assessSecurity>, id: string) => signals.find((signal) => signal.id === id)
const FORBIDDEN = /100 ?%|libre de virus|sin virus|garantizad[ao]|es seguro|totalmente segur|certificad[ao] como segur/i

test('GitHub CLI: inmutabilidad y huellas verificadas, atestación con firma sin verificar; el aviso documentado no se oculta', () => {
  const signals = assessSecurity(cli, 'cli/cli', NOW)
  assert.equal(byId(signals, 'immutable')?.status, 'verified')
  assert.equal(byId(signals, 'digests')?.status, 'verified')
  const provenance = byId(signals, 'provenance')!
  assert.equal(provenance.status, 'manual', 'una atestación cuya firma no se ha comprobado nunca es «señal verificada»')
  assert.match(provenance.title, /firma NO verificada/)
  assert.equal(byId(signals, 'advisories')?.status, 'warning')
  assert.equal(byId(signals, 'authenticode')?.status, 'manual', 'la firma de Windows siempre requiere revisión manual')
  assert.equal(byId(signals, 'author-files')?.status, 'manual', 'los archivos de sumas se citan pero no se dan por buenos')
  assert.ok(signals.every((signal) => !FORBIDDEN.test(`${signal.title} ${signal.detail}`)))
})

test('LenovoLegionToolkit: ejecutable sin atestación ni release inmutable → revisión manual, sin inventar firmas', () => {
  const signals = assessSecurity(lenovo, 'LenovoLegionToolkit-Team/LenovoLegionToolkit', NOW)
  assert.equal(byId(signals, 'provenance')?.status, 'unknown')
  assert.equal(byId(signals, 'immutable')?.status, 'manual')
  assert.equal(byId(signals, 'author-files'), undefined, 'no hay archivos de firma: no se menciona ninguna')
  assert.equal(byId(signals, 'scorecard')?.status, 'unknown')
  assert.ok(!signals.some((signal) => signal.status === 'verified' && /firma|certificad/i.test(signal.title)))
})

test('la ausencia de avisos o de datos no genera advertencias falsas ni garantías', () => {
  const signals = assessSecurity(lenovo, 'x/y', NOW)
  const advisories = byId(signals, 'advisories')!
  assert.equal(advisories.status, 'unknown')
  assert.match(advisories.detail, /no significa que no existan vulnerabilidades/)
  const unknown = assessSecurity({ ...lenovo, advisories: null, scorecard: null, release: null, releaseChecked: false }, 'x/y', NOW)
  assert.ok(!unknown.some((signal) => signal.status === 'warning'), 'faltar información no es una advertencia')
  assert.equal(byId(unknown, 'release')?.status, 'unknown')
})

test('un proyecto desconocido y recién creado nunca aparece como fiable', () => {
  const fresh: SecurityFacts = { ...lenovo, repo: { ...lenovo.repo, createdAt: '2026-11-10T00:00:00Z', ownerCreatedAt: '2026-11-01T00:00:00Z', ownerType: 'User' } }
  const signals = assessSecurity(fresh, 'nuevo/tool', NOW)
  assert.equal(byId(signals, 'identity')?.status, 'manual')
  assert.match(byId(signals, 'identity')!.detail, /extrema la precaución/)
  const fork = assessSecurity({ ...lenovo, repo: { ...lenovo.repo, fork: true } }, 'copia/tool', NOW)
  assert.equal(byId(fork, 'fork')?.status, 'manual')
  const archived = assessSecurity({ ...lenovo, repo: { ...lenovo.repo, archived: true } }, 'viejo/tool', NOW)
  assert.equal(byId(archived, 'maintenance')?.status, 'warning')
})

test('la popularidad no interviene: las señales solo dependen de los hechos de seguridad', () => {
  // assessSecurity no recibe estrellas ni descargas; el mismo repositorio da las mismas señales.
  assert.deepEqual(assessSecurity(lenovo, 'a/b', NOW), assessSecurity(structuredClone(lenovo), 'a/b', NOW))
  assert.ok(!Object.keys(lenovo.repo).some((key) => /star|download|fork_count|watch/i.test(key)), 'los hechos no incluyen popularidad')
})

test('sin releases: no se habla de ejecutables y se pide revisión manual', () => {
  const signals = assessSecurity({ ...lenovo, release: null }, 'a/b', NOW)
  assert.equal(byId(signals, 'release')?.status, 'manual')
  assert.equal(byId(signals, 'authenticode'), undefined)
})

test('versiones: compara solo formatos numéricos y dice cuándo la última está corregida', () => {
  assert.equal(compareVersions('v2.105.0', 'v2.102.0'), 1)
  assert.equal(compareVersions('3.2.4.3', '3.2.4.3'), 0)
  assert.equal(compareVersions('1.0-beta', '1.0'), null)
  assert.equal(latestIsPatched(cli.advisories![0], 'v2.105.0'), true)
  assert.equal(latestIsPatched(cli.advisories![0], 'v2.100.0'), false)
  assert.equal(latestIsPatched({ ...cli.advisories![0], ranges: [{ package: null, vulnerable: '< 0.21.3', patched: null }] }, 'v1'), null)
})

test('detecta ejecutables por nombre y ofrece búsquedas por huella sin subir archivos', () => {
  assert.deepEqual(executableAssets(cli.release!.assets).map((asset) => asset.name), ['gh_2.105.0_windows_amd64.msi'])
  assert.deepEqual(executableAssets([{ name: 'App-win-x64.zip', size: 1, digest: null, url: '' }, { name: 'app-linux.tar.gz', size: 1, digest: null, url: '' }]).map((asset) => asset.name), ['App-win-x64.zip'])
  const links = hashLookupLinks('sha256:abc123')
  assert.ok(links.every((link) => link.url.includes('abc123') && !/upload/i.test(link.url)))
})

test('consulta solo metadatos JSON, limita atestaciones y tolera fallos parciales', async () => {
  const calls: string[] = []
  const exe = (index: number) => ({ name: `setup-${index}.exe`, size: 10, digest: `sha256:${index}`, browser_download_url: `https://github.com/a/b/releases/download/v1/setup-${index}.exe` })
  const github = async (path: string) => {
    calls.push(path)
    if (path === '/repos/a/b') return { created_at: '2024-01-01T00:00:00Z', pushed_at: '2026-11-01T00:00:00Z', fork: false, archived: false, size: 10, owner: { login: 'a', type: 'User' } }
    if (path === '/users/a') return { created_at: '2020-01-01T00:00:00Z' }
    if (path.endsWith('/releases/latest')) return { tag_name: 'v1', html_url: 'h', published_at: '2026-10-01T00:00:00Z', immutable: false, assets: [1, 2, 3, 4, 5].map(exe) }
    if (path.includes('/security-advisories')) throw new Error('fallo temporal')
    if (path.includes('/attestations/sha256:1')) return { attestations: [{}] }
    return null
  }
  const facts = await fetchSecurityFacts('a/b', { github, external: async () => null, now: NOW })
  assert.equal(calls.filter((path) => path.includes('/attestations/')).length, 3, 'máximo 3 atestaciones por release')
  assert.ok(calls.every((path) => !path.includes('/releases/download/')), 'nunca se descargan los archivos publicados')
  assert.deepEqual(facts.attestations, { 'sha256:1': 1, 'sha256:2': 0, 'sha256:3': 0 })
  assert.equal(facts.advisories, null, 'un fallo se registra como «no consultado», no como «sin avisos»')
  assert.equal(facts.scorecard, 'none')
  assert.equal(byId(assessSecurity(facts, 'a/b', NOW), 'advisories')?.status, 'unknown')
})

test('caché: se vuelve a comprobar si cambia la release o pasan 14 días', () => {
  assert.equal(isStale(cli, 'v2.105.0', NOW), false)
  assert.equal(isStale(cli, 'v2.106.0', NOW), true)
  assert.equal(isStale(cli, 'v2.105.0', NOW + 15 * 86_400_000), true)
  assert.equal(isStale(null, null, NOW), true)
})

test('los comprimidos de Linux o macOS no cuentan como ejecutables de Windows (caso real: YoutubeDownloader)', () => {
  const names = ['YoutubeDownloader.linux-x64.zip', 'YoutubeDownloader.osx-x64.zip', 'YoutubeDownloader.win-arm64.zip', 'YoutubeDownloader.win-x64.zip', 'YoutubeDownloader.win-x86.zip', 'Setup.exe']
  const found = executableAssets(names.map((name) => ({ name, size: 1, digest: null, url: '' }))).map((asset) => asset.name)
  assert.deepEqual(found, ['Setup.exe', 'YoutubeDownloader.win-arm64.zip', 'YoutubeDownloader.win-x64.zip', 'YoutubeDownloader.win-x86.zip'], 'el instalador directo se consulta primero')
})

test('la tarjeta solo avisa de avisos graves sin versión corregida confirmada', () => {
  const advisory = (severity: string, patched: string | null) => ({ id: 'GHSA-x', severity, summary: 's', url: 'u', publishedAt: null, ranges: [{ package: null, vulnerable: '< 9', patched }] })
  assert.equal(cardSecurityWarning(null), null)
  assert.equal(cardSecurityWarning({ ...lenovo, advisories: [] }), null)
  assert.equal(cardSecurityWarning({ ...lenovo, advisories: [advisory('low', null)] }), null)
  assert.equal(cardSecurityWarning({ ...lenovo, advisories: [advisory('high', '2.0.0')] }), null)
  assert.equal(cardSecurityWarning({ ...lenovo, advisories: [advisory('critical', '9.0.0')] }), 'Aviso de seguridad grave')
  assert.equal(cardSecurityWarning({ ...lenovo, advisories: [advisory('high', null), advisory('critical', null)] }), '2 avisos de seguridad graves')
})
