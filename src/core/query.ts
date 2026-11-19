// Intérprete de búsquedas en lenguaje natural basado en REGLAS Y PALABRAS CLAVE.
// No usa inteligencia artificial: traduce expresiones conocidas en español a
// términos y filtros de la API de búsqueda de GitHub, y deja el resto como texto libre.
import { isoDaysAgo, normalize } from './text.ts'

export type Concept = { id: string; label: string; triggers: RegExp; terms: string[]; channel?: string }

export type SortMode = 'interest' | 'gems' | 'recent' | 'stars' | 'new'

export type Interpretation = {
  original: string
  concepts: { id: string; label: string; terms: string[]; channel?: string }[]
  freeTerms: string[]
  maxStars: number | null
  minStars: number | null
  pushedWithinDays: number | null
  createdWithinDays: number | null
  language: string | null
  ownerType: 'User' | null
  sort: SortMode | null
  notes: string[]
}

// El orden importa: las expresiones más específicas van antes que las generales.
export const concepts: Concept[] = [
  { id: 'home-automation', label: 'domótica', triggers: /\b(domotica|casa inteligente|home assistant|hogar inteligente)\b/, terms: ['home-automation', 'home-assistant'] },
  { id: 'ai', label: 'inteligencia artificial', triggers: /\b(inteligencia artificial|ia|ai|machine learning|aprendizaje automatico|llms?|chatgpt|gpt|modelos? de lenguaje|redes neuronales)\b/, terms: ['ai', 'llm', 'machine-learning'], channel: 'ia' },
  { id: 'automation', label: 'automatización', triggers: /\b(automatizacion(es)?|automatizar|automatic[oa]s?|automation|flujos? de trabajo)\b/, terms: ['automation', 'workflow'], channel: 'automatizacion' },
  { id: 'emulators', label: 'emuladores', triggers: /\b(emuladore?s?|emulacion|emulators?)\b/, terms: ['emulator'], channel: 'emuladores' },
  { id: 'backup', label: 'copias de seguridad', triggers: /\b(copias? de seguridad|respaldos?|backups?)\b/, terms: ['backup'] },
  { id: 'terminal', label: 'terminal', triggers: /\b(terminal|linea de comandos|consola de comandos|cli)\b/, terms: ['cli', 'terminal'], channel: 'terminal' },
  { id: 'selfhosted', label: 'autoalojado', triggers: /\b(autoalojad[oa]s?|self ?hosted|servidor(es)? (propio|casero|domestico)s?|homelab)\b/, terms: ['self-hosted'], channel: 'self-hosted' },
  { id: 'windows', label: 'Windows', triggers: /\bwindows\b/, terms: ['windows'], channel: 'windows' },
  { id: 'macos', label: 'macOS', triggers: /\b(mac|macos|osx)\b/, terms: ['macos'] },
  { id: 'linux', label: 'Linux', triggers: /\blinux\b/, terms: ['linux'] },
  { id: 'android', label: 'Android', triggers: /\bandroid\b/, terms: ['android'] },
  { id: 'ios', label: 'iPhone / iOS', triggers: /\b(iphone|ipad|ios)\b/, terms: ['ios', 'iphone'], channel: 'ios' },
  { id: '3ds', label: 'Nintendo 3DS', triggers: /\b(nintendo )?(new )?3ds\b/, terms: ['3ds'], channel: 'nintendo' },
  { id: 'dsi', label: 'Nintendo DSi', triggers: /\b(nintendo )?dsi\b/, terms: ['dsi'], channel: 'nintendo' },
  { id: 'nds', label: 'Nintendo DS', triggers: /\b(nintendo ds|nds)\b/, terms: ['nds'], channel: 'nintendo' },
  { id: 'switch', label: 'Nintendo Switch', triggers: /\bnintendo switch\b/, terms: ['nintendo switch'] },
  { id: 'nintendo', label: 'Nintendo', triggers: /\bnintendo\b/, terms: ['nintendo'], channel: 'nintendo' },
  { id: 'homebrew', label: 'homebrew', triggers: /\bhomebrew\b/, terms: ['homebrew'] },
  { id: 'retro', label: 'retro', triggers: /\b(retro|retrogaming|consolas? antiguas?|clasicos)\b/, terms: ['retro'], channel: 'retro' },
  { id: 'modding', label: 'modificación', triggers: /\b(modificar|modificacion|modding|mods?|cfw|custom firmware|hackear)\b/, terms: ['modding', 'mod'] },
  { id: 'customize', label: 'personalización', triggers: /\b(personaliza\w*|customiza\w*|tematizar|temas visuales)\b/, terms: ['customization', 'theme'] },
  { id: 'consoles', label: 'consolas', triggers: /\b(videoconsolas?|consolas?)\b/, terms: ['console'] },
  { id: 'games', label: 'videojuegos', triggers: /\b(videojuegos?|juegos?|gaming|gamers?|jugar)\b/, terms: ['game', 'gaming'] },
  { id: 'collections', label: 'colecciones', triggers: /\b(coleccion(es)?|coleccionismo|catalogar|catalogo|inventario)\b/, terms: ['collection'] },
  { id: 'organize', label: 'organización', triggers: /\b(organizar|organizador(es)?|gestionar|gestor(es)?|administrar|ordenar)\b/, terms: ['manager', 'organizer'] },
  { id: 'files', label: 'archivos', triggers: /\b(archivos?|ficheros?|files?)\b/, terms: ['file'] },
  { id: 'analyze', label: 'análisis', triggers: /\b(analizar|analisis|analizador(es)?|inspeccionar|examinar)\b/, terms: ['analyzer', 'analysis'] },
  { id: 'productivity', label: 'productividad', triggers: /\b(productividad|tareas|to ?do)\b/, terms: ['productivity'] },
  { id: 'notes', label: 'notas', triggers: /\b(notas|apuntes)\b/, terms: ['notes'] },
  { id: 'privacy', label: 'privacidad', triggers: /\b(privacidad|anonimato|privacy)\b/, terms: ['privacy'] },
  { id: 'security', label: 'seguridad', triggers: /\b(seguridad|ciberseguridad|pentest\w*|hacking etico)\b/, terms: ['security'] },
  { id: 'download', label: 'descargas', triggers: /\b(descargas?|descargar|descargador(es)?|downloader)\b/, terms: ['downloader'] },
  { id: 'music', label: 'música y audio', triggers: /\b(musica|audio|sonido|podcasts?)\b/, terms: ['music', 'audio'] },
  { id: 'video', label: 'vídeo', triggers: /\b(video|videos|peliculas|streaming)\b/, terms: ['video'] },
  { id: 'images', label: 'imágenes', triggers: /\b(fotos?|fotografias?|imagen(es)?)\b/, terms: ['image', 'photo'] },
  { id: 'pdf', label: 'PDF', triggers: /\bpdf\b/, terms: ['pdf'] },
  { id: 'network', label: 'redes', triggers: /\b(redes?|wifi|network)\b/, terms: ['network'] },
  { id: 'browser', label: 'navegador', triggers: /\b(navegador(es)?|browser)\b/, terms: ['browser'] },
  { id: 'extension', label: 'extensiones', triggers: /\b(extension(es)?|plugins?|complementos?)\b/, terms: ['extension', 'plugin'] },
  { id: 'education', label: 'aprendizaje', triggers: /\b(aprender|educacion|educativ[oa]s?|estudiar)\b/, terms: ['education', 'learning'] },
  { id: '3dprint', label: 'impresión 3D', triggers: /\b(impresion 3d|impresora 3d|3d printing)\b/, terms: ['3d-printing'] },
  { id: 'translation', label: 'traducción', triggers: /\b(traduc\w+)\b/, terms: ['translation'] },
  { id: 'desktop', label: 'escritorio', triggers: /\bescritorio\b/, terms: ['desktop'] },
  { id: 'mobile', label: 'móvil', triggers: /\b(movil(es)?|smartphones?)\b/, terms: ['mobile'] },
]

