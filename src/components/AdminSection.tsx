import { useState, type ReactNode } from 'react'

// A collapsible settings block.
//
// The admin had seven sections all expanded, so the Board Editor — the thing
// a facilitator actually spends time in — sat two scrolls below the fold.
// Settings you touch once per event now start collapsed with their current
// value shown in the header, so you can confirm a setting without opening it.

export function AdminSection({
  icon, title, blurb, summary, defaultOpen = false, accent = 'violet', children,
}: {
  icon: string
  title: string
  blurb?: string
  /** Current value, shown on the collapsed row so it can be read at a glance. */
  summary?: ReactNode
  defaultOpen?: boolean
  accent?: 'violet' | 'emerald' | 'amber' | 'sky'
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ring = {
    violet:  'hover:border-violet-400/40',
    emerald: 'hover:border-emerald-400/40',
    amber:   'hover:border-amber-400/40',
    sky:     'hover:border-sky-400/40',
  }[accent]

  return (
    <section className={`rounded-2xl border a-border a-surface-2 overflow-hidden transition-colors ${ring}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:a-surface-2 transition-colors"
      >
        <span className="text-xl leading-none flex-shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black a-text leading-tight">{title}</span>
          {blurb && !open && (
            <span className="block text-[11px] a-text-3 leading-snug mt-0.5 truncate">{blurb}</span>
          )}
        </span>
        {summary && !open && (
          <span className="hidden sm:block text-xs font-black flex-shrink-0 mr-2 px-2.5 py-1 rounded-lg" style={{ background: 'var(--a-surface-2)', color: 'var(--a-text-2)' }}>{summary}</span>
        )}
        <span className={`a-text-3 text-xs transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t a-border animate-section">
          {blurb && <p className="text-xs a-text-2 leading-relaxed mb-4">{blurb}</p>}
          {children}
        </div>
      )}
    </section>
  )
}
