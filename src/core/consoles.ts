// Conocimiento del mundo de la modificación de consolas, basado en reglas y palabras
// clave de los metadatos públicos (nombre, descripción, temas, resumen). No afirma
// compatibilidades: solo detecta menciones verificables en la documentación.

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export type Platform = { id: string; label: string; family: 'Nintendo' | 'PlayStation' | 'Xbox' | 'Sega' | 'Otras'; detect: RegExp; query: RegExp; terms: string[]; scene?: string }

// detect: cómo se reconoce en la documentación (en inglés). query: cómo lo escribe el
// usuario en español. terms: qué se envía a la búsqueda de GitHub. scene: nombre de la
// escena de CFW/jailbreak de esa consola, para ampliar búsquedas con pocos resultados.
export const PLATFORMS: Platform[] = [
  { id: 'nds', label: 'Nintendo DS', family: 'Nintendo', detect: /\bnds\b|nintendo[ -]ds\b|nitro ?ds|libnds|\bds lite\b|nds-bootstrap|twilight ?menu/, query: /\b(nintendo ds|nds|ds lite)\b/, terms: ['nds'] },
  { id: 'dsi', label: 'Nintendo DSi', family: 'Nintendo', detect: /(?<!mipi[ -])\bdsi\b(?![ -]?(display|panel|interface|screen|lcd|touch))|dsiware|\btwl\b/, query: /\b(nintendo )?dsi( xl)?\b/, terms: ['dsi'] },
  { id: '3ds', label: 'Nintendo 3DS', family: 'Nintendo', detect: /\b3ds\b(?![ -]?max)|\b2ds\b|3dsx|luma3ds|libctru|nintendo-3ds|3ds-homebrew/, query: /\b(nintendo )?(new )?[23]ds( xl)?\b/, terms: ['3ds'], scene: 'luma3ds' },
  { id: 'wii', label: 'Wii', family: 'Nintendo', detect: /\bwii\b(?![ -]?u)|wiiflow|usb ?loader ?gx|letterbomb|priiloader|homebrew channel|\bdevkitppc\b/, query: /\bwii\b(?! ?u)/, terms: ['wii'] },
  { id: 'wiiu', label: 'Wii U', family: 'Nintendo', detect: /\bwii[ -]?u\b|wiiu|aroma|tiramisu|cemu|wut\b/, query: /\bwii ?u\b/, terms: ['wiiu', 'wii-u'], scene: 'aroma' },
  { id: 'switch', label: 'Nintendo Switch', family: 'Nintendo', detect: /nintendo[ -]switch|switch[ -]homebrew|libnx|atmosph[eè]re|hekate|switchbrew|\bnro\b|ryujinx|yuzu|switch[ -]?2\b|\b(3ds|wii ?u|ps4|ps5|vita|steam deck)\b[^.]{0,20}(\band|&|,|\by)\s+switch\b|\bswitch\b(?=[ -](homebrew|cfw|console|games?|overlay|nro|sd card|emulator))|\b(for|on|para) (the |la )?switch\b/, query: /\b(nintendo )?switch( 2| oled| lite)?\b/, terms: ['nintendo-switch', 'switch'], scene: 'atmosphere' },
  { id: 'gb', label: 'Game Boy', family: 'Nintendo', detect: /game ?boy(?! advance)|\bgbc\b|gameboy-color/, query: /\bgame ?boy( color)?\b(?! advance)/, terms: ['gameboy'] },
  { id: 'gba', label: 'Game Boy Advance', family: 'Nintendo', detect: /\bgba\b|game ?boy advance/, query: /\b(gba|game ?boy advance)\b/, terms: ['gba'] },
  { id: 'nes', label: 'NES / SNES', family: 'Nintendo', detect: /\bs?nes\b|famicom|super nintendo/, query: /\b(s?nes|famicom|super nintendo)\b/, terms: ['nes', 'snes'] },
  { id: 'n64', label: 'Nintendo 64', family: 'Nintendo', detect: /\bn64\b|nintendo 64|libdragon/, query: /\b(n64|nintendo 64)\b/, terms: ['n64'] },
  { id: 'gamecube', label: 'GameCube', family: 'Nintendo', detect: /gamecube|\bgcn\b|swiss-gc/, query: /\bgamecube\b/, terms: ['gamecube'] },
  { id: 'psp', label: 'PSP', family: 'PlayStation', detect: /\bpsp\b|playstation portable|ppsspp/, query: /\bpsp\b/, terms: ['psp'] },
  { id: 'vita', label: 'PS Vita', family: 'PlayStation', detect: /ps ?vita|psvita|vitasdk|henkaku|\bvita\b|pstv/, query: /\b(ps ?vita|vita|pstv)\b/, terms: ['psvita', 'vita'], scene: 'henkaku' },
  { id: 'ps1', label: 'PlayStation', family: 'PlayStation', detect: /\bps1\b|\bpsx\b|playstation 1\b|psone|duckstation/, query: /\b(ps1|psx|playstation 1)\b/, terms: ['ps1', 'psx'] },
  { id: 'ps2', label: 'PS2', family: 'PlayStation', detect: /\bps2\b|playstation 2|pcsx2|open ?ps2 ?loader|\bopl\b|ps2sdk/, query: /\b(ps2|playstation 2)\b/, terms: ['ps2'] },
  { id: 'ps3', label: 'PS3', family: 'PlayStation', detect: /\bps3\b|playstation 3|rpcs3|webman|ps3hen/, query: /\b(ps3|playstation 3)\b/, terms: ['ps3'] },
  { id: 'ps4', label: 'PS4', family: 'PlayStation', detect: /\bps4\b|playstation 4|goldhen|orbis|ps4sdk/, query: /\b(ps4|playstation 4)\b/, terms: ['ps4'], scene: 'goldhen' },
  { id: 'ps5', label: 'PS5', family: 'PlayStation', detect: /\bps5\b|playstation 5|etahen|prospero/, query: /\b(ps5|playstation 5)\b/, terms: ['ps5'] },
  { id: 'xbox', label: 'Xbox', family: 'Xbox', detect: /original xbox|\bxbox\b(?![ -]?(360|one|series))|xemu|nxdk/, query: /\bxbox\b(?! ?(360|one|series))/, terms: ['xbox'] },
  { id: 'x360', label: 'Xbox 360', family: 'Xbox', detect: /xbox[ -]?360|\bx360\b|xenia|\brgh\b|\bjtag\b/, query: /\bxbox ?360\b/, terms: ['"xbox 360"', 'xbox360', 'xbox-360'], scene: 'rgh' },
  { id: 'xone', label: 'Xbox One / Series', family: 'Xbox', detect: /xbox one|xbox series/, query: /\bxbox (one|series)\b/, terms: ['xbox-one'] },
  { id: 'dreamcast', label: 'Dreamcast', family: 'Sega', detect: /dreamcast|kallistios/, query: /\bdreamcast\b/, terms: ['dreamcast'] },
  { id: 'sega', label: 'Sega (Mega Drive, Saturn…)', family: 'Sega', detect: /mega ?drive|\bgenesis\b|sega saturn|master system|game gear/, query: /\b(mega ?drive|genesis|saturn|master system|game gear)\b/, terms: ['megadrive', 'sega'] },
  { id: 'retro-pc', label: 'Ordenadores clásicos', family: 'Otras', detect: /\bamiga\b|commodore|\bc64\b|zx spectrum|\bmsx\b|amstrad|atari/, query: /\b(amiga|commodore|c64|spectrum|msx|amstrad|atari)\b/, terms: ['retrocomputing'] },
  { id: 'handheld-pc', label: 'Portátiles (Steam Deck…)', family: 'Otras', detect: /steam ?deck|anbernic|miyoo|retroid|rg35xx|odin 2/, query: /\b(steam ?deck|anbernic|miyoo|retroid)\b/, terms: ['steam-deck'] },
]

