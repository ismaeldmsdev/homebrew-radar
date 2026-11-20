// Idioma NATURAL de la documentación original (README y descripción del autor), no el
// lenguaje de programación. Los resúmenes en español que genera Radar NO cuentan: un
// proyecto documentado en inglés sigue siendo «inglés» aunque tenga resumen en español.
//
// Método: el texto se divide en fragmentos (líneas o frases) y cada fragmento con
// suficientes palabras se asigna a un idioma por su sistema de escritura (chino, ruso…)
// o, en alfabeto latino, por la proporción de palabras funcionales frecuentes («the»,
// «and», «de», «que»…). Nunca por una palabra aislada. Si hay poco texto: no determinado.

export type DocLanguage = 'es' | 'en' | 'multi' | 'other' | 'unknown'
export type DocLanguageInfo = { lang: DocLanguage; languages: string[]; basis: 'readme' | 'description' | 'none' }

export const DOC_LANGUAGE_LABEL: Record<DocLanguage, string> = {
  es: 'Español',
  en: 'Inglés',
  multi: 'Multilingüe',
  other: 'Otro idioma',
  unknown: 'Idioma no determinado',
}

const UNKNOWN: DocLanguageInfo = { lang: 'unknown', languages: [], basis: 'none' }

// Palabras funcionales muy frecuentes y poco ambiguas de cada idioma.
const STOPWORDS: Record<string, Set<string>> = {
  es: new Set('el la los las del que para con una por es se su sus como más este esta estos puede también cuando sin sobre son pero desde hay tu al lo muy ya o ni le les nos fue han ser está están'.split(' ')),
  en: new Set('the and of to is for with this that you it are on can from your be as by an or will use not your have has was which these into their when more also all if its'.split(' ')),
  pt: new Set('o os da do das dos que com uma um em é se seu sua como mais esta pode também quando sem são mas não você ao no na nas nos pelo pela foi está ainda'.split(' ')),
  fr: new Set('le les des du que pour avec une par est se son sa comme plus ce cette peut aussi quand sans sur sont mais pas vous au dans et il'.split(' ')),
  de: new Set('der die das und ist für mit eine ein nicht auch sich auf dem den von zu wird werden sind kann sie es im'.split(' ')),
  it: new Set('il gli della del che per con una sono come più questo questa può anche quando senza sul ma non al nel di è'.split(' ')),
}

const SCRIPTS: [string, RegExp][] = [
  ['zh/ja', /[぀-ヿ㐀-鿿]/g],
  ['ko', /[가-힯]/g],
  ['ru', /[Ѐ-ӿ]/g],
  ['ar', /[؀-ۿ]/g],
  ['he', /[֐-׿]/g],
]

/** Idioma de un fragmento y su «peso» (palabras o caracteres), o null si no hay señal clara. */
function classifySegment(segment: string): { lang: string; weight: number } | null {
  const letters = segment.replace(/[^\p{L}]/gu, '').length
  for (const [lang, pattern] of SCRIPTS) {
    const count = segment.match(pattern)?.length ?? 0
    // Los textos chinos no separan palabras: cada ~2 caracteres equivale a una palabra.
    if (letters >= 8 && count / letters > 0.4) return { lang, weight: Math.round(count / 2) }
  }
  const words = segment.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 5) return null
  const scores = Object.entries(STOPWORDS).map(([lang, set]) => [lang, words.filter((word) => set.has(word)).length] as const).sort((a, b) => b[1] - a[1])
  const [best, second] = scores
  // Exige varias palabras funcionales y una ventaja clara (el español y el portugués comparten muchas).
  if (best[1] < 2 || best[1] < second[1] * 1.5) return null
  return { lang: best[0], weight: words.length }
}

const toDocLanguage = (lang: string): DocLanguage => (lang === 'es' || lang === 'en' ? lang : 'other')

/**
 * Detecta el idioma de la documentación. Con README hacen falta al menos 25 palabras
 * clasificadas; solo con la descripción, al menos 10. Multilingüe: dos o más idiomas
 * con contenido real (≥ 20 % del texto clasificado y ≥ 20 palabras cada uno).
 */
export function detectDocLanguage({ readme, description }: { readme?: string | null; description?: string | null }): DocLanguageInfo {
  const fromReadme = (readme ?? '').trim()
  const basis = fromReadme.length > 0 ? 'readme' : (description ?? '').trim() ? 'description' : 'none'
  if (basis === 'none') return UNKNOWN
  const text = basis === 'readme' ? `${description ?? ''}\n${fromReadme}`.slice(0, 12_000) : (description ?? '')
  const totals = new Map<string, number>()
  for (const segment of text.split(/\n+|(?<=[.!?。！？])\s+/)) {
    const result = classifySegment(segment)
    if (result) totals.set(result.lang, (totals.get(result.lang) ?? 0) + result.weight)
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0)
  if (total < (basis === 'readme' ? 25 : 10)) return { ...UNKNOWN, basis }
  const significant = [...totals.entries()].filter(([, weight]) => weight / total >= 0.2 && weight >= 20).sort((a, b) => b[1] - a[1])
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (significant.length >= 2) return { lang: 'multi', languages: significant.map(([lang]) => lang), basis }
  return { lang: toDocLanguage(ranked[0][0]), languages: [ranked[0][0]], basis }
}

export function normalizeDocLanguage(value: unknown): DocLanguageInfo | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<DocLanguageInfo>
  if (!raw.lang || !(raw.lang in DOC_LANGUAGE_LABEL)) return null
  return { lang: raw.lang, languages: Array.isArray(raw.languages) ? raw.languages.filter((item) => typeof item === 'string') : [], basis: raw.basis === 'readme' || raw.basis === 'description' ? raw.basis : 'none' }
}

/** Texto breve para la ficha: «Inglés (según el README)». */
export function describeDocLanguage(info: DocLanguageInfo) {
  if (info.lang === 'unknown') return info.basis === 'none' ? 'Idioma no determinado: no hay documentación que analizar' : 'Idioma no determinado: hay poco texto para saberlo con seguridad'
  const source = info.basis === 'readme' ? 'según el README' : 'según la descripción (README no comprobado)'
  const names: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán', it: 'italiano', 'zh/ja': 'chino o japonés', ko: 'coreano', ru: 'ruso', ar: 'árabe', he: 'hebreo' }
  const detail = info.lang === 'multi' || info.lang === 'other' ? `: ${info.languages.map((lang) => names[lang] ?? lang).join(', ')}` : ''
  return `${DOC_LANGUAGE_LABEL[info.lang]}${detail} (${source})`
}

// ---------- Filtro ----------

export type DocLanguageFilter = 'all' | DocLanguage
export const DOC_LANGUAGE_FILTERS: DocLanguageFilter[] = ['all', 'es', 'en', 'multi', 'other', 'unknown']
export const DOC_LANGUAGE_FILTER_LABEL: Record<DocLanguageFilter, string> = { all: 'Todos los idiomas', ...DOC_LANGUAGE_LABEL }

/** ¿El proyecto cumple el filtro de idioma? Un multilingüe con español también cuenta como español. */
export function matchesDocLanguage(info: DocLanguageInfo, filter: DocLanguageFilter) {
  if (filter === 'all') return true
  if (filter === 'es' || filter === 'en') return info.lang === filter || (info.lang === 'multi' && info.languages.includes(filter))
  return info.lang === filter
}
