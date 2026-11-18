// Detección de versiones nuevas SIN service worker.
// La web no usa service worker: GitHub Pages sirve index.html con caché corta
// (max-age=600) y los recursos llevan un hash en el nombre. El riesgo real en
// iPhone es que la app quede suspendida en memoria y no recargue. Por eso, al
// volver a primer plano, se consulta version.json (sin caché) y se compara el
// archivo JS de entrada publicado con el que está ejecutándose.
import { useCallback, useEffect, useRef, useState } from 'react'

export type BuildInfo = { version: string; entry: string; commit: string | null; builtAt: string }
export type UpdateState = 'dev' | 'idle' | 'checking' | 'current' | 'available' | 'pending' | 'error' | 'offline'

const ATTEMPT_KEY = 'radar-update-attempt'
const CHECK_EVERY = 30 * 60_000

/** Ruta del módulo JS en ejecución, p. ej. «assets/index-AbC123.js». */
export function runningEntry(url = import.meta.url) {
  const match = new URL(url).pathname.match(/assets\/[^/]+\.js$/)
  return match ? match[0] : null
}

export async function fetchBuildInfo(): Promise<BuildInfo> {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`version.json no disponible (${response.status})`)
  const data = await response.json() as BuildInfo
  if (typeof data.entry !== 'string') throw new Error('version.json no tiene el formato esperado')
  return data
}

export function useUpdateCheck() {
  const running = import.meta.env.DEV ? null : runningEntry()
  const [state, setState] = useState<UpdateState>(running ? 'idle' : 'dev')
  const [remote, setRemote] = useState<BuildInfo | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const busy = useRef(false)

  const check = useCallback(async () => {
    if (!navigator.onLine) { setState('offline'); return }
    if (busy.current) return
    busy.current = true
    if (running) setState('checking')
    try {
      const info = await fetchBuildInfo()
      setRemote(info)
      setCheckedAt(new Date().toISOString())
      if (!running) return setState('dev')
      if (info.entry === running) {
        try { sessionStorage.removeItem(ATTEMPT_KEY) } catch { /* sin almacenamiento */ }
        return setState('current')
      }
      // Si ya recargamos para esta versión y seguimos con la antigua, la CDN aún
      // se está propagando: no se vuelve a ofrecer la recarga automática (evita bucles).
      let attempted = null
      try { attempted = sessionStorage.getItem(ATTEMPT_KEY) } catch { /* sin almacenamiento */ }
      setState(attempted === info.entry ? 'pending' : 'available')
    } catch {
      setState(navigator.onLine ? 'error' : 'offline')
    } finally {
      busy.current = false
    }
  }, [running])

  const apply = useCallback(() => {
    if (!remote) return
    try { sessionStorage.setItem(ATTEMPT_KEY, remote.entry) } catch { /* sin almacenamiento */ }
    // Una URL distinta obliga a Safari a pedir index.html de nuevo. Solo cambia la
    // dirección: favoritos y preferencias (localStorage) no se tocan.
    const url = new URL(window.location.href)
    url.searchParams.set('v', remote.entry.replace(/^assets\/|\.js$/g, ''))
    window.location.replace(url.toString())
  }, [remote])

  useEffect(() => {
    // Limpia el parámetro ?v= que deja una actualización.
    const url = new URL(window.location.href)
    if (url.searchParams.has('v')) {
      url.searchParams.delete('v')
      window.history.replaceState(window.history.state, '', url.toString())
    }
    // Primera comprobación tras el primer pintado, para no competir con la carga del catálogo.
    const first = window.setTimeout(() => void check(), 1500)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const onOnline = () => void check()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, CHECK_EVERY)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [check])

  return { state, remote, running, checkedAt, check, apply }
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}