export type ToolTypeId = 'cfw' | 'saves' | 'emulator' | 'dev' | 'storage' | 'customize' | 'maintenance' | 'game' | 'homebrew'

export const TOOL_TYPES: { id: ToolTypeId; label: string; detect: RegExp; query: RegExp; terms: string[] }[] = [
  { id: 'cfw', label: 'CFW, jailbreak y exploits', detect: /custom[ -]firmware|\bcfw\b|jailbreak|softmod|exploit|\bhen\b|goldhen|payload|bootrom|kernel ?hack|henkaku|enso\b|luma3ds|atmosph[eè]re|hekate|\brgh\b|\bjtag\b|letterbomb|\bboot9strap\b/, query: /\b(cfw|custom firmware|firmware (personalizado|modificado|custom)|jailbreak|liberar|liberacion|liberad[ao]s?|softmod|exploits?|hackear|desbloquear)\b/, terms: ['custom-firmware', 'jailbreak', 'exploit'] },
  { id: 'saves', label: 'Partidas guardadas', detect: /\bsaves?\b|savegames?|save[ -]?(data|manager|editor|file)|checkpoint|jksv|apollo|pkhex|pksm/, query: /\b(partidas? guardadas?|guardados|savegames?|saves?|editor de partidas)\b/, terms: ['save-manager', 'savegame', 'save-editor'] },
  { id: 'emulator', label: 'Emuladores', detect: /emulat|\bemu\b|retroarch|libretro/, query: /\b(emuladore?s?|emulacion|emular)\b/, terms: ['emulator'] },
  { id: 'dev', label: 'Desarrollo', detect: /\bsdk\b|toolchain|devkit|libnx|libctru|libnds|vitasdk|ps4sdk|ps2sdk|nxdk|libdragon|compiler|\blibrary\b/, query: /\b(sdk|desarrollar|programar|toolchain|devkit)\b/, terms: ['sdk', 'toolchain'] },
  { id: 'storage', label: 'Tarjetas SD y almacenamiento', detect: /\bsd ?card|\bmicro ?sd|\bsd\b|fat32|exfat|\busb\b|\bhdd\b|hard drive|partition|file ?manager|ftp/, query: /\b(tarjetas? sd|micro ?sd|sd|almacenamiento|disco duro|usb|particion|ftp|gestor de archivos)\b/, terms: ['sd-card', 'file-manager'] },
  { id: 'customize', label: 'Personalización', detect: /\btheme|custom(iz|is)|\bmenu\b|launcher|splash|boot ?(logo|animation)|\bskin|wallpaper|frontend/, query: /\b(personaliza\w*|temas?|menu|launcher|lanzador|fondos?|frontend)\b/, terms: ['theme', 'launcher'] },
  { id: 'maintenance', label: 'Mantenimiento y diagnóstico', detect: /diagnos|maintenance|\bnand\b|unbrick|\bbrick|repair|recovery|backup|system ?info|monitor|benchmark/, query: /\b(mantenimiento|diagnostico|reparar|nand|recuperar|brick|copias? de seguridad)\b/, terms: ['nand', 'backup'] },
  { id: 'game', label: 'Juegos y ports', detect: /\bport\b|\bported\b|demake|\bgame\b|\brpg\b|platformer|decompil/, query: /\b(juegos?|ports?|videojuegos?)\b/, terms: ['game', 'port'] },
  { id: 'homebrew', label: 'Aplicaciones homebrew', detect: /homebrew|\bapp\b|utility|tool/, query: /\bhomebrew\b/, terms: ['homebrew'] },
]

