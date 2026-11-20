// Clasificación por EVIDENCIA. Cada categoría suma puntos según dónde aparece la pista
// (temas de GitHub y nombre > primera frase de la descripción o del resumen > resto >
// README) y algunos contextos ANULAN la pista («terminal emulator» no es un emulador de
// consolas; «revisado por IA» no es una herramienta de IA). Si nada alcanza el umbral,
// se usa la categoría general y se marca como no verificada.
import { looksLikeList } from './text.ts'

export const CATEGORY_VERSION = 2
export const GENERAL_CATEGORY = 'Otros proyectos interesantes'

export type Confidence = 'alta' | 'media' | 'baja'
export type Classification = { category: string; confidence: Confidence; evidence: string[] }

export type ClassifyInput = {
  name: string
  description?: string | null
  topics?: string[]
  /** Resumen en español (revisado o automático), si existe. */
  summary?: string | null
  /** Primeras líneas del README (solo en la recopilación). */
  readme?: string | null
}

type Rule = {
  category: string
  /** Temas de GitHub que son prueba directa. */
  topics: RegExp
  /** Expresiones de PROPÓSITO en nombre, descripción, resumen o README. */
  purpose: RegExp
  /** Contextos que anulan la pista en ese mismo campo. */
  veto?: RegExp
  /** Temas que anulan (p. ej. «terminal-emulator»). */
  topicVeto?: RegExp
}

const SYSTEMS = 'nintendo|n64|nes|snes|famicom|game ?boy|gba|gbc|ds|nds|3ds|dsi|wii|wii ?u|gamecube|switch|playstation|ps[1-5x]|psp|vita|xbox|sega|genesis|mega ?drive|saturn|dreamcast|master system|game gear|atari|neo ?geo|arcade|mame|amiga|commodore|c64|zx spectrum|spectrum|msx|amstrad|dos|ms-dos|macintosh|mac os|classic mac|symbian|n-gage|palm ?os|console|consolas?|handheld|retro|cpu|processor|risc-v|6502|65c02|z80|8080|8086|x86|arm|mips|powerpc|chip-?8|virtual machine|qemu|hardware|computer|ordenador'

