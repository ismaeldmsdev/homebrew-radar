// Iconos lineales propios (24×24, trazo 1.8) para una iconografía coherente sin dependencias.
const paths = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z',
  library: 'M5 4h3v16H5zM10 4h3v16h-3zM15.5 4.6l2.9-.8 3.6 15.4-2.9.8z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  heart: 'M12 20s-7-4.4-8.6-9A4.7 4.7 0 0 1 12 6.6 4.7 4.7 0 0 1 20.6 11C19 15.6 12 20 12 20Z',
  hide: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6a15 15 0 0 1-2.6 3.1M6.6 7.6A15 15 0 0 0 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  restore: 'M4 10h11a5 5 0 0 1 0 10h-3M4 10l4-4M4 10l4 4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2',
  gem: 'M6 4h12l3 5-9 11L3 9l3-5Zm-3 5h18M9.5 4 8 9l4 11M14.5 4 16 9l-4 11',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  news: 'M12 2.5l1.9 5.6h5.9l-4.8 3.5 1.8 5.6L12 13.7l-4.8 3.5 1.8-5.6-4.8-3.5h5.9L12 2.5Z',
  tag: 'M3 12V4h8l10 10-8 8L3 12Zm5-4.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  wifi: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5M12 7.5h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, filled = false, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  )
}