type Evidence = { name: string; fullName?: string; description?: string | null; topics?: string[]; summary?: { text: string } | null }

function evidenceOf(item: Evidence) {
  return fold([item.name.replace(/[-_.]/g, ' '), item.name, item.description ?? '', ...(item.topics ?? []), (item.topics ?? []).join(' ').replace(/-/g, ' '), item.summary?.text ?? ''].join(' '))
}

/** El «Homebrew» de macOS (gestor de paquetes) no es homebrew de consolas. */
export function isMacHomebrew(item: Evidence) {
  const text = evidenceOf(item)
  return /\bhomebrew\b|\bbrew\b/.test(text) &&
    /\bbrew\b|formula|formulae|\bcasks?\b|\btaps?\b|homebrew-core|homebrew-cask|package manager|gestor de paquetes|macos|dotfiles|bootstrap your/.test(text) &&
    detectPlatforms(item, { evidence: text }).length === 0
}

export function detectPlatforms(item: Evidence, { evidence }: { evidence?: string } = {}) {
  const text = evidence ?? evidenceOf(item)
  return PLATFORMS.filter((platform) => platform.detect.test(text)).map((platform) => platform.id)
}

export type PlatformRole = 'target' | 'source' | 'mention'

/**
 * Papel de cada plataforma en la descripción: «for/on/para la Switch» (destino),
 * «from Xbox 360» (origen, p. ej. un juego portado) o simple mención. Las listas
 * («for 3DS and Switch») heredan el papel de la plataforma anterior.
 */