const languages: Record<string, string> = {
  python: 'python', rust: 'rust', go: 'go', golang: 'go', javascript: 'javascript', typescript: 'typescript',
  java: 'java', kotlin: 'kotlin', swift: 'swift', 'c++': 'c++', 'c#': 'c#', csharp: 'c#', lua: 'lua',
  ruby: 'ruby', php: 'php', dart: 'dart', zig: 'zig',
}

const stopwords = new Set(('de del la las el los lo para con en y o u e que un una unos unas mi mis tu tus su sus por a al ' +
  'sobre como mas muy mejor mejores algo alguna algunas algun alguno algunos cosa cosas herramienta herramientas aplicacion ' +
  'aplicaciones app apps programa programas proyecto proyectos software utilidad utilidades tool tools gente quiero necesito busco ' +
  'buscar encontrar hay sirva sirvan sirve ayude ayuden permita permitan usar utilizar hacer mejorar experiencia tipo todo toda ' +
  'todos todas otro otros otra otras este esta estos estas cualquier desde entre segun sin solucion soluciones the for and of to ' +
  'with ver puedo pueda me te se le les nos hecho hechos hecha hechas desarrollado desarrollados desarrollada desarrolladas ' +
  'programadores desarrolladores creadores usuarios cosas dia dias').split(' '))

