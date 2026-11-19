// Comprobación de que un resumen generado automáticamente no afirma nada que no esté en
// la documentación de origen (descripción, temas, README). Es una red de seguridad
// heurística: detecta plataformas, nombres propios, cifras y tipos de proyecto sin
// respaldo, pero NO garantiza que cada frase sea exacta.
import type { ProjectKind } from './summary.ts'

export type Evidence = { name: string; description: string; topics: string[]; readme: string; language?: string | null; version?: string | null; homepage?: string | null }

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Texto de evidencia en minúsculas y sin tildes. */
export function evidenceText(evidence: Evidence) {
  return fold([evidence.name, evidence.name.replace(/[-_.]/g, ' '), evidence.description, evidence.topics.join(' '), evidence.topics.join(' ').replace(/-/g, ' '), evidence.readme, evidence.language ?? '', evidence.version ?? '', evidence.homepage ?? ''].join('\n'))
}

/**
 * Términos del resumen que exigen respaldo y patrones que valen como respaldo en la
 * documentación (en inglés u otros idiomas). Si el término aparece en el resumen y
 * ninguno de sus patrones aparece en la evidencia, se considera inventado.
 */
const CLAIMS: [RegExp, RegExp][] = [
  [/\bwindows\b/i, /windows|win32|\.exe\b|winget|microsoft store/],
  [/\bmac(os)?\b|\bos x\b/i, /\bmac|osx|os x|apple silicon|darwin|\.dmg\b/],
  [/\blinux\b/i, /linux|ubuntu|debian|fedora|arch|flatpak|appimage|\.deb\b|unix/],
  [/\bandroid\b/i, /android|\.apk\b|f-droid|google play/],
  [/\biphone\b|\bios\b|\bipad\b/i, /\bios\b|iphone|ipad|app store|testflight|ipados/],
  [/\bapple tv\b|\btvos\b/i, /tvos|apple tv/],
  [/\bapple watch\b|\bwatchos\b/i, /watchos|apple watch/],
  [/\bnavegador\b|\bweb\b/i, /web|browser|navegador|http|localhost|online|site|chrome|firefox|pwa/],
  [/\bextensi[oó]n\b/i, /extension|add-?on|plugin|extensi/],
  [/\bdocker\b/i, /docker|container/],
  [/\bkubernetes\b/i, /kubernetes|k8s|helm/],
  [/\braspberry\b/i, /raspberry|\brpi\b/],
  [/\bsteam deck\b/i, /steam ?deck/],
  [/\bnintendo switch\b|\bswitch 2\b/i, /switch/],
  [/\b3ds\b/i, /3ds/],
  [/\bdsi\b/i, /dsi|twl/],
  [/\bnintendo ds\b/i, /\bnds\b|nintendo ds|\bds\b/],
  [/\bwii u\b/i, /wii ?u/],
  [/\bplaystation\b|\bps[1-5]\b/i, /playstation|\bps[1-5x]\b/],
  [/\bxbox\b/i, /xbox/],
  [/\bgame ?boy\b/i, /game ?boy|\bgbc?\b/],
  [/\b(ia|inteligencia artificial)\b/i, /\bai\b|\bllms?\b|\bgpt|machine learning|neural|model|openai|ollama|claude|gemini|inteligencia artificial|\bia\b|whisper|agent/],
  [/\bmcp\b/i, /\bmcp\b|model context protocol/],
  [/\bsin conexi[oó]n\b|\boffline\b/i, /offline|local-first|without (an )?internet|no internet|sin conexi|air-?gapped/],
  [/\bgratu[ií]t[oa]s?\b|\bgratis\b/i, /free|gratis|gratuit|no cost|open[- ]source|\bfoss\b/],
  [/\bc[oó]digo abierto\b|\blibre\b/i, /open[- ]source|\bfoss\b|\bfree software|\bmit\b|\bgpl|apache|license|licencia/],
  [/\bsin anuncios\b/i, /\bno ads\b|ad[- ]free|without ads|sin anuncios/],
  [/\bcifra|\bcifrad|\bencript/i, /encrypt|cipher|cifr|aes|crypt/],
  [/\bvarios idiomas\b|\bmultiling/i, /language|translat|i18n|locali|idioma/],
  [/\btiempo real\b/i, /real[- ]?time|live|tiempo real|instant/],
  [/\bsincroniza/i, /sync|webdav|icloud|replica|sincron/],
]