export function platformRoles(item: Evidence) {
  const text = evidenceOf(item)
  const hits: { id: string; index: number }[] = []
  for (const platform of PLATFORMS) {
    const pattern = new RegExp(platform.detect.source, 'g')
    for (const match of text.matchAll(pattern)) hits.push({ id: platform.id, index: match.index ?? 0 })
  }
  hits.sort((a, b) => a.index - b.index)
  const roles = new Map<string, PlatformRole>()
  let previous: PlatformRole = 'mention'
  for (const hit of hits) {
    const before = text.slice(Math.max(0, hit.index - 28), hit.index)
    let role: PlatformRole = 'mention'
    if (/\b(from|desde|of the)\s+(the\s+)?(original\s+)?$/.test(before)) role = 'source'
    else if (/\b(for|on|para|en|to|onto|targeting)\s+(the\s+|la\s+|el\s+|your\s+|tu\s+)?(nintendo\s+|sony\s+|microsoft\s+|original\s+|new\s+)?$/.test(before)) role = 'target'
    else if (/(\band|\bor|\by|,|\/|&)\s*$/.test(before)) role = previous
    previous = role
    const current = roles.get(hit.id)
    if (current !== 'target') roles.set(hit.id, role === 'target' ? 'target' : current === 'source' ? 'source' : role)
  }
  return roles
}

/** ¿La plataforma solo aparece como origen o mención mientras el destino explícito es otra? */
export function isOtherPlatformTarget(item: Evidence, id: string) {
  const roles = platformRoles(item)
  return roles.get(id) !== 'target' && [...roles.entries()].some(([other, role]) => other !== id && role === 'target')
}

export const platformLabel = (id: string) => PLATFORMS.find((platform) => platform.id === id)?.label ?? id
export const toolTypeLabel = (id: string) => TOOL_TYPES.find((type) => type.id === id)?.label ?? id

/** Tipo de herramienta de consola (el primero que encaja, del más específico al más general). */
// Frases que indican un REQUISITO («runs on a jailbroken PS4», «for HEN/CFW consoles»,
// «for RGH and JTAG consoles»), no que el proyecto sea un CFW o un jailbreak.
const REQUIREMENT = /\b(on|for|with|via|requires?|needs?) (an? |the )?(jailbroken|hacked|modded|exploited|hen|cfw|custom firmware|goldhen|rgh|jtag)\b[^.;]{0,30}|\bjailbroken\b|\b(hen|cfw)\/(cfw|hen)\b|\brgh (and|&|\/) jtag\b/g

export function detectToolType(item: Evidence): ToolTypeId | null {
  const text = evidenceOf(item).replace(REQUIREMENT, ' ')
  // Un emulador sigue siéndolo aunque se ejecute en una consola liberada.
  if (/\b(emulator|emulador)\b/.test(text) && !/terminal emulator/.test(text)) return 'emulator'
  return TOOL_TYPES.find((type) => type.detect.test(text))?.id ?? null
}

/** Proyecto relacionado con la escena de consolas (plataforma reconocida o vocabulario de la escena). */
export function isConsoleRelated(item: Evidence) {
  if (isMacHomebrew(item)) return false
  const text = evidenceOf(item)
  if (detectPlatforms(item, { evidence: text }).length) return true
  // Sin una consola reconocida, «custom firmware» o «CFW» a secas no bastan (Flipper Zero,
  // routers, móviles…): se exige vocabulario propio de consolas.
  return /softmod|jailbreak (for|para) (the )?(console|consola)|console homebrew|homebrew (for|para) (the )?\w*\s?consol|(cfw|custom firmware) (for|para) (the )?\w*\s?consol|retro ?gaming|retroarch|libretro/.test(text)
}

/**
 * Repositorios que distribuyen o enlazan copias no autorizadas de juegos (ROMs, ISO,
 * PKG, NSP…). Se excluyen del radar. No afecta a emuladores ni herramientas legítimas.
 */
