// Intérprete de búsquedas en lenguaje natural basado en REGLAS Y PALABRAS CLAVE.
// No usa inteligencia artificial: traduce expresiones conocidas en español a
// términos y filtros de la API de búsqueda de GitHub, y deja el resto como texto libre.
import { isoDaysAgo, normalize } from './text.ts'
import { detectPlatforms, isOtherPlatformTarget, looksLikePiracy, PLATFORMS } from './consoles.ts'
import { inferKinds } from './summary.ts'

/**
 * soft: no es obligatorio que el proyecto lo cumpla (verbos genéricos como «organizar»).
 * platform: plataforma de consola; se comprueba con la detección de plataformas.
 * negative: si la documentación encaja con este patrón, el concepto NO se cumple
 * (p. ej. «terminal emulator» no es un emulador de consolas).
 */
export type Concept = { id: string; label: string; triggers: RegExp; terms: string[]; channel?: string; soft?: boolean; platform?: string; negative?: RegExp; summaryTriggers?: RegExp }

export type SortMode = 'interest' | 'gems' | 'recent' | 'stars' | 'new'

export type Interpretation = {
  original: string
  concepts: { id: string; label: string; terms: string[]; channel?: string; soft?: boolean; platform?: string }[]
  freeTerms: string[]
  /** Términos libres que parecen palabras españolas sin traducción: no se exigen ni se envían a GitHub. */
  softTerms: string[]
  /** Tipo de proyecto pedido explícitamente («aplicación», «biblioteca»…). */
  kind: 'app' | 'library' | 'cli' | null
  maxStars: number | null
  minStars: number | null
  pushedWithinDays: number | null
  createdWithinDays: number | null
  language: string | null
  ownerType: 'User' | null
  sort: SortMode | null
  notes: string[]
}

const NINTENDO_DS_FAMILY = ['nds', 'dsi', '3ds']

