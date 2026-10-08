import { useEffect, useState } from 'react'
import { bonusPercent, bonusPoints } from '../lib/timeBonus'

// A small, moving picture of the bonus timer: full reward for the first stretch,
// then a steady fall to normal points. Used wherever an admin sets the window
// (the Apply-to-all dialog and Board settings) so it is explained the same way
// everywhere. Plays once when shown (give it a new `key` to play it again); drag
// the dot to try any finishing time.

/** Dot and label colour along the bonus: green at full, warming to grey at normal points. */
const bonusColor = (pct: number) =>
  pct >= 150 ? '#10b981' : pct >= 135 ? '#84cc16' : pct >= 120 ? '#fbbf24' : pct > 100 ? '#fb923c' : '#9ca3af'

const fmt = (n: number) => String(Math.round(n * 100) / 100)

export function BonusTimerPreview({ full, timer, base = 100 }: {
  full: number
  timer: number
  /** The card's points, for the example. */
  base?: number
}) {
  const win = { full, timer }
  const span = timer + 5                      // the bar runs a little past the end
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(true)

  // Replay: the dot glides from 0 to the end of the bar, like a team's clock running.
  useEffect(() => {
    if (!playing) return
    const startedAt = performance.now()
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / 7000)
      setAt(t * span)
      if (t >= 1) setPlaying(false)
    }, 40)
    return () => clearInterval(id)
  }, [playing, span])

  const shown = Math.min(at, span)
  const pts = (m: number) => Math.round(bonusPoints(base, m * 60_000, win) * 100) / 100
  const pos = (m: number) => `${(m / span) * 100}%`
  const pct = bonusPercent(shown * 60_000, win)
  const color = bonusColor(pct)

  return (
    <div className="mt-3 rounded-xl a-surface-2 px-3 py-3">
      <ul className="text-xs a-text-2 mb-2 space-y-1">
        <li className="flex gap-2"><span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />
          <span>Within <b>{fmt(full)} min</b>: full <b>150% bonus</b> ({fmt(pts(0))} pts)</span></li>
        <li className="flex gap-2"><span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#fbbf24' }} />
          <span>Between {fmt(full)} and {fmt(timer)} min: the bonus shrinks a little every second</span></li>
        <li className="flex gap-2"><span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#9ca3af' }} />
          <span>From <b>{fmt(timer)} min</b>: bonus is over, <b>base card points only</b> ({fmt(base)} pts)</span></li>
      </ul>
      {/* Drag the dot, or press Replay to watch a team's clock run. */}
      <div className="relative pt-7 select-none">
        <div className="absolute top-0 -translate-x-1/2 px-2 py-0.5 rounded-full text-[11px] font-black text-white whitespace-nowrap"
          style={{ left: pos(shown), background: color }}>
          {fmt(pts(shown))} pts
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'rgba(120,120,120,0.25)' }}>
          <div className="absolute inset-y-0 left-0" style={{ width: pos(full), background: '#10b981' }} />
          <div className="absolute inset-y-0" style={{ left: pos(full), width: `${((timer - full) / span) * 100}%`, background: 'linear-gradient(90deg, #10b981, #fbbf24)' }} />
        </div>
        <div className="absolute w-4 h-4 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: pos(shown), top: 'calc(1.75rem + 6px)', background: `radial-gradient(circle, #fff 20%, ${color} 70%)`, boxShadow: `0 0 10px ${color}` }} />
        <input type="range" min={0} max={span} step={0.1} value={shown} aria-label="Finishing time in minutes"
          onChange={e => { setPlaying(false); setAt(parseFloat(e.target.value)) }}
          className="absolute left-0 right-0 w-full h-5 opacity-0 cursor-ew-resize" style={{ top: '1.4rem' }} />
      </div>
      <div className="relative h-4 mt-1 text-[10px] a-text-3 font-bold">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(full) }}>{fmt(full)} min</span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(timer) }}>{fmt(timer)} min</span>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button type="button" onClick={() => { setAt(0); setPlaying(true) }}
          className="px-3 py-1 rounded-full border a-border a-surface text-[11px] font-bold a-text-2 hover:border-teal-500 transition-colors flex-shrink-0">
          {playing ? '▶ Playing…' : '↻ Replay'}
        </button>
        <p className="text-xs a-text-2">
          Finish at <b>{fmt(shown)} min</b> → <b style={{ color }}>{fmt(pts(shown))} pts</b>
          <span className="a-text-3"> · {fmt(pct)}% of {fmt(base)}</span>
        </p>
      </div>
    </div>
  )
}