export const RULES: Rule[] = [
  {
    category: 'Emuladores',
    topics: /^(emulators?|emulation|retroarch|libretro|mame|[\w-]*-emulator|emulator-[\w-]+)$/,
    topicVeto: /^(terminal-emulators?|terminal|android-emulator|browser-emulation|xterm)$/,
    // Exige el sistema emulado (consola, ordenador clásico, CPU…) cerca de la palabra.
    purpose: new RegExp(`\\b(${SYSTEMS})\\b[^.;]{0,30}\\b(emulat(or|ors|ion|es|ing)|emuladore?s?)\\b|\\b(emulat(or|ors|ion|es|ing)|emuladore?s?)\\b[^.;]{0,40}\\b(${SYSTEMS}|juegos|games)\\b|\\bretroarch\\b|\\blibretro\\b|\\bmame\\b|\\bqemu\\b`, 'i'),
    veto: /terminal emulat|emulador(es)? de terminal|terminal[- ]emulator|browser emulat|mobile emulat|device emulat|emulation (layer|of the native)|polyfill|emulat(es|ion of|ing) (the )?(native|php|api|functions?|behaviou?r|extensions?|go|c\+\+|goroutines?)|goroutines? emulat|(api|server|service|s3|aws|firebase|cloud|redis|kafka|stripe|store|statistics|stats|realms?|battle\.?net|bot) emulat|keyboard emulat|mouse emulat|hid emulat|webdriver/i,
  },
  {
    category: 'Inteligencia artificial',
    topics: /^(ai|llms?|machine-learning|deep-learning|artificial-intelligence|ai-agents?|ai-tools?|local-llm|llm-[\w-]+|rag|chatgpt|openai|ollama|generative-ai|genai|nlp|computer-vision|stable-diffusion|whisper|mcp|mcp-server|model-context-protocol|agents?|agentic[\w-]*)$/,
    purpose: /\b(llms?|large language models?|language models?|machine learning|deep learning|neural networks?|ai[- ](powered|agents?|assistants?|models?|tools?|chat|coding|search|generated images?)|chat ?gpt|openai|ollama|local models?|mcp (server|client)|model context protocol|stable diffusion|whisper|speech[- ]to[- ]text|text[- ]to[- ]speech|inteligencia artificial|modelos? de (ia|lenguaje)|agentes? de ia|asistentes? de ia|con ia\b|usa ia\b)\b/i,
    veto: /(reviewed|audited|checked|written|generated|made|assisted|built) (by|with) [^.]{0,20}\bai\b|\bai[- ]assisted (tooling|code|development)|con ayuda de (una? )?(la )?ia|escrit[oa] con (ayuda de )?ia/i,
  },
  {
    category: 'Seguridad y privacidad',
    topics: /^(security|privacy|password-manager|passwords?|encryption|vpn|cybersecurity|infosec|reverse-engineering|malware|malware-analysis|pentest(ing)?|authentication|sso|oidc|2fa|totp|adblock|ad-blocker|firewall|binary-analysis|privacy-tools|secrets-management)$/,
    purpose: /\b(security|privacy|password (manager|vault)|passwords|encrypt\w*|vpn|firewall|ad ?block\w*|malware|reverse[- ]engineer\w*|binary analysis|pentest\w*|authentication|single sign-on|sso|2fa|credential vault|seguridad|privacidad|contrase[nñ]as|cifrad\w*|ingenier[ií]a inversa)\b/i,
    veto: /\b(type|thread|memory)[- ]safe|security (patches|updates) (from|of)\b/i,
  },
  {
    category: 'Juegos',
    topics: /^(games?|gaming|game-engine|gamedev|game-development|roguelike|rpg|shoot-em-up|platformer|pixel-art|retro-gaming|minecraft|doom)$/,
    purpose: /\b(video ?games?|(a|the|this) game\b|games? (engine|port|launcher)|roguelike|platformer|rpg\b|shoot[- ]?em[- ]?up|run[- ]and[- ]gun|fps game|multiplayer|videojuegos?|juego (de|para|casero|de acci[oó]n))\b/i,
    veto: /gaming (laptops?|pcs?|mouse|keyboards?|chairs?|headsets?|hardware)|port[aá]tiles? gaming|game ?pads?|game[- ]changer|game theory/i,
  },
  {
    category: 'Multimedia',
    topics: /^(music|audio|video|media|music-player|audio-player|video-player|podcasts?|photos?|photography|photo-management|image-processing|streaming|youtube|youtube-music|subtitles|media-server|mpd|sound)$/,
    purpose: /\b(music|audio (player|editor)|video (player|downloader|editor)|podcasts?|photos?|photography|photo (manager|gallery|library)|media (player|server|library|manager)|music player|subtitles?|youtube|m[uú]sica|v[ií]deos?|fotos?|fotograf[ií]as?|reproductor|sintetizador(es)?|synth(esizer)?s?)\b/i,
    veto: /data stream|event stream|stream processing|log stream|(docker|container|disk|os|iso|boot|sd[- ]card) images?|image (registry|build)/i,
  },
  {
    category: 'Personalización',
    topics: /^(themes?|customization|customisation|wallpapers?|dotfiles|icon-pack|rice|ricing|skins?|desktop-wallpaper|wallpaper-engine)$/,
    purpose: /\b(themes? (for|manager|engine|directory|collection)|wallpapers?|icon packs?|dotfiles|ricing|boot (logo|splash)|fondos? (de escritorio|animados)|temas? (creados|para|de la comunidad|originales)|personalizar (el )?(aspecto|men[uú]|escritorio))\b/i,
  },
  {
    category: 'Productividad y organización',
    topics: /^(productivity|note-taking|notes|notes-app|todo|todolist|todo-list|todo-txt|focus|personal-management|task-manager|tasks|kanban|calendar|pkm|knowledge-management|knowledge-base|zettelkasten|bookmarks?|bookmark-manager|mind-?map[\w-]*|outliner|wiki|second-brain|gtd|time-tracker)$/,
    purpose: /\b(note[- ]taking|notes app|take notes|to-?do( list| manager)?|task (manager|list)|productivity|calendar|kanban|bookmarks?|knowledge (base|management)|mind ?maps?|outliner|personal wiki|notas|tareas|productividad|calendario|mapas mentales|base de conocimiento)\b/i,
    veto: /release notes|patch notes|task (queue|runner|scheduler)/i,
  },
  {
    category: 'Archivos y datos',
    topics: /^(file-manager|filemanager|file-management|file-organizer|files|backup|backup-tool|sync|pdf|csv|converter|file-converter|database|sql-client|storage|archive|archiver|compression|ebooks?|epub|file-explorer|filesystem|file-sharing|webdav)$/,
    purpose: /\b(file (manager|explorer|converter|conversion|sharing|search|browser)|files? (with|by|from)|convertir archivos|convers(i[oó]n|or) de archivos|pdf|csv|backups?|backup (and|&) restore|sync(hroni[sz]e)?|convert(er|s)? (files?|ebooks?|images?|documents?)|archiv(e|er|ing)|compress(ion)?|databases?|sql client|storage|gestor de archivos|archivos|ficheros|copias? de seguridad|convierte|conversor|bases? de datos)\b/i,
    veto: /config(uration)? files?|dotfiles|\.env files?/i,
  },
  {
    category: 'Automatización',
    topics: /^(automation|workflow-automation|workflows?|rpa|bots?|home-automation|home-assistant|cron|scheduler|ci|ci-cd|github-actions|task-runner|orchestration|workflow-engine|build-automation)$/,
    purpose: /\b(automat(e|es|ion|ing)|workflows?|scheduler|cron|task runner|orchestrat\w+|home assistant|automatiza\w*|flujos? de trabajo|programador de tareas)\b/i,
  },
  {
    category: 'Herramientas de terminal',
    topics: /^(cli|terminal|tui|command-line|command-line-tool|cli-app|shell|console-application|ratatui|terminal-app|terminal-based)$/,
    purpose: /\b(command[- ]line (tool|interface|utility|app)|cli tool|(is|as) a cli\b|terminal (ui|app|user interface|file manager|music player|client)|tui\b|in (your|the) terminal|l[ií]nea de comandos|(funciona|usa) en (la )?terminal|(desde|dentro de|en) la terminal|para (la )?terminal)\b/i,
  },
  {
    category: 'Redes y servidores',
    // «Autoalojado» es una forma de instalar, no una temática: no cuenta como prueba de redes.
    topics: /^(homelab|networking|network|proxy|dns|reverse-proxy|kubernetes|k8s|nas|web-server|gitops|vpn-server|ftp-server)$/,
    purpose: /\b(homelab|web server|networking|network (monitor|tools?|traffic)|proxy|dns|kubernetes|reverse proxy|servidor web|administration of a server|server administration|administraci[oó]n de (un )?servidor(es)?|sistema operativo para servidores|infraestructura|redes (locales|inform[aá]ticas)|red local)\b/i,
    veto: /server[- ]side|serverless|language server|mcp server/i,
  },
  {
    category: 'Herramientas de desarrollo',
    topics: /^(developer-tools|devtools|sdk|library|framework|compiler|debugger|lsp|language-server|testing|devops|ide|linter|build-tool|build-system|toolchain|devkitpro|api|code-editor|static-analysis|version-manager)$/,
    purpose: /\b(sdk|librar(y|ies) (for|to)|framework (for|to)|compiler|debugg\w+|developer tools?|devtools?|language server|lsp|linter|code editor|build (tool|system)|toolchain|version (manager|management)|development environment|biblioteca|para programadores|para desarrolladores|editor de (texto y )?c[oó]digo|entorno (local )?de desarrollo|versiones de (go|python|node|php))\b/i,
  },
  {
    category: 'Aplicaciones y utilidades',
    topics: /^(utility|utilities|tool|tools|app|desktop-app|windows-app|android-app|ios-app|macos-app|linux-app|launcher|system-tray)$/,
    purpose: /\b(utilit(y|ies)|desktop app|launcher|utilidad|aplicaci[oó]n (para|de escritorio)|app (for|para))\b/i,
  },
]

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s|\n/)[0] ?? ''