// El orden importa: las expresiones más específicas van antes que las generales.
export const concepts: Concept[] = [
  { id: 'home-automation', label: 'domótica', triggers: /\b(domotica|casa inteligente|home assistant|hogar inteligente)\b/, terms: ['home-automation', 'home-assistant'] },
  { id: 'ai', label: 'inteligencia artificial', triggers: /\b(inteligencia artificial|ia|ai|machine learning|aprendizaje automatico|llms?|chatgpt|gpt|modelos? de lenguaje|redes neuronales)\b/, terms: ['ai', 'llm', 'machine-learning'], channel: 'ia' },
  { id: 'browser-automation', label: 'automatizar el navegador', triggers: /\b(automatiza\w* (tareas )?(en (el )?|del |el )?(navegador|web)|navegador automatico|web scraping|scraping|extraer datos de (la )?web)\b/, terms: ['browser-automation', 'playwright', 'puppeteer', 'selenium', 'scraper'] },
  { id: 'automation', label: 'automatización', triggers: /\b(automatizacion(es)?|automatizar|automatic[oa]s?|automation|flujos? de trabajo)\b/, terms: ['automation', 'workflow'], channel: 'automatizacion' },
  // Consolas: plataformas concretas antes que «Nintendo» o «consolas» en general.
  ...PLATFORMS.map((platform): Concept => ({
    id: platform.id, label: platform.label, triggers: platform.query, terms: platform.terms, platform: platform.id,
    channel: NINTENDO_DS_FAMILY.includes(platform.id) ? 'nintendo' : undefined,
  })),
  { id: 'cfw', label: 'CFW y jailbreak', triggers: /\b(cfw|custom firmware|firmware (personalizado|modificado|custom)|jailbreak|liberar|liberacion|liberad[ao]s?|softmod|hackear|desbloquear)\b/, terms: ['custom-firmware', 'jailbreak', 'cfw'] },
  { id: 'exploit', label: 'exploits', triggers: /\b(exploits?|vulnerabilidad(es)?|payloads?)\b/, terms: ['exploit', 'payload'] },
  { id: 'saves', label: 'partidas guardadas', triggers: /\b(partidas? guardadas?|guardados|savegames?|saves?|editor(es)? de partidas)\b/, terms: ['save', 'savegame', 'save-manager', 'save-editor', 'checkpoint'] },
  { id: 'storage', label: 'tarjeta SD y almacenamiento', triggers: /\b(tarjetas? (sd|micro ?sd)|micro ?sd|almacenamiento|disco duro|particion(es)?)\b/, terms: ['sd-card', 'sd', 'storage', 'fat32'] },
  { id: 'maintenance', label: 'mantenimiento y diagnóstico', triggers: /\b(mantenimiento|diagnostic[oa]s?|reparar|nand|brick(ead[ao])?)\b/, terms: ['nand', 'diagnostic', 'maintenance', 'recovery'] },
  { id: 'emulators', label: 'emuladores', triggers: /\b(emuladore?s?|emulacion|emular|emulators?)\b/, terms: ['emulator'], channel: 'emuladores', negative: /terminal emulator|emulador de terminal|terminal-emulator|\bxterm\b/ },
  { id: 'backup', label: 'copias de seguridad', triggers: /\b(copias? de seguridad|respaldos?|backups?)\b/, terms: ['backup'] },
  { id: 'terminal', label: 'terminal', triggers: /\b(terminal|linea de comandos|consola de comandos|cli)\b/, terms: ['cli', 'terminal', 'command-line'], channel: 'terminal' },
  { id: 'selfhosted', label: 'autoalojado', triggers: /\b(autoalojad[oa]s?|self ?hosted|servidor(es)? (propio|casero|domestico)s?|homelab)\b/, terms: ['self-hosted', 'selfhosted'], channel: 'self-hosted' },
  { id: 'windows', label: 'Windows', triggers: /\bwindows\b/, terms: ['windows'], channel: 'windows' },
  { id: 'macos', label: 'macOS', triggers: /\b(mac|macos|osx)\b/, terms: ['macos'] },
  { id: 'linux', label: 'Linux', triggers: /\blinux\b/, terms: ['linux'] },
  { id: 'android', label: 'Android', triggers: /\bandroid\b/, terms: ['android'] },
  { id: 'ios', label: 'iPhone / iOS', triggers: /\b(iphone|ipad|ios)\b/, terms: ['ios', 'iphone'], channel: 'ios' },
  { id: 'nintendo', label: 'Nintendo', triggers: /\bnintendo\b/, terms: ['nintendo'], channel: 'nintendo' },
  { id: 'homebrew', label: 'homebrew', triggers: /\bhomebrew\b/, terms: ['homebrew'] },
  { id: 'retro', label: 'retro', triggers: /\b(retro|retrogaming|consolas? antiguas?|clasicos)\b/, terms: ['retro', 'retrogaming'], channel: 'retro' },
  { id: 'modding', label: 'modificación', triggers: /\b(modificar|modificacion|modding|mods?)\b/, terms: ['modding', 'mod'] },
  { id: 'customize', label: 'personalización', triggers: /\b(personaliza\w*|customiza\w*|tematizar|temas visuales|temas?|menu|launcher|lanzador)\b/, summaryTriggers: /\b(personaliza\w*|temas? (visuales|personalizados|de la comunidad)|cambiar (el )?aspecto)\b/, terms: ['customization', 'theme', 'themes', 'launcher', 'home-menu'] },
  { id: 'consoles', label: 'consolas', triggers: /\b(videoconsolas?|consolas?)\b/, terms: ['console'], soft: true },
  { id: 'games', label: 'videojuegos', triggers: /\b(videojuegos?|juegos?|gaming|gamers?|jugar)\b/, terms: ['game', 'gaming'] },
  { id: 'passwords', label: 'contraseñas', triggers: /\b(contrasenas?|passwords?|gestor(es)? de claves)\b/, terms: ['password-manager', 'password', 'passwords'] },
  { id: 'notes', label: 'notas', triggers: /\b((tomar )?notas|apuntes|note taking)\b/, terms: ['notes', 'note-taking'] },
  { id: 'markdown', label: 'Markdown', triggers: /\bmarkdown\b/, terms: ['markdown'] },
  { id: 'youtube', label: 'YouTube', triggers: /\byoutube\b/, terms: ['youtube'] },
  { id: 'player', label: 'reproductor', triggers: /\b(reproductor(es)?|reproducir)\b/, terms: ['player'] },
  { id: 'search', label: 'buscar', triggers: /\b(buscar|busqueda|buscador(es)?|localizar)\b/, terms: ['search', 'find', 'finder'] },
  { id: 'read', label: 'leer', triggers: /\b(leer|lector(es)?|extraer)\b/, terms: ['reader', 'parser', 'extract'], soft: true },
  { id: 'collections', label: 'colecciones', triggers: /\b(coleccion(es)?|coleccionismo|catalogar|catalogo|inventario)\b/, terms: ['collection'] },
  { id: 'organize', label: 'organización', triggers: /\b(organizar|organizador(es)?|gestionar|gestor(es)?|administrar|ordenar)\b/, terms: ['manager', 'organizer'], soft: true },
  { id: 'files', label: 'archivos', triggers: /\b(archivos?|ficheros?|files?)\b/, terms: ['file', 'files'] },
  { id: 'analyze', label: 'análisis', triggers: /\b(analizar|analisis|analizador(es)?|inspeccionar|examinar)\b/, terms: ['analyzer', 'analysis'] },
  { id: 'productivity', label: 'productividad', triggers: /\b(productividad|tareas|to ?do)\b/, terms: ['productivity', 'todo', 'tasks'] },
  { id: 'privacy', label: 'privacidad', triggers: /\b(privacidad|anonimato|privacy)\b/, terms: ['privacy'] },
  { id: 'security', label: 'seguridad', triggers: /\b(seguridad|ciberseguridad|pentest\w*|hacking etico)\b/, terms: ['security'] },
  { id: 'download', label: 'descargas', triggers: /\b(descargas?|descargar|descargador(es)?|downloader)\b/, terms: ['downloader', 'download'] },
  { id: 'music', label: 'música y audio', triggers: /\b(musica|audio|sonido|podcasts?)\b/, terms: ['music', 'audio'] },
  { id: 'video', label: 'vídeo', triggers: /\b(video|videos|peliculas|streaming)\b/, terms: ['video'] },
  { id: 'photos', label: 'fotos', triggers: /\b(fotos?|fotografias?)\b/, terms: ['photo', 'photos', 'photography', 'gallery'] },
  { id: 'images', label: 'imágenes', triggers: /\b(imagen(es)?)\b/, terms: ['image', 'images'] },
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
  'programadores desarrolladores creadores usuarios cosas dia dias biblioteca bibliotecas libreria librerias').split(' '))

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
    apply: (r) => { r.createdWithinDays = 180; r.sort ??= 'new'; r.notes.push('«Nuevos»: creados en los últimos 6 meses (no basta con un cambio reciente).') },
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
    apply: (r) => { r.sort ??= 'interest'; r.notes.push('«Interesantes/curiosos» no es un filtro: se ordena por relevancia y señales de calidad.') },
  },
]

