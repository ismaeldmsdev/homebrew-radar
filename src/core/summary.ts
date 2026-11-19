// Resúmenes en español de cada proyecto. Funciones puras compartidas por la web,
// el recopilador y los scripts de resúmenes (Node).
//
// Origen de un resumen:
// · «curated»: redactado con IA a partir del README y la descripción, revisado y guardado
//   en data/summaries.json (caché versionada en el repositorio).
// · «llm»: generado automáticamente por un proveedor configurado (opcional, sin revisar).
// · «rules»: descripción básica construida solo con metadatos verificables. No inventa:
//   cuando faltan datos lo dice.

export const KIND_LABELS = {
  app: 'Aplicación lista para usar',
  selfhosted: 'Autoalojado',
  config: 'Requiere configuración',
  cli: 'Línea de comandos',
  library: 'Biblioteca para programadores',
  plugin: 'Complemento',
  experimental: 'Experimental',
  list: 'Lista de recursos',
} as const

export type ProjectKind = keyof typeof KIND_LABELS
export const PROJECT_KINDS = Object.keys(KIND_LABELS) as ProjectKind[]

export const KIND_HELP: Record<ProjectKind, string> = {
  app: 'Se descarga o instala y se usa directamente, sin programar.',
  selfhosted: 'Se instala en tu propio ordenador o servidor (a menudo con Docker) y se usa desde el navegador.',
  config: 'Hace falta preparar algo antes de usarlo: claves, cuentas, archivos de configuración o un servidor.',
  cli: 'Se usa escribiendo órdenes en la terminal, no tiene ventanas ni botones.',
  library: 'Es una pieza de código para incluir en otros programas: está pensada para programadores.',
  plugin: 'Funciona dentro de otro programa (un navegador, un editor, un juego…), no por separado.',
  experimental: 'Sus autores lo presentan como prototipo, versión temprana o prueba: puede fallar o cambiar.',
  list: 'Es una recopilación de enlaces y recursos, no un programa.',
}

export type SummaryOrigin = 'curated' | 'llm' | 'rules'

export type Summary = {
  /** 2-3 frases: qué es, qué permite hacer y para qué te puede servir. */
  text: string
  /** Detalles adicionales para la ficha (funciones concretas del README). */
  detail: string | null
  kinds: ProjectKind[]
  origin: SummaryOrigin
  /** true si faltan datos para explicar con fiabilidad qué hace. */
  limited: boolean
  /** true si la descripción o el README cambiaron desde que se redactó. */
  outdated: boolean
  updatedAt: string | null
  /** Modelo que lo generó automáticamente (solo origen «llm»). */
  generator: string | null
}

/** Huella de la documentación sobre la que se redactó un resumen. */
export type SummaryBasis = { description: string; readmeLength: number | null }

export type StoredSummary = {
  id: number
  fullName: string
  text: string
  detail?: string | null
  kinds: ProjectKind[]
  origin: 'curated' | 'llm'
  /** Huella reproducible del generador automático: modelo, llama.cpp y versión del prompt. */
  generator?: { model: string; file?: string; llamaCpp: string; promptVersion: string }
  limited?: boolean
  basis: SummaryBasis
  updatedAt: string
}

export type SummaryStore = { version: 1; summaries: Record<string, StoredSummary> }

type Evidence = {
  name: string
  description?: string | null
  topics?: string[]
  language?: string | null
  category?: string
  isList?: boolean
  readme?: string | null
}

/** Hash corto y estable (FNV-1a) para detectar cambios en la descripción. */
export function shortHash(value: string) {
  let hash = 0x811c9dc5
  for (const char of value.trim().replace(/\s+/g, ' ')) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/** Texto legible de un README: sin insignias, HTML, bloques de código ni tablas. */
export function cleanReadme(markdown: string, max = 4000) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
    .replace(/&nbsp;|&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, max)
}

const has = (text: string, pattern: RegExp) => pattern.test(text)