/** Puntuación de cada categoría con sus pruebas (y lo que se descartó). */
export function scoreCategories(input: ClassifyInput) {
  return scoreWithRules(input, RULES)
}

function scoreWithRules(input: ClassifyInput, rules: Rule[]) {
  const description = (input.description ?? '').trim()
  const summary = (input.summary ?? '').trim()
  const fields: [string, string, number][] = [
    ['el nombre', input.name.replace(/[-_.]/g, ' '), 3],
    ['la descripción', firstSentence(description), 2.5],
    ['la descripción', description.slice(firstSentence(description).length), 1.2],
    ['el resumen', firstSentence(summary), 2.5],
    ['el resumen', summary.slice(firstSentence(summary).length), 1],
    ['el README', (input.readme ?? '').slice(0, 700), 1.5],
  ]
  const topics = (input.topics ?? []).map((topic) => topic.toLowerCase())
  return rules.map((rule) => {
    let score = 0
    let textHits = 0
    const evidence: string[] = []
    const vetoes: string[] = []
    const topicHits = topics.filter((topic) => rule.topics.test(topic) && !rule.topicVeto?.test(topic))
    const topicVetoed = rule.topicVeto ? topics.some((topic) => rule.topicVeto!.test(topic)) : false
    if (topicHits.length && !topicVetoed) { score += 3 + Math.min(1.5, (topicHits.length - 1) * 0.5); evidence.push(`tema de GitHub «${topicHits[0]}»`) }
    if (topicVetoed) vetoes.push(`tema «${topics.find((topic) => rule.topicVeto!.test(topic))}»`)
    for (const [label, text, weight] of fields) {
      if (!text) continue
      const match = text.match(rule.purpose)
      if (!match) continue
      const veto = rule.veto ? text.match(rule.veto) : null
      if (veto) { vetoes.push(`«${veto[0]}» en ${label}`); continue }
      score += weight
      textHits++
      if (evidence.length < 3) evidence.push(`${label}: «${match[0].trim()}»`)
    }
    // Una prueba anulada en un campo de peso resta confianza a las demás.
    if (vetoes.length && score > 0) score -= 1.5 * vetoes.length
    score = Math.max(0, score)
    // «Aplicaciones y utilidades» es casi general: al comparar solo gana si no hay nada más
    // específico, pero su puntuación real sigue sirviendo para superar el umbral.
    const rank = rule.category === 'Aplicaciones y utilidades' ? score * 0.6 : score
    return { category: rule.category, score, rank, evidence, vetoes, textHits, topicHits: topicVetoed ? 0 : topicHits.length }
  })
}