const modifiers: { pattern: RegExp; apply: (result: Interpretation) => void }[] = [
  {
    pattern: /\b(poco conocid[oa]s?|desconocid[oa]s?|joyas?( ocultas?)?|ocult[oa]s?|infravalorad[oa]s?|underrated|hidden gems?|minoritari[oa]s?|que nadie conoce)\b/g,
    apply: (r) => { r.maxStars = 400; r.minStars = 3; r.sort = 'gems'; r.notes.push('«Poco conocidos»: se limitan a 3–400 estrellas y se ordenan como joyas ocultas.') },
  },
  {
    pattern: /\b(populares?|famos[oa]s?|mas usad[oa]s|conocid[oa]s)\b/g,
    apply: (r) => { r.sort ??= 'stars'; r.notes.push('«Populares»: se ordenan por número de estrellas.') },
  },
  {
    pattern: /\b(nuev[oa]s?|recien (creados|creadas|publicad[oa]s)|novedades|new)\b/g,
    apply: (r) => { r.createdWithinDays = 180; r.sort ??= 'new'; r.notes.push('«Nuevos»: creados en los últimos 6 meses.') },
  },
  {
    pattern: /\b(recientes?|activ[oa]s?|actualizad[oa]s?|mantenid[oa]s?)\b/g,
    apply: (r) => { r.pushedWithinDays = 90; r.notes.push('«Activos»: con cambios en los últimos 3 meses.') },
  },
  {
    pattern: /\b(gratis|gratuit[oa]s?|libres?|de codigo abierto|codigo abierto|open source|opensource|free)\b/g,
    apply: (r) => { r.notes.push('Todos los resultados son repositorios públicos de código abierto; confirma la licencia de cada uno.') },
  },
  {
    pattern: /\b((desarrollad[oa]s?|hech[oa]s?|cread[oa]s?) por )?((programadores|desarrolladores|creadores|personas) )?(independientes|indie|individuales|aficionados)\b/g,
    apply: (r) => { r.ownerType = 'User'; r.notes.push('«Independientes»: solo cuentas personales, no organizaciones (filtro aplicado en el navegador).') },
  },
  {
    pattern: /\b(curios[oa]s?|interesantes?|originales?|utiles|util|raros?|sorprendentes?|chul[oa]s?)\b/g,
    apply: (r) => { r.sort ??= 'interest'; r.notes.push('«Interesantes/curiosos» no es un filtro: se ordena por la puntuación de interés.') },
  },
]

