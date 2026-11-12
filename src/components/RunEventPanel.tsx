import { useState, type ReactNode } from 'react'

// The landing screen: an event as numbered steps.
//
// A trainer opening this for the first time previously met a wall of settings
// with no indication of what to do first. Following the steps top to bottom runs
// an event correctly. The first unfinished step is open and highlighted; the rest
// fold up to one line (tap a title to open it). A step that cannot be done yet
// says why, in plain words.

export function Step({ n, last, title, blurb, help, optional, done, current, blocked, warn, action, children }: {
  n: number
  /** The final step has no line under it. */
  last?: boolean
  title: string
  blurb: string
  /** A longer, plain explanation behind a "What's this?" link, for people who have never run an event. */
  help?: string
  /** Not needed to start the game; never the highlighted "Next" step. */
  optional?: boolean
  done?: boolean
  /** The next thing to do: open, highlighted, labelled "Next". */
  current?: boolean
  /** Why this step cannot be done yet; the action is dimmed and unclickable. */
  blocked?: string
  /** Shown instead of the tick when something needs attention. */
  warn?: string
  action?: ReactNode
  children?: ReactNode
}) {
  const [opened, setOpened] = useState(false)
  const open = current || opened
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-9 h-9 rounded-full grid place-items-center text-sm font-black transition-colors
          ${done ? 'a-text' : 'a-text-3 border-2 a-border'}`}
          style={done ? { background: 'var(--a-brand)' } : current ? { borderColor: 'var(--a-brand)', color: 'var(--a-brand)' } : undefined}>
          {done ? '✓' : n}
        </div>
        {!last && <div className="w-px flex-1 mt-2 a-border border-l" />}
      </div>

      <div className={`flex-1 min-w-0 ${open ? 'pb-8' : 'pb-4'}`}>
        <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 ${current ? 'rounded-xl border-2 p-3 -mt-1' : ''}`}
             style={current ? { borderColor: 'var(--a-brand)', background: 'var(--a-surface-2)' } : undefined}>
          <div className="min-w-0">
            <button type="button" onClick={() => setOpened(o => !o)} aria-expanded={open}
              className="text-left min-h-9 flex items-center gap-2">
              <h3 className="text-base font-black a-text leading-tight">{title}</h3>
              {optional && !done && <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border a-border a-text-3">Optional</span>}
              {current && <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                style={{ background: 'var(--a-brand)', color: 'var(--a-text)' }}>Next</span>}
            </button>
            {open && <p className="text-sm a-text-2 mt-0.5 leading-relaxed">{blurb}</p>}
            {open && help && (
              <details className="mt-1">
                <summary className="text-xs font-bold cursor-pointer min-h-8 inline-flex items-center" style={{ color: 'var(--a-brand)' }}>What's this?</summary>
                <p className="text-sm a-text-2 mt-1 leading-relaxed">{help}</p>
              </details>
            )}
            {blocked ? (
              <p className="text-xs font-bold mt-1.5 a-text-2">🔒 {blocked}</p>
            ) : warn && (
              <p className="text-xs font-bold mt-1.5" style={{ color: 'var(--a-live)' }}>⚠ {warn}</p>
            )}
          </div>
          {action && (
            <div className={`sm:flex-shrink-0 [&>*]:min-h-11 sm:[&>*]:min-h-0 ${blocked ? 'opacity-40 pointer-events-none' : ''}`}
                 aria-disabled={!!blocked}>{action}</div>
          )}
        </div>
        {open && children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

/** Shown while the game is on: the few things a trainer needs during play, in one place. */
export function LiveGamePanel({ timer, running, waiting, onReview, children }: {
  timer: string
  /** True while the countdown is ticking, false when paused. */
  running: boolean
  /** Photos, videos, links and answers a marshal has not reviewed yet. */
  waiting: number
  onReview: () => void
  /** Buttons: scoreboard, pause, awards. */
  children: ReactNode
}) {
  return (
    <section className="mb-8 rounded-2xl border-2 p-4" style={{ borderColor: 'var(--a-live)', background: 'var(--a-surface-2)' }}
             aria-label="Game in progress">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--a-live)' }}>
            ● {running ? 'Game is live' : 'Game is paused'}
          </p>
          <p className="text-4xl font-black a-text tabular-nums leading-tight" aria-label="Time left">{timer}</p>
        </div>
        <button type="button" onClick={onReview}
          className="px-4 min-h-11 rounded-xl text-sm font-black a-text active:scale-95 transition-all"
          style={{ background: waiting > 0 ? 'var(--a-brand)' : 'var(--a-surface-3)' }}>
          {waiting > 0 ? `✅ ${waiting} waiting for you to check` : '✅ Nothing waiting to check'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 [&>*]:min-h-11">{children}</div>
    </section>
  )
}

export function RunEventPanel({ done, total, children }: { done: number; total: number; children: ReactNode }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black a-text tracking-tight">Run your event</h1>
        <p className="a-text-2 mt-1.5">
          Do the highlighted step, then the next. When every step is green, you are ready to play.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--a-surface-3)' }}
               role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Steps done">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--a-brand)' }} />
          </div>
          <span className="text-sm font-black a-text whitespace-nowrap">{done} of {total} done</span>
        </div>
      </div>
      {children}
    </div>
  )
}