/** Tipo de proyecto deducido de metadatos y README. Conservador: sin evidencia, no se marca. */
export function inferKinds(evidence: Evidence): ProjectKind[] {
  const topics = (evidence.topics ?? []).map((topic) => topic.toLowerCase())
  const meta = `${evidence.name} ${evidence.description ?? ''} ${topics.join(' ')}`.toLowerCase()
  const readme = (evidence.readme ?? '').toLowerCase()
  const kinds = new Set<ProjectKind>()
  if (evidence.isList || evidence.category === 'Lista de recursos') return ['list']
  if (has(meta, /\bself-?hosted\b|\bselfhosted\b|\bhomelab\b/)) kinds.add('selfhosted')
  if (has(meta, /\bcli\b|command[- ]line|\bterminal\b|\btui\b/) || topics.includes('cli')) kinds.add('cli')
  if (has(meta, /\blibrary\b|\bsdk\b|\bframework\b|\bcrate\b|\bnpm package\b|\bpython package\b|\bbindings?\b/)) kinds.add('library')
  if (has(meta, /\bplugin\b|\bextension\b|\badd-?on\b|\bmod\b|\bmcp server\b|\bvs ?code\b|\bobsidian plugin\b/)) kinds.add('plugin')
  if (has(meta, /\bexperimental\b|\bprototype\b|\bproof[- ]of[- ]concept\b|\bpoc\b|\bwork in progress\b|\bwip\b|\balpha\b/) ||
    has(readme, /\b(this|the) (project|app|tool) is (still )?(experimental|in (early )?(alpha|development))|work in progress|proof of concept/)) kinds.add('experimental')
  if (has(readme, /docker[- ]compose|docker run\b/) && kinds.has('selfhosted')) kinds.add('config')
  if (has(readme, /\bapi[_ ]key\b|\.env\b|environment variables?|config(uration)? file/)) kinds.add('config')
  return PROJECT_KINDS.filter((kind) => kinds.has(kind))
}

const categoryPhrase: Record<string, string> = {
  'Inteligencia artificial': 'relacionado con la inteligencia artificial',
  Emuladores: 'relacionado con la emulación de consolas u ordenadores',
  Automatización: 'para automatizar tareas',
  Juegos: 'relacionado con videojuegos',
  'Juegos homebrew': 'de juegos caseros (homebrew) para consolas de Nintendo',
  Multimedia: 'relacionado con música, vídeo o imágenes',
  'Herramientas de terminal': 'para la terminal',
  'Productividad y organización': 'de productividad y organización',
  'Archivos y datos': 'para trabajar con archivos y datos',
  'Seguridad y privacidad': 'relacionado con la seguridad y la privacidad',
  Personalización: 'de personalización',
  'Redes y servidores': 'de redes y servidores',
  'Herramientas de desarrollo': 'para programadores',
  'Aplicaciones y utilidades': 'de aplicaciones y utilidades',
  'Herramientas para partidas guardadas': 'para gestionar partidas guardadas de consolas de Nintendo',
  'Lista de recursos': 'que recopila enlaces y recursos',
}

const kindPhrase: Record<ProjectKind, string> = {
  app: 'una aplicación',
  selfhosted: 'una aplicación para instalar en tu propio servidor',
  config: 'una herramienta que requiere configuración',
  cli: 'un programa de línea de comandos',
  library: 'una biblioteca para programadores',
  plugin: 'un complemento para otro programa',
  experimental: 'un proyecto experimental',
  list: 'una lista de recursos',
}

/** Descripción básica y honesta en español a partir de metadatos verificables. */
export function fallbackSummary(project: Evidence & { consoles?: string[] }): Summary {
  const kinds = inferKinds(project)
  const description = (project.description ?? '').trim()
  const about = project.category ? categoryPhrase[project.category] : undefined
  const mainKind = kinds.find((kind) => kind !== 'config' && kind !== 'experimental')
  const parts: string[] = []
  const what = [about, project.language ? `escrito en ${project.language}` : null].filter(Boolean).join(', ')
  parts.push(`Proyecto${what ? ` ${what}` : ' sin categoría clara'}.`)
  if (mainKind) parts.push(`Por sus etiquetas, parece ${kindPhrase[mainKind]}${kinds.includes('experimental') ? ' en fase experimental' : ''}.`)
  if (project.consoles?.length) parts.push(`Sus metadatos mencionan ${project.consoles.map((name) => `Nintendo ${name}`).join(', ')}.`)
  parts.push(description.length >= 20
    ? 'Todavía no hay un resumen en español verificado: abajo tienes la descripción original del autor.'
    : 'El autor apenas describe el proyecto, así que faltan datos para explicar qué hace sin abrir GitHub.')
  return { text: parts.join(' '), detail: null, kinds, origin: 'rules', limited: true, outdated: false, updatedAt: null, generator: null }
}