export const MIN_SCORE = 2.5

export function classifyProject(input: ClassifyInput): Classification {
  if (looksLikeList(input.name, input.description ?? '', input.topics ?? [])) return { category: 'Lista de recursos', confidence: 'alta', evidence: ['es una lista o recopilación de enlaces'] }
  const scored = scoreCategories(input).sort((a, b) => b.rank - a.rank || b.score - a.score)
  const [best, second] = scored
  if (!best || best.score < MIN_SCORE) {
    const discarded = scored.flatMap((item) => item.vetoes.map((veto) => `descartado ${item.category.toLowerCase()} por ${veto}`)).slice(0, 2)
    return { category: GENERAL_CATEGORY, confidence: 'baja', evidence: discarded.length ? discarded : ['no hay pistas suficientes en su documentación'] }
  }
  const margin = best.rank - (second?.rank ?? 0)
  const confidence: Confidence = best.score >= 5 && margin >= 2 ? 'alta' : 'media'
  return { category: best.category, confidence, evidence: best.evidence }
}

// ---------- Canal Nintendo: categorías propias ----------

const NINTENDO_RULES: Rule[] = [
  {
    category: 'Herramientas para partidas guardadas',
    topics: /^(save-?(manager|editor|data|game)s?|savegames?|checkpoint|pkhex|pksm)$/,
    purpose: /\b(save ?(data|games?|files?|manager|editor)|savegames?|save (backup|editor)|partidas guardadas|editor de partidas|copias de (las )?partidas)\b/i,
  },
  {
    category: 'Juegos homebrew',
    topics: /^(games?|nds-game|3ds-game|game|homebrew-game|rpg|platformer|port|pokemon)$/,
    purpose: /\b(video ?games?|(a|the) (homebrew )?game\b|game (for|port)|port (of|de)|demake|roguelike|platformer|rpg\b|juegos? (casero|homebrew)|adaptaci[oó]n (no oficial|nativa) de)\b/i,
    veto: /game ?pads?|game (cards?|cartridges?) (dumper|manager)/i,
  },
]

