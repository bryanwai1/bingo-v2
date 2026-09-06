import type { ReactNode } from 'react'

// The landing screen: an event as five numbered steps.
//
// A trainer opening this for the first time previously met a wall of settings
// with no indication of what to do first. The whole point of this panel is
// that following 1 → 5 top to bottom runs an event correctly, and each step
// says plainly whether it is done. No manual, no prior knowledge.

export function Step({ n, title, blurb, done, warn, action, children }: {
  n: number
  title: string
  blurb: string
  done?: boolean
  /** Shown instead of the tick when something needs attention. */
  warn?: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-9 h-9 rounded-full grid place-items-center text-sm font-black transition-colors
          ${done ? 'a-text' : 'a-text-3 border-2 a-border'}`}
          style={done ? { background: 'var(--a-brand)' } : undefined}>
          {done ? '✓' : n}
        </div>
        {n < 5 && <div className="w-px flex-1 mt-2 a-border border-l" />}
      </div>

      <div className="flex-1 pb-8 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-black a-text leading-tight">{title}</h3>
            <p className="text-xs a-text-2 mt-0.5 leading-relaxed">{blurb}</p>
            {warn && (
              <p className="text-xs font-bold mt-1.5" style={{ color: 'var(--a-live)' }}>⚠ {warn}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

export function RunEventPanel({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black a-text tracking-tight">Run your event</h1>
        <p className="a-text-2 mt-1.5">
          Work down the list. Each step turns green when it's ready — when all five are
          green, your event is live.
        </p>
      </div>
      {children}
    </div>
  )
}