/** ¿Ha cambiado la documentación lo bastante como para revisar el resumen? */
export function isOutdated(basis: SummaryBasis | undefined, description: string, readmeLength: number | null) {
  if (!basis) return false
  if (basis.description !== shortHash(description)) return true
  if (basis.readmeLength && readmeLength) {
    const change = Math.abs(readmeLength - basis.readmeLength) / basis.readmeLength
    return change > 0.5 && Math.abs(readmeLength - basis.readmeLength) > 800
  }
  return false
}

export function fromStore(entry: StoredSummary, description: string, readmeLength: number | null = null): Summary {
  return {
    text: entry.text,
    detail: entry.detail ?? null,
    kinds: entry.kinds.filter((kind) => kind in KIND_LABELS),
    origin: entry.origin,
    limited: Boolean(entry.limited),
    outdated: isOutdated(entry.basis, description, readmeLength),
    updatedAt: entry.updatedAt,
    generator: entry.generator?.model ?? null,
  }
}

const SPANISH = /\b(el|la|los|las|de|del|que|para|con|una?|es|en|por|sus?|tu|te|permite|sirve|puedes)\b/g
const ENGLISH = /\b(the|and|with|for|your|you|this|that|is|are|of|to|it|allows|lets|which)\b/g
const GENERIC = [
  /herramienta de c[oó]digo abierto para mejorar la productividad/i,
  /\b(potente|revolucionari[oa]|incre[ií]ble|de [uú]ltima generaci[oó]n|todo en uno)\b/i,
  /\bf[aá]cil(es)? de (instalar|usar|utilizar)\b|\bsencill[oa] de (instalar|usar)\b/i,
]

/** Problemas de calidad de un resumen; lista vacía = válido. */
export function summaryProblems(text: string, kinds: string[] = []) {
  const problems: string[] = []
  const clean = text.trim()
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«(])/).filter((sentence) => sentence.trim().length > 0)
  if (sentences.length < 2 || sentences.length > 3) problems.push(`Debe tener 2 o 3 frases (tiene ${sentences.length}).`)
  if (clean.length < 110 || clean.length > 480) problems.push(`Longitud fuera de rango (${clean.length} caracteres).`)
  if (!/[.!?]$/.test(clean)) problems.push('Debe terminar en punto.')
  const spanish = clean.toLowerCase().match(SPANISH)?.length ?? 0
  const english = clean.toLowerCase().match(ENGLISH)?.length ?? 0
  if (spanish < 6 || english > spanish / 4) problems.push('No parece estar redactado en español.')
  for (const pattern of GENERIC) if (pattern.test(clean)) problems.push(`Frase genérica o sin pruebas: ${pattern.source}`)
  for (const kind of kinds) if (!(kind in KIND_LABELS)) problems.push(`Tipo desconocido: ${kind}`)
  return problems
}

export function normalizeSummary(value: unknown): Summary | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null
  const origin = raw.origin === 'curated' || raw.origin === 'llm' ? raw.origin : 'rules'
  return {
    text: raw.text,
    detail: typeof raw.detail === 'string' && raw.detail ? raw.detail : null,
    kinds: Array.isArray(raw.kinds) ? raw.kinds.filter((kind): kind is ProjectKind => typeof kind === 'string' && kind in KIND_LABELS) : [],
    origin,
    limited: raw.limited === true,
    outdated: raw.outdated === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    generator: typeof raw.generator === 'string' ? raw.generator : null,
  }
}

/** Entrada de la caché pública compacta (public/data/summaries.json). */
export type CompactSummary = { t: string; d: string | null; k: string[]; o: 'curated' | 'llm'; l: 0 | 1; h: string; u: string; g?: string }

export function fromCompact(entry: CompactSummary, description: string): Summary | null {
  if (!entry || typeof entry.t !== 'string') return null
  return normalizeSummary({
    text: entry.t, detail: entry.d, kinds: entry.k, origin: entry.o, limited: entry.l === 1,
    outdated: entry.h !== shortHash(description), updatedAt: entry.u, generator: entry.g ?? null,
  })
}