const languagePattern = /\b(?:en|con|de|escrit[oa]s? en|hech[oa]s? (?:en|con)|programad[oa]s? en)\s+(python|rust|golang|go|javascript|typescript|java|kotlin|swift|c\+\+|c#|csharp|lua|ruby|php|dart|zig)(?=\s|$)/

const KIND_PATTERNS: [RegExp, Interpretation['kind'], string][] = [
  [/\b(bibliotecas?|librerias?|sdks?|frameworks?|paquetes? de (python|npm|rust)|modulos?)\b/, 'library', 'Buscas una biblioteca para programadores: las aplicaciones finales pierden prioridad.'],
  [/\b(aplicacion(es)?|apps?|programas?)\b/, 'app', 'Buscas una aplicación: las bibliotecas para programadores pierden prioridad.'],
]

/** Palabra española sin traducción conocida (no se envía a GitHub ni se exige). */
function looksSpanish(word: string) {
  return /(cion|ciones|dad|dades|mente|ndo|ble|bles|oso|osa|osos|osas|ivo|iva|ivos|ivas)$/.test(word) ||
    /^(leer|ver|tener|hacer|poner|mover|correr|aprender|conocer|saber|escoger|recoger|traer)$/.test(word) ||
    // Infinitivos en -ar/-ir (las palabras inglesas en -er como «docker» o «player» no cuentan).
    (/(ar|ir)$/.test(word) && word.length > 4 && !/(bar|star|char|solar|radar|polar|similar|calendar|regular|popular)$/.test(word))
}

export function interpretQuery(input: string): Interpretation {
  const result: Interpretation = {
    original: input.trim(), concepts: [], freeTerms: [], softTerms: [], kind: null, maxStars: null, minStars: null,
    pushedWithinDays: null, createdWithinDays: null, language: null, ownerType: null, sort: null, notes: [],
  }
  let text = ` ${normalize(input)} `

  const language = text.match(languagePattern)
  if (language) {
    result.language = languages[language[1]]
    text = text.replace(language[0], ' ')
  }

  for (const [pattern, kind, note] of KIND_PATTERNS) {
    if (!result.kind && pattern.test(text)) { result.kind = kind; result.notes.push(note) }
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
      result.concepts.push({ id: concept.id, label: concept.label, terms: concept.terms, channel: concept.channel, soft: concept.soft, platform: concept.platform })
      text = text.replace(new RegExp(concept.triggers.source, 'g'), ' ')
    }
  }
  if (result.concepts.some((concept) => concept.id === 'terminal') && !result.kind) result.kind = 'cli'
  // «Nintendo» sobra si ya hay una consola concreta de Nintendo.
  if (result.concepts.some((concept) => concept.platform) ) result.concepts = result.concepts.filter((concept) => concept.id !== 'nintendo' || !result.concepts.some((other) => other.platform && PLATFORMS.find((platform) => platform.id === other.platform)?.family === 'Nintendo'))

  for (const word of text.split(' ')) {
    if (word.length < 2 || stopwords.has(word) || result.freeTerms.includes(word)) continue
    if (!result.language && languages[word] && result.concepts.length + result.freeTerms.length > 0) {
      result.language = languages[word]
      continue
    }
    if (looksSpanish(word) && result.concepts.length > 0) result.softTerms.push(word)
    else result.freeTerms.push(word)
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
 * Los conceptos «blandos» (organizar, consolas…) y las palabras españolas sin
 * traducción no se envían: GitHub exige todas las palabras y las vaciaría.
 */
export function buildGithubQueries(interp: Interpretation, { now = Date.now(), includeArchived = false } = {}) {
  const extra = qualifiers(interp, now, includeArchived)
  const join = (terms: string[]) => [...terms, ...extra].join(' ').trim()
  if (isEmptyInterpretation(interp)) {
    const generic = ['tool', 'utility']
    const defaults = interp.maxStars === null ? ['stars:10..500', `pushed:>${isoDaysAgo(180, now)}`] : []
    return { primary: [generic.join(' OR '), ...defaults, ...extra].join(' '), fallbacks: [] as string[], generic: true }
  }
  const hard = interp.concepts.filter((concept) => !concept.soft)
  const used = hard.length ? hard : interp.concepts
  if (used.length === 1 && interp.freeTerms.length === 0) {
    const terms = used[0].terms.slice(0, 3)
    return { primary: join([terms.join(' OR ')]), fallbacks: [] as string[], generic: false }
  }
  const conceptTerms = used.map((concept) => concept.terms[0])
  const primary = join([...conceptTerms, ...interp.freeTerms])
  const candidates: string[] = []
  // Plataforma + escena con el segundo término (p. ej. «psvita» → «vita»).
  const platform = used.find((concept) => concept.platform)
  if (platform && platform.terms[1]) candidates.push(join([platform.terms[1], ...conceptTerms.filter((term) => term !== platform.terms[0]), ...interp.freeTerms]))
  // CFW o jailbreak de una consola concreta: el nombre de su escena (henkaku, goldhen, luma3ds…).
  const scene = platform && PLATFORMS.find((item) => item.id === platform.platform)?.scene
  if (scene && used.some((concept) => concept.id === 'cfw' || concept.id === 'exploit' || concept.id === 'homebrew')) candidates.unshift(join([scene]))
  if (interp.freeTerms.length > 0 && conceptTerms.length > 0) candidates.push(join(conceptTerms))
  if (conceptTerms.length > 2) candidates.push(join(conceptTerms.slice(0, 2)))
  if (platform && conceptTerms.length > 1) {
    const others = used.filter((concept) => concept !== platform).flatMap((concept) => concept.terms.slice(0, 2))
    candidates.push(join([platform.terms[0], [...new Set(others)].slice(0, 5).join(' OR ')]))
  }
  if (conceptTerms.length > 1) candidates.push(join([conceptTerms.slice(0, 6).join(' OR ')]))
  else if (interp.freeTerms.length > 1) candidates.push(join([interp.freeTerms.slice(0, 6).join(' OR ')]))
  const fallbacks = [...new Set(candidates)].filter((query) => query !== primary).slice(0, 2)
  return { primary, fallbacks, generic: false }
}

/** Texto en el que buscar coincidencias dentro del catálogo local. */
export type Matchable = {
  name: string; fullName: string; description: string; topics: string[]; category: string; channels: string[]; ownerType: string | null
  language: string | null; pushedAt: string; createdAt: string; stars: number; summary?: { text: string; kinds?: string[] } | null; isList?: boolean
}

type Fields = { name: string; topics: string; description: string; summary: string }
const FIELD_WEIGHT: Record<keyof Fields, number> = { name: 1, topics: 0.9, description: 0.85, summary: 0.7 }

const fieldCache = new WeakMap<object, Fields>()
function fieldsOf(project: Matchable): Fields {
  let fields = fieldCache.get(project)
  if (!fields) {
    fields = {
      name: normalize(`${project.name.replace(/[-_.]/g, ' ')} ${project.name}`),
      topics: normalize(`${project.topics.join(' ').replace(/-/g, ' ')} ${project.topics.join(' ')}`),
      description: normalize(project.description),
      summary: normalize(project.summary?.text ?? ''),
    }
    fieldCache.set(project, fields)
  }
  return fields
}

/** Coincidencia al principio de palabra («emulator» encaja en «emulators», «file» no en «profile»). */
function hasWord(haystack: string, term: string) {
  const needle = normalize(term.replace(/-/g, ' '))
  if (!needle) return false
  return ` ${haystack}`.includes(` ${needle}`)
}

const platformCache = new WeakMap<object, string[]>()
export function platformsOf(project: Matchable) {
  let platforms = platformCache.get(project)
  if (!platforms) { platforms = detectPlatforms(project); platformCache.set(project, platforms) }
  return platforms
}

export type Relevance = { value: number; why: string[] }

/**
 * Relevancia de 0 a 1 con explicación. Los conceptos obligatorios deben aparecer en el
 * nombre, los temas, la descripción o el resumen en español (con más peso en el nombre).
 * Devuelve 0 si falta alguno, si no cumple los filtros o si parece piratería.
 */
export function relevanceOf(project: Matchable, interp: Interpretation, now = Date.now()): Relevance {
  const none = { value: 0, why: [] }
  if (interp.ownerType && project.ownerType && project.ownerType !== interp.ownerType) return none
  if (interp.language && normalize(project.language ?? '') !== normalize(interp.language)) return none
  if (interp.maxStars !== null && (project.stars > interp.maxStars || project.stars < (interp.minStars ?? 0))) return none
  if (interp.pushedWithinDays !== null && now - Date.parse(project.pushedAt) > interp.pushedWithinDays * 86_400_000) return none
  if (interp.createdWithinDays !== null && now - Date.parse(project.createdAt) > interp.createdWithinDays * 86_400_000) return none
  if (looksLikePiracy(project)) return none
  if (isEmptyInterpretation(interp)) return { value: 0.5, why: [] }

  const fields = fieldsOf(project)
  const all = `${fields.name} ${fields.topics} ${fields.description} ${fields.summary}`
  const why: string[] = []
  const weights: number[] = []
  let softBonus = 0
  for (const concept of interp.concepts) {
    const definition = concepts.find((item) => item.id === concept.id)
    let weight = 0
    if (concept.platform) {
      // La consola debe detectarse y no ser solo el origen de algo hecho para otra consola.
      weight = platformsOf(project).includes(concept.platform) && !isOtherPlatformTarget(project, concept.platform) ? 1 : 0
    } else if (!(definition?.negative && definition.negative.test(all))) {
      for (const field of Object.keys(FIELD_WEIGHT) as (keyof Fields)[]) {
        // Siglas cortas («ai», «sd»…): en la descripción suelen ser menciones de pasada;
        // solo cuentan en el nombre, los temas o el resumen.
        const byTerm = concept.terms.some((term) => (field !== 'description' || term.replace(/\W/g, '').length > 3) && hasWord(fields[field], term))
        const spanish = definition?.summaryTriggers ?? definition?.triggers
        const bySpanish = field === 'summary' && spanish ? spanish.test(` ${fields.summary} `) : false
        if (byTerm || bySpanish) weight = Math.max(weight, FIELD_WEIGHT[field])
      }
      if (!weight && concept.channel && project.channels.includes(concept.channel)) weight = 0.55
    }
    if (concept.soft) { softBonus += weight ? 0.05 : 0; continue }
    if (!weight) return none
    weights.push(weight)
    if (weight >= 0.9) why.push(`«${concept.label}» aparece en el nombre o los temas.`)
  }
  for (const term of interp.freeTerms) {
    let weight = 0
    for (const field of Object.keys(FIELD_WEIGHT) as (keyof Fields)[]) if (hasWord(fields[field], term)) weight = Math.max(weight, FIELD_WEIGHT[field])
    if (!weight) return none
    weights.push(weight)
  }
  for (const term of interp.softTerms) if (hasWord(all, term)) softBonus += 0.03

  let value = weights.length ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : 0.5
  value = Math.min(1, value + softBonus)

  if (interp.kind) {
    const kinds = (project.summary?.kinds as string[] | undefined) ?? inferKinds({ name: project.name, description: project.description, topics: project.topics, isList: project.isList })
    const isLibrary = kinds.includes('library') && !kinds.includes('app') && !kinds.includes('selfhosted')
    const isApp = kinds.includes('app') || kinds.includes('selfhosted')
    if (interp.kind === 'app' && isLibrary) { value *= 0.55; why.push('Parece una biblioteca para programadores, no una aplicación.') }
    else if (interp.kind === 'app' && isApp) { value = Math.min(1, value + 0.08); why.push('Es una aplicación lista para usar.') }
    else if (interp.kind === 'library' && kinds.includes('library')) { value = Math.min(1, value + 0.1); why.push('Es una biblioteca para programadores.') }
    else if (interp.kind === 'library' && isApp && !kinds.includes('library')) { value *= 0.6; why.push('Es una aplicación final, no una biblioteca.') }
    else if (interp.kind === 'cli' && kinds.includes('cli')) value = Math.min(1, value + 0.08)
  }
  if (project.isList) value *= 0.6
  // Webs de organizaciones o blogs no son herramientas (salvo que se busque una web).
  if (/\b(website|homepage|blog)\b|\.github\.io\b/.test(`${fields.name} ${fields.description}`) && !/\b(web|pagina|sitio)\b/.test(normalize(interp.original))) value *= 0.7
  return { value: Math.round(value * 1000) / 1000, why }
}

/** Compatibilidad con el resto de la app: solo el valor de relevancia. */
export function matchProject(project: Matchable, interp: Interpretation, now = Date.now()) {
  return relevanceOf(project, interp, now).value
}

export function describeInterpretation(interp: Interpretation) {
  const parts: string[] = []
  if (interp.concepts.length) parts.push(`Temas: ${interp.concepts.map((concept) => concept.label).join(', ')}`)
  if (interp.freeTerms.length) parts.push(`Palabras: ${interp.freeTerms.join(', ')}`)
  if (interp.kind) parts.push(`Tipo: ${interp.kind === 'app' ? 'aplicación' : interp.kind === 'library' ? 'biblioteca' : 'línea de comandos'}`)
  if (interp.language) parts.push(`Lenguaje: ${interp.language}`)
  return parts.join(' · ') || 'Búsqueda genérica de herramientas y utilidades activas'
}
