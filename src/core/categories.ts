// Clasificación por palabras clave de los metadatos públicos (nombre, descripción y temas).
import { looksLikeList } from './text.ts'

type Evidence = { name: string; description?: string | null; topics?: string[]; full_name?: string; fullName?: string }

function evidenceText(repo: Evidence) {
  return [repo.name, repo.description, repo.full_name ?? repo.fullName, ...(repo.topics ?? [])].filter(Boolean).join(' ').toLowerCase()
}

export function classifyConsoles(repo: Evidence) {
  const text = evidenceText(repo)
  const consoles: string[] = []
  if (/\b3ds\b|3ds[-_ ]|new nintendo 3ds|nintendo 3ds/.test(text)) consoles.push('3DS')
  if (/\bdsi\b|dsi[-_ ]|nintendo dsi/.test(text)) consoles.push('DSi')
  if (/\bnds\b|nintendo ds|nitro.?ds|libnds|twl/.test(text)) consoles.push('DS')
  return consoles
}

export function isNintendoRelevant(repo: Evidence) {
  return classifyConsoles(repo).length > 0 ||
    /\bhomebrew\b|nds-bootstrap|twilight.?menu|nds.?bootstrap|libnds|3dsx|\.cia\b|\bcia\b|\bfbi\b/i.test(evidenceText(repo))
}

const nintendoRules: [string, RegExp][] = [
  ['Herramientas para partidas guardadas', /\bsave\b|savedata|checkpoint|backup|restore|pkhex|pksm/i],
  ['Emuladores', /\bemulator\b|emulation|retroarch|virtual console/i],
  ['Multimedia', /\bmusic\b|audio|video|media|player|stream/i],
  ['Personalización', /\btheme\b|customiz|wallpaper|font|skin|appearance/i],
  ['Juegos homebrew', /\bgame\b|rpg|platformer|puzzle|arcade|adventure/i],
  ['Herramientas de desarrollo', /\bsdk\b|compiler|debug|development|devkit|toolchain|library|libnds/i],
  ['Aplicaciones y utilidades', /\btool\b|utility|utilities|manager|installer|browser|file.?manager/i],
]

const generalRules: [string, RegExp][] = [
  ['Inteligencia artificial', /\b(ai|llms?|gpt|machine.?learning|neural|openai|ollama|chatbot|rag|agents?|diffusion|whisper)\b/i],
  ['Emuladores', /\bemulat(or|ors|ion)\b|retroarch/i],
  ['Automatización', /automation|automate|workflow|\bbots?\b|scheduler|\bcron\b|home.?assistant/i],
  ['Juegos', /\bgames?\b|gaming|\brpg\b|puzzle|platformer|roguelike/i],
  ['Multimedia', /\bmusic\b|audio|video|media|player|stream|podcast|\bimage|photo/i],
  ['Herramientas de terminal', /\bcli\b|terminal|command.?line|\btui\b|\bshell\b/i],
  ['Productividad y organización', /\bnotes?\b|note.?taking|\btodo\b|\btasks?\b|productivity|calendar|bookmark|collection|organi[sz]er/i],
  ['Archivos y datos', /\bfiles?\b|\bpdf\b|\bcsv\b|archive|backup|\bsync\b|convert/i],
  ['Seguridad y privacidad', /security|privacy|password|encrypt|\bvpn\b|firewall|adblock/i],
  ['Personalización', /\btheme\b|customiz|wallpaper|icon.?pack|\bskin\b|dotfiles|rice/i],
  ['Redes y servidores', /self.?hosted|selfhosted|\bserver\b|network|proxy|\bdns\b|docker|homelab/i],
  ['Herramientas de desarrollo', /\bsdk\b|library|framework|compiler|debug|devtools?|\bapi\b|\blsp\b/i],
  ['Aplicaciones y utilidades', /\btool\b|tools\b|utility|utilities|\bapp\b|manager|launcher/i],
]

/** Categorías específicas de Nintendo (las del catálogo original). */
export function classifyCategory(repo: Evidence) {
  const text = evidenceText(repo)
  return nintendoRules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Otros proyectos interesantes'
}

export function classifyGeneralCategory(repo: Evidence) {
  if (looksLikeList(repo.name, repo.description ?? '', repo.topics ?? [])) return 'Lista de recursos'
  if (isNintendoRelevant(repo) && classifyConsoles(repo).length) return classifyCategory(repo)
  const text = evidenceText(repo)
  return generalRules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Otros proyectos interesantes'
}
