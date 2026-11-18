import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'public/data/projects.json')
const api = 'https://api.github.com'
const queries = [
  '3ds homebrew',
  'nintendo 3ds',
  'dsi homebrew',
  'nds homebrew',
  'libnds',
  '3ds emulator',
  'nintendo ds game homebrew',
]

const categoryRules = [
  ['Herramientas para partidas guardadas', /\bsave\b|savedata|checkpoint|backup|restore|pkhex|pksm/i],
  ['Emuladores', /\bemulator\b|emulation|retroarch|virtual console/i],
  ['Multimedia', /\bmusic\b|audio|video|media|player|stream/i],
  ['Personalización', /\btheme\b|customiz|wallpaper|font|skin|appearance/i],
  ['Juegos homebrew', /\bgame\b|rpg|platformer|puzzle|arcade|adventure/i],
  ['Herramientas de desarrollo', /\bsdk\b|compiler|debug|development|devkit|toolchain|library|libnds/i],
  ['Aplicaciones y utilidades', /\btool\b|utility|utilities|manager|installer|browser|file.?manager/i],
]

function evidenceText(repo) {
  return [repo.name, repo.description, repo.full_name, ...(repo.topics ?? [])].filter(Boolean).join(' ').toLowerCase()
}

export function classifyConsoles(repo) {
  const text = evidenceText(repo)
  const consoles = []
  if (/\b3ds\b|3ds[-_ ]|new nintendo 3ds|nintendo 3ds/.test(text)) consoles.push('3DS')
  if (/\bdsi\b|dsi[-_ ]|nintendo dsi/.test(text)) consoles.push('DSi')
  if (/\bnds\b|nintendo ds|nitro.?ds|libnds|twl/.test(text)) consoles.push('DS')
  return consoles
}

export function classifyCategory(repo) {
  const text = evidenceText(repo)
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Otros proyectos interesantes'
}

export function scoreRepository(repo) {
  const reasons = []
  let score = 0
  const consoles = classifyConsoles(repo)
  if (consoles.length) {
    score += Math.min(35, 18 + consoles.length * 7)
    reasons.push(`Menciona compatibilidad con ${consoles.join(', ')} en sus metadatos.`)
  } else {
    score += 4
  }

  const daysSincePush = Math.max(0, (Date.now() - new Date(repo.pushed_at).getTime()) / 86_400_000)
  if (daysSincePush <= 30) { score += 20; reasons.push('Actividad detectada en los últimos 30 días.') }
  else if (daysSincePush <= 90) { score += 16; reasons.push('Actividad detectada en los últimos 3 meses.') }
  else if (daysSincePush <= 365) { score += 10; reasons.push('El repositorio tuvo actividad durante el último año.') }
  else if (daysSincePush <= 730) score += 4

  if (repo.has_readme) {
    score += repo.readme_quality ? 15 : 10
    reasons.push(repo.readme_quality ? 'README con contenido y secciones de documentación.' : 'Dispone de README en el repositorio.')
  } else reasons.push('Documentación no verificada.')

  if (repo.release) { score += 12; reasons.push(`Tiene una versión publicada: ${repo.release.tag_name}.`) }
  const stars = repo.stargazers_count ?? 0
  const popularity = Math.min(10, Math.round(Math.log10(stars + 1) * 4))
  score += popularity
  if (stars <= 100) { score += 8; reasons.push('Proyecto poco conocido: menos de 100 estrellas.') }
  else if (stars > 1000) reasons.push('Popularidad respaldada por más de 1.000 estrellas.')
  if ((repo.description ?? '').trim().length > 24) { score += 5; reasons.push('Descripción del proyecto disponible en GitHub.') }
  return { score: Math.min(100, Math.max(0, score)), reasons }
}

export function selectCandidates(repositories, limit = 25) {
  const recent = [...repositories].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
  const selected = new Map()
  for (const platform of ['DS', 'DSi', '3DS']) {
    for (const repo of recent.filter((item) => classifyConsoles(item).includes(platform)).slice(0, 8)) selected.set(repo.id, repo)
  }
  for (const repo of recent) {
    if (selected.size >= limit) break
    selected.set(repo.id, repo)
  }
  return [...selected.values()].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at)).slice(0, limit)
}