export function looksLikePiracy(item: Evidence) {
  const text = evidenceOf(item)
  return /\b(free|download|descargar?|direct) (games?|roms?|isos?|pkgs?|nsps?|xcis?|wads?|juegos)\b|\b(roms?|isos?|pkgs?|nsps?) (download|links?|collection|pack|site)s?\b|\bgame ?links?\b|\bwarez\b|\bpira(cy|te|teria)\b|\bshop (for|para) (nsp|pkg)|tinfoil shop|\bnsp ?indexer\b/.test(text)
}

// ---------- Compatibilidad mencionada en el README (sin verificar) ----------

const MODEL_PATTERNS: [RegExp, string][] = [
  [/\bnew (nintendo )?3ds( xl| ll)?\b/i, 'New 3DS'], [/\bold 3ds\b/i, 'Old 3DS'], [/\b2ds( xl)?\b/i, '2DS'],
  [/\bdsi( xl| ll)?\b/i, 'DSi'], [/\bds lite\b/i, 'DS Lite'],
  [/\bswitch (lite)\b/i, 'Switch Lite'], [/\bswitch oled\b|\boled model\b/i, 'Switch OLED'], [/\berista\b/i, 'Switch (Erista)'], [/\bmariko\b/i, 'Switch (Mariko)'], [/\bswitch 2\b/i, 'Switch 2'],
  [/\bvita (1000|fat)\b|\bpch-1\d{3}\b/i, 'PS Vita 1000'], [/\bvita (2000|slim)\b|\bpch-2\d{3}\b/i, 'PS Vita 2000'], [/\bps ?tv\b|\bvita tv\b/i, 'PS TV'],
  [/\bps4 pro\b/i, 'PS4 Pro'], [/\bps4 slim\b/i, 'PS4 Slim'], [/\bps5 (digital|slim|pro)\b/i, 'PS5 $1'],
  [/\bps3 (fat|phat)\b/i, 'PS3 Fat'], [/\bps3 (super ?slim)\b/i, 'PS3 Super Slim'], [/\bps3 slim\b/i, 'PS3 Slim'],
  [/\bxbox 360 (slim|e|phat|fat)\b/i, 'Xbox 360 $1'], [/\bwii mini\b/i, 'Wii mini'], [/\bpsp ?(go|1000|2000|3000|street)\b/i, 'PSP $1'],
]

const FIRMWARE = /\b(?:firmware|fw|system (?:software|version)|sysver|ofw|cfw)\s*(?:v(?:ersion)?\.?\s*)?(?:[:=]\s*)?((?:\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)(?:\s*(?:-|–|to|through|hasta|~|and|y)\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)?(?:\s*(?:\+|or (?:higher|later|newer|above|below|lower)|and (?:up|above|below)))?)/gi
const REQUIRES = /\b(?:requires?|needs?|you (?:must|need to) (?:have|install)|prerequisites?)\b[^.\n]{3,120}/gi
const SCENE = /luma3ds|atmosph[eè]re|hekate|henkaku|enso|goldhen|\bhen\b|homebrew channel|aroma|tiramisu|custom firmware|\bcfw\b|jailbreak|\brgh\b|\bjtag\b|twilight ?menu|nds-bootstrap|sysmodule|devkitpro|\bsd card\b|retroarch/i

export type Compat = { models: string[]; firmware: string[]; requires: string[] }

/** Menciones literales de modelos, firmware y requisitos en el README. No se interpretan. */
export function extractCompat(readme: string): Compat | null {
  const text = readme.replace(/\s+/g, ' ')
  const models = [...new Set(MODEL_PATTERNS.flatMap(([pattern, label]) => {
    const match = text.match(pattern)
    return match ? [label.replace('$1', match[1] ?? '').trim()] : []
  }))].slice(0, 6)
  const firmware = [...new Set([...text.matchAll(FIRMWARE)].map((match) => match[0].trim().replace(/\s+/g, ' ')))].slice(0, 3)
  const requires = [...new Set([...text.matchAll(REQUIRES)].map((match) => match[0].trim()).filter((sentence) => SCENE.test(sentence)))].slice(0, 2)
  return models.length || firmware.length || requires.length ? { models, firmware, requires } : null
}