/** Tipos de proyecto que exigen evidencia explícita en la documentación. */
const KIND_EVIDENCE: Record<ProjectKind, RegExp> = {
  app: /download|install|release|\bapp\b|application|desktop|\.exe|\.dmg|\.apk|app store|google play|flatpak|launch|aplicaci/,
  selfhosted: /self-?host|selfhosted|homelab|docker|your (own )?server|on-?prem|deploy|servidor/,
  config: /config|api[ _-]?key|\.env\b|environment variable|token|setup|set up|docker[- ]compose|server url|requires?|prerequisite|credential|own copy|your own|decrypt|dump/,
  cli: /\bcli\b|command[- ]line|terminal|\btui\b|shell|console|\$ |npx |pip install|cargo install|brew install|go install/,
  library: /\blibrary\b|\bsdk\b|framework|\bcrate\b|package|\bapi\b|import |bindings?|component|developers?|biblioteca/,
  plugin: /plugin|extension|add-?on|\bmod\b|\bmcp\b|integrat|sysmodule|module for|complemento/,
  experimental: /experimental|prototype|proof[- ]of[- ]concept|\bpoc\b|work in progress|\bwip\b|\balpha\b|\bbeta\b|early|preview|research|in development|under (active )?development|not (yet )?(stable|complete|finished)/,
  list: /awesome|curated|list of|collection|catalog|directory|recopila/,
}

// Palabras que pueden ir en mayúscula dentro de una frase sin ser nombres propios.
const COMMON_CAPS = new Set(['es', 'el', 'la', 'los', 'las', 'un', 'una', 'su', 'sus', 'por', 'para', 'con', 'en', 'de', 'del', 'al', 'y', 'o', 'si', 'no', 'ia', 'api', 'apis', 'web', 'pc', 'usb', 'sd', 'url', 'json', 'csv', 'pdf', 'html', 'css', 'sql', 'gpu', 'cpu', 'ram', 'os', 'cli', 'tui', 'ui', 'faq', 'readme', 'github', 'git', 'útil', 'util', 'según', 'segun', 'permite', 'sirve', 'incluye', 'funciona', 'está', 'esta', 'este', 'esto', 'ofrece', 'puede', 'también', 'tambien', 'además', 'ademas', 'pensado', 'pensada', 'dirigido', 'dirigida', 'ideal'])

// Equivalencias: el resumen puede usar el nombre completo o habitual de algo que la
// documentación nombra de otra forma.
const ALIASES: [RegExp, RegExp][] = [
  [/^postgres(ql)?$/, /postgres/],
  [/^(macos|mac|macintosh)$/, /\bmac|osx|apple silicon/],
  [/^(ms-?dos|dos)$/, /\bdos\b/],
  [/^nintendo$/, /nintendo|3ds|\bnds\b|dsi|wii|switch|game ?boy|\bn64\b|famicom|\bnes\b|snes/],
  [/^store$/, /store/],
  [/^roms?$/, /\broms?\b|cartridge|dump/],
  [/^microsoft$/, /microsoft|windows|winget|azure/],
  [/^google$/, /google|gemini|android|gcp/],
  [/^apple$/, /apple|\bios\b|macos|iphone|ipad/],
]

/** Nombres propios (palabras con mayúscula fuera del inicio de frase, siglas o con cifras). */
export function namedTerms(text: string) {
  const terms = new Set<string>()
  const sentences = text.split(/(?<=[.!?:;])\s+|\n/)
  for (const sentence of sentences) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu) ?? []
    words.forEach((word, index) => {
      const clean = word.replace(/[._-]+$/, '')
      const isAcronymOrMixed = /[A-Z].*[A-Z]|\d/.test(clean.slice(1)) || /^[A-Z]{2,}$/.test(clean)
      const isCapitalized = /^\p{Lu}/u.test(clean) && index > 0
      if (/^[\d.,]+$/.test(clean)) return // las cifras se comprueban aparte
      if ((isCapitalized || isAcronymOrMixed) && !COMMON_CAPS.has(fold(clean))) terms.add(clean)
    })
  }
  return [...terms]
}

