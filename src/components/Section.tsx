import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

export function Section({ id, icon, title, subtitle, action, children, layout = 'rail' }: {
  id: string; icon: IconName; title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; layout?: 'rail' | 'grid'
}) {
  return (
    <section className="discover-section" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <div>
          <h2 id={`${id}-title`}><Icon name={icon} size={20} />{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={layout === 'rail' ? 'card-rail' : 'project-grid'}>{children}</div>
    </section>
  )
}

export function SearchForm({ value, onChange, onSubmit, autoFocus = false, compact = false }: {
  value: string; onChange: (value: string) => void; onSubmit: (value: string) => void; autoFocus?: boolean; compact?: boolean
}) {
  return (
    <form className={`search-form${compact ? ' compact' : ''}`} role="search" onSubmit={(event) => { event.preventDefault(); onSubmit(value) }}>
      <label className="sr-only" htmlFor={compact ? 'search-compact' : 'search-main'}>Describe lo que buscas</label>
      <Icon name="search" size={20} />
      <input
        id={compact ? 'search-compact' : 'search-main'}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ej.: herramientas poco conocidas de inteligencia artificial"
      />
      <button type="submit" className="primary-button">Buscar</button>
    </form>
  )
}