const NINTENDO_MAP: Record<string, string> = { Juegos: 'Juegos homebrew' }
const NINTENDO_ALLOWED = new Set(['Herramientas para partidas guardadas', 'Emuladores', 'Multimedia', 'Personalización', 'Juegos homebrew', 'Herramientas de desarrollo', 'Aplicaciones y utilidades'])

/** Categorías del canal Nintendo (las del catálogo original), con el mismo método por evidencia. */
export function classifyNintendo(input: ClassifyInput): Classification {
  const saved = RULES
  const specific = scoreWithRules(input, NINTENDO_RULES)
  const general = scoreWithRules(input, saved).map((item) => ({ ...item, category: NINTENDO_MAP[item.category] ?? item.category }))
  const scored = [...specific, ...general].filter((item) => NINTENDO_ALLOWED.has(item.category)).sort((a, b) => b.rank - a.rank || b.score - a.score)
  const [best, second] = scored
  if (!best || best.score < MIN_SCORE) return { category: GENERAL_CATEGORY, confidence: 'baja', evidence: ['no hay pistas suficientes en su documentación'] }
  return { category: best.category, confidence: best.score >= 5 && best.rank - (second?.rank ?? 0) >= 2 ? 'alta' : 'media', evidence: best.evidence }
}

// ---------- Temáticas recopiladas que corresponden a una categoría ----------

/** Una temática con categoría solo conserva proyectos cuya evidencia la respalda. */
export const CHANNEL_CATEGORY: Record<string, string> = {
  emuladores: 'Emuladores',
  ia: 'Inteligencia artificial',
  automatizacion: 'Automatización',
  terminal: 'Herramientas de terminal',
  productividad: 'Productividad y organización',
  archivos: 'Archivos y datos',
}

/**
 * ¿La evidencia respalda que el proyecto pertenece a esa temática? No tiene por qué ser
 * su categoría principal (un reproductor de música para la terminal es «Multimedia» y
 * también de «Terminal»), pero necesita pruebas propias: una expresión de propósito en el
 * texto o al menos dos temas de GitHub. Una sola etiqueta («emulator» en una herramienta
 * de ingeniería inversa) no basta.
 */
export function supportsCategory(input: ClassifyInput, category: string) {
  const target = scoreCategories(input).find((item) => item.category === category)
  if (!target || target.score < MIN_SCORE) return false
  return target.textHits > 0 || target.topicHits >= 2 || classifyProject(input).category === category
}
