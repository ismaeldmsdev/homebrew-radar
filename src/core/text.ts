// Utilidades de texto y fechas compartidas por la web y el recopilador (Node).

const DAY = 86_400_000

/** Minúsculas, sin tildes y con la puntuación convertida en espacios (conserva + y # para C++ / C#). */
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function daysSince(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return Number.POSITIVE_INFINITY
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now - time) / DAY)
}

export function isoDaysAgo(days: number, now = Date.now()) {
  return new Date(now - days * DAY).toISOString().slice(0, 10)
}

export function relativeDays(iso: string | null | undefined, now = Date.now()) {
  const days = Math.floor(daysSince(iso, now))
  if (!Number.isFinite(days)) return 'fecha no verificada'
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 60) return 'hace 1 mes'
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  if (days < 730) return 'hace 1 año'
  return `hace ${Math.floor(days / 365)} años`
}

/** Listas «awesome» y recopilaciones: son recursos, no herramientas. */
export function looksLikeList(name: string, description: string, topics: string[]) {
  const text = `${name} ${description} ${topics.join(' ')}`.toLowerCase()
  return /(^|[\s/_-])awesome([\s_-]|$)|awesome-list|curated list|lista de recursos|list of (awesome|resources|tools)/.test(text)
}