function isRelevant(repo) {
  const text = evidenceText(repo)
  return classifyConsoles(repo).length > 0 ||
    /\bhomebrew\b|nds-bootstrap|twilight.?menu|nds.?bootstrap|libnds|3dsx|\.cia\b|\bcia\b|\bfbi\b/i.test(text)
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function createLabels(repo, previous, generatedAt) {
  const labels = []
  const old = previous.get(repo.id)
  const pushed = Date.parse(repo.pushed_at)
  const generated = Date.parse(generatedAt)
  const created = Date.parse(repo.created_at)
  if (!old && created >= generated - 30 * 86_400_000) labels.push('Nuevo')
  const pushedForward = old?.pushedAt && pushed > Date.parse(old.pushedAt)
  const releasePublishedAt = repo.release?.published_at
  const releaseForward = releasePublishedAt && Date.parse(releasePublishedAt) > Date.parse(old?.releasePublishedAt ?? '')
  if (pushedForward || releaseForward) {
    labels.push('Actualizado')
    if (pushedForward && Date.now() - Date.parse(old.pushedAt) > 180 * 86_400_000) labels.push('Reactivado')
  }
  if (repo.stargazers_count < 100) labels.push('Poco conocido')
  return labels
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function request(path, token, { allowNotFound = false } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Homebrew-Radar' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${api}${path}`, { headers })
  if (allowNotFound && response.status === 404) return null
  if (!response.ok) {
    const reset = response.headers.get('x-ratelimit-reset')
    const resetHint = response.status === 403 && reset ? ` Límite disponible de nuevo: ${new Date(Number(reset) * 1000).toISOString()}.` : ''
    throw new Error(`GitHub API respondió ${response.status} para ${path}.${resetHint}`)
  }
  return response.json()
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function collect({ token = process.env.GITHUB_TOKEN, output = outputPath } = {}) {
  const oldFeed = await readPrevious()
  const previous = new Map((oldFeed?.projects ?? []).map((project) => [project.id, project]))
  const repositories = new Map()
  for (const [index, query] of queries.entries()) {
    const result = await request(`/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=25`, token)
    for (const repo of result.items ?? []) {
      if (!repo.fork && !repo.archived && repo.size > 0 && isRelevant(repo) && validDate(repo.pushed_at)) repositories.set(repo.id, repo)
    }
    if (index < queries.length - 1) await sleep(6100)
  }

  const candidates = selectCandidates(repositories.values())
  const enrichment = new Map()
  for (const repo of candidates) {
    const [readme, releases] = await Promise.all([
      request(`/repos/${repo.full_name}/readme`, token, { allowNotFound: true }),
      request(`/repos/${repo.full_name}/releases?per_page=1`, token),
    ])
    const readmeText = readme?.content ? Buffer.from(readme.content, readme.encoding || 'base64').toString('utf8') : ''
    const release = Array.isArray(releases) ? releases.find((item) => !item.draft && !item.prerelease) ?? null : null
    enrichment.set(repo.id, {
      has_readme: Boolean(readmeText),
      readme_quality: readmeText.length >= 500 && /^#{1,3}\s/m.test(readmeText),
      release,
    })
    await sleep(200)
  }

  const generatedAt = new Date().toISOString()
  const projects = candidates.map((repo) => {
    const extra = enrichment.get(repo.id) ?? { has_readme: false, readme_quality: false, release: null }
    const data = { ...repo, ...extra }
    const { score, reasons } = scoreRepository(data)
    const consoles = classifyConsoles(repo)
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description ?? '',
      url: repo.html_url,
      homepage: repo.homepage || null,
      stars: repo.stargazers_count,
      updatedAt: repo.updated_at,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      category: classifyCategory(repo),
      consoles,
      version: extra.release?.tag_name ?? null,
      releasePublishedAt: extra.release?.published_at ?? null,
      releaseUrl: extra.release?.html_url ?? null,
      score,
      reasons,
      labels: createLabels(repo, previous, generatedAt),
      language: repo.language ?? null,
      topics: repo.topics ?? [],
    }
  }).sort((a, b) => b.score - a.score || b.pushedAt.localeCompare(a.pushedAt))

  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify({ generatedAt, projects }, null, 2)}\n`)
  return { generatedAt, projects }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collect().then(({ projects }) => {
    console.log(`Catálogo actualizado: ${projects.length} proyectos válidos.`)
  }).catch((error) => {
    console.error(`Falló la recopilación: ${error.message}`)
    process.exitCode = 1
  })
}