/** Problemas de respaldo: afirmaciones del resumen que no aparecen en la documentación. */
export function groundingProblems(summary: { text: string; detail?: string | null; kinds?: string[] }, evidence: Evidence) {
  const source = evidenceText(evidence)
  const output = `${summary.text} ${summary.detail ?? ''}`
  const problems: string[] = []
  for (const [claim, support] of CLAIMS) {
    const match = output.match(claim)
    if (match && !support.test(source)) problems.push(`Menciona «${match[0]}» pero la documentación no lo respalda.`)
  }
  for (const number of output.match(/\b\d[\d.,]*\b/g) ?? []) {
    const digits = number.replace(/[.,]$/, '')
    if (!source.includes(fold(digits)) && !source.includes(digits.replace(/[.,]/g, ''))) problems.push(`La cifra «${digits}» no aparece en la documentación.`)
  }
  for (const term of namedTerms(output)) {
    const folded = fold(term)
    const variants = [folded, folded.replace(/[-_.\s]/g, ''), folded.replace(/[-_]/g, ' ')]
    const aliased = ALIASES.some(([name, support]) => name.test(folded) && support.test(source))
    if (!aliased && !variants.some((variant) => source.includes(variant))) problems.push(`El nombre «${term}» no aparece en la documentación.`)
  }
  for (const kind of summary.kinds ?? []) {
    const pattern = KIND_EVIDENCE[kind as ProjectKind]
    if (pattern && !pattern.test(source)) problems.push(`El tipo «${kind}» no tiene respaldo en la documentación.`)
  }
  return [...new Set(problems)]
}

/** Tipos de proyecto con respaldo en la documentación (los demás se descartan). */
export function supportedKinds(kinds: string[], evidence: Evidence) {
  const source = evidenceText(evidence)
  return kinds.filter((kind) => KIND_EVIDENCE[kind as ProjectKind]?.test(source))
}

// Plataformas: si la descripción del autor nombra alguna, el resumen debe mencionar al
// menos una de ellas (evita textos genéricos que no dicen para qué sistema es).
const PLATFORMS: [RegExp, RegExp][] = [
  [/windows/, /\bwindows\b/i],
  [/\bmacos\b|\bmac\b|osx/, /\bmac(os)?\b/i],
  [/\blinux\b/, /\blinux\b/i],
  [/android/, /\bandroid\b/i],
  [/\bios\b|iphone|ipad/, /\biphone\b|\bios\b|\bipad\b/i],
  [/3ds/, /\b3ds\b/i],
  [/\bdsi\b/, /\bdsi\b/i],
  [/nintendo ds|\bnds\b/, /\bnintendo ds\b|\bds\b/i],
  [/wii ?u/, /\bwii u\b/i],
  [/\bswitch\b/, /\bswitch\b/i],
  [/game ?boy/, /\bgame ?boy\b/i],
  [/\bn64\b|nintendo 64/, /\bn64\b|nintendo 64/i],
  [/playstation|\bps[1-5]\b/, /playstation|\bps[1-5]\b/i],
  [/xbox/, /\bxbox\b/i],
  [/steam ?deck/, /\bsteam deck\b/i],
  [/amiga/, /\bamiga\b/i],
]

export function coverageProblems(text: string, evidence: Evidence) {
  const description = fold(`${evidence.description} ${evidence.name.replace(/[-_.]/g, ' ')}`)
  const named = PLATFORMS.filter(([inDescription]) => inDescription.test(description))
  if (named.length && !named.some(([, inSummary]) => inSummary.test(text))) {
    return ['No menciona la plataforma principal que indica la descripción del autor.']
  }
  return []
}

/** Documentación demasiado escasa para un resumen completo. */
export function isThinEvidence(evidence: Evidence) {
  return evidence.readme.trim().length < 300 && evidence.description.trim().length < 120
}