const languagePattern = /\b(?:en|con|escrit[oa]s? en|hech[oa]s? (?:en|con)|programad[oa]s? en)\s+(python|rust|golang|go|javascript|typescript|java|kotlin|swift|c\+\+|c#|csharp|lua|ruby|php|dart|zig)(?=\s|$)/

export function interpretQuery(input: string): Interpretation {
  const result: Interpretation = {
    original: input.trim(), concepts: [], freeTerms: [], maxStars: null, minStars: null,
    pushedWithinDays: null, createdWithinDays: null, language: null, ownerType: null, sort: null, notes: [],
  }
  let text = ` ${normalize(input)} `

  const language = text.match(languagePattern)
  if (language) {
    result.language = languages[language[1]]
    text = text.replace(language[0], ' ')
  }

  for (const modifier of modifiers) {
    if (modifier.pattern.test(text)) {
      modifier.apply(result)
      text = text.replace(modifier.pattern, ' ')
    }
    modifier.pattern.lastIndex = 0
  }

  for (const concept of concepts) {
    if (concept.triggers.test(text)) {
      result.concepts.push({ id: concept.id, label: concept.label, terms: concept.terms, channel: concept.channel })
      text = text.replace(new RegExp(concept.triggers.source, 'g'), ' ')
    }
  }

  for (const word of text.split(' ')) {
    if (word.length < 2 || stopwords.has(word) || result.freeTerms.includes(word)) continue
    if (!result.language && languages[word] && result.concepts.length + result.freeTerms.length > 0) {
      result.language = languages[word]
      continue
    }
    result.freeTerms.push(word)
  }
  return result
}

export function isEmptyInterpretation(interp: Interpretation) {
  return interp.concepts.length === 0 && interp.freeTerms.length === 0
}

function qualifiers(interp: Interpretation, now: number, includeArchived: boolean) {
  const parts: string[] = []
  if (interp.maxStars !== null) parts.push(`stars:${interp.minStars ?? 0}..${interp.maxStars}`)
  else if (interp.minStars !== null) parts.push(`stars:>=${interp.minStars}`)
  else if (interp.concepts.length > 0) parts.push('stars:>=2')
  if (interp.pushedWithinDays !== null) parts.push(`pushed:>${isoDaysAgo(interp.pushedWithinDays, now)}`)
  else if (interp.sort === 'gems') parts.push(`pushed:>${isoDaysAgo(365, now)}`)
  if (interp.createdWithinDays !== null) parts.push(`created:>${isoDaysAgo(interp.createdWithinDays, now)}`)
  if (interp.language) parts.push(`language:${interp.language.includes('+') || interp.language.includes('#') ? `"${interp.language}"` : interp.language}`)
  if (!includeArchived) parts.push('archived:false')
  return parts
}

/**
 * Devuelve la consulta principal para la API de búsqueda de GitHub y alternativas
 * cada vez más amplias que se prueban, en orden, si la anterior no da resultados.
 * Máximo 5 operadores OR por consulta (límite de GitHub).
 */
export function buildGithubQueries(interp: Interpretation, { now = Date.now(), includeArchived = false } = {}) {
  const extra = qualifiers(interp, now, includeArchived)
  const join = (terms: string[]) => [...terms, ...extra].join(' ').trim()
  if (isEmptyInterpretation(interp)) {
    const generic = ['tool', 'utility']
    const defaults = interp.maxStars === null ? ['stars:10..500', `pushed:>${isoDaysAgo(180, now)}`] : []
    return { primary: [generic.join(' OR '), ...defaults, ...extra].join(' '), fallbacks: [] as string[], generic: true }
  }
  if (interp.concepts.length === 1 && interp.freeTerms.length === 0) {
    const terms = interp.concepts[0].terms.slice(0, 3)
    return { primary: join([terms.join(' OR ')]), fallbacks: [] as string[], generic: false }
  }
  const conceptTerms = interp.concepts.map((concept) => concept.terms[0])
  const primary = join([...conceptTerms, ...interp.freeTerms])
  const candidates: string[] = []
  if (interp.freeTerms.length > 0 && conceptTerms.length > 0) candidates.push(join(conceptTerms))
  if (conceptTerms.length > 2) candidates.push(join(conceptTerms.slice(0, 2)))
  if (conceptTerms.length > 1) candidates.push(join([conceptTerms.slice(0, 6).join(' OR ')]))
  else if (interp.freeTerms.length > 1) candidates.push(join([interp.freeTerms.slice(0, 6).join(' OR ')]))
  const fallbacks = [...new Set(candidates)].filter((query) => query !== primary).slice(0, 2)
  return { primary, fallbacks, generic: false }
}

/** Texto en el que buscar coincidencias dentro del catálogo local. */
export type Matchable = { name: string; fullName: string; description: string; topics: string[]; category: string; channels: string[]; ownerType: string | null; language: string | null; pushedAt: string; createdAt: string; stars: number; summary?: { text: string } | null }

function containsWord(haystack: string, needle: string) {
  const term = normalize(needle)
  if (!term) return false
  return ` ${haystack} `.includes(` ${term} `) || (term.length >= 4 && haystack.includes(term))
}

/**
 * Relevancia de 0 a 1 de un proyecto del catálogo para una interpretación.
 * Devuelve 0 si no cumple todos los temas, términos libres y filtros.
 */
export function matchProject(project: Matchable, interp: Interpretation, now = Date.now()) {
  if (interp.ownerType && project.ownerType && project.ownerType !== interp.ownerType) return 0
  if (interp.language && normalize(project.language ?? '') !== normalize(interp.language)) return 0
  if (interp.maxStars !== null && (project.stars > interp.maxStars || project.stars < (interp.minStars ?? 0))) return 0
  if (interp.pushedWithinDays !== null && now - Date.parse(project.pushedAt) > interp.pushedWithinDays * 86_400_000) return 0
  if (interp.createdWithinDays !== null && now - Date.parse(project.createdAt) > interp.createdWithinDays * 86_400_000) return 0
  if (isEmptyInterpretation(interp)) return 0.5

  const haystack = normalize(`${project.name.replace(/[-_]/g, ' ')} ${project.fullName} ${project.description} ${project.topics.join(' ').replace(/-/g, ' ')} ${project.topics.join(' ')} ${project.category} ${project.summary?.text ?? ''}`)
  let hits = 0
  for (const concept of interp.concepts) {
    const byChannel = concept.channel ? project.channels.includes(concept.channel) : false
    const byTerm = concept.terms.some((term) => containsWord(haystack, term) || containsWord(haystack, term.replace(/-/g, ' ')))
    const original = concepts.find((item) => item.id === concept.id)
    const bySpanish = original ? original.triggers.test(haystack) : false
    if (!byChannel && !byTerm && !bySpanish) return 0
    hits += byTerm || bySpanish ? 1 : 0.8
  }
  for (const term of interp.freeTerms) {
    if (!haystack.includes(term)) return 0
    hits += containsWord(normalize(project.name.replace(/[-_]/g, ' ')), term) ? 1.2 : 1
  }
  return Math.min(1, 0.4 + (hits / (interp.concepts.length + interp.freeTerms.length)) * 0.6)
}

export function describeInterpretation(interp: Interpretation) {
  const parts: string[] = []
  if (interp.concepts.length) parts.push(`Temas: ${interp.concepts.map((concept) => concept.label).join(', ')}`)
  if (interp.freeTerms.length) parts.push(`Palabras: ${interp.freeTerms.join(', ')}`)
  if (interp.language) parts.push(`Lenguaje: ${interp.language}`)
  return parts.join(' · ') || 'Búsqueda genérica de herramientas y utilidades activas'
}
