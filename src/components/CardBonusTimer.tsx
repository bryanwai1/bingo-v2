import { bonusCheckpoints, bonusPercent, bonusPoints, round2, type BonusWindow } from '../lib/timeBonus'

// The countdown every card shows once a team has opened it — same look as the
// AI Team Building card's timer, but driven by the card's own bonus window.
// Counts UP from the moment the card was opened. The reward holds at 150% for
// the full window, then glides down second by second to base points, passing the
// landmarks on the bar (140, 130 …). Showing the glide is the point: a team that
// can see "Finish NOW for 141.67 pts" moves differently to one that cannot.

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
function fmtMin(mins: number): string {
  const s = Math.round(mins * 60)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const SPARKS = [
  { dx: 10, dy: -14, dur: 0.8, delay: 0 }, { dx: -8, dy: -16, dur: 1.0, delay: 0.15 },
  { dx: 14, dy: -6, dur: 0.7, delay: 0.3 }, { dx: -12, dy: 8, dur: 0.9, delay: 0.45 },
  { dx: 8, dy: 14, dur: 0.85, delay: 0.6 }, { dx: -4, dy: 16, dur: 1.1, delay: 0.75 },
]

const pctColor = (pct: number) =>
  pct >= 150 ? '#34d399' : pct >= 140 ? '#2dd4bf' : pct >= 130 ? '#a3e635'
    : pct >= 120 ? '#fbbf24' : pct > 100 ? '#fb923c' : '#9ca3af'

/**
 * `elapsedMs` is the live clock while the card is open, or the finished time
 * once `completed` — the bar then stops and shows what was earned.
 */
export function CardBonusTimer({ elapsedMs, window, basePoints, completed }: {
  elapsedMs: number
  window: BonusWindow
  basePoints: number
  completed: boolean
}) {
  const fmtPts = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const points = (pct: number) => fmtPts(round2(basePoints * pct / 100))
  const steps = bonusCheckpoints(window)
  const pct = bonusPercent(elapsedMs, window)
  const shown = bonusPoints(basePoints, elapsedMs, window)
  const color = pctColor(pct)
  const timeUp = pct <= 100
  // The landmark the clock is heading for (highlighted on the label row).
  const mins = elapsedMs / 60_000
  const activeIdx = steps.findIndex(c => mins <= c.uptoMin)
  const fmtPct = (n: number) => `${Math.round(n * 100) / 100}%`
  const frac = Math.min(1, elapsedMs / (window.timer * 60_000))
  const segWidth = (i: number) => {
    const from = i === 0 ? 0 : steps[i - 1].uptoMin
    return ((steps[i].uptoMin - from) / window.timer) * 100
  }

  return (
    <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">{completed ? 'Finished in' : '⏱ Your team timer'}</div>
          <div className="font-black text-3xl tabular-nums text-white">{fmtElapsed(elapsedMs)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">{completed ? 'Points earned' : 'Finish NOW for'}</div>
          <div className="font-black text-2xl transition-colors duration-700" style={{ color: completed ? '#34d399' : color }}>
            {fmtPts(shown)} pts
          </div>
          <div className="text-xs font-black" style={{ color: timeUp ? '#9ca3af' : color }}>
            {timeUp ? 'Base points' : `${fmtPct(pct)} bonus`}
          </div>
        </div>
      </div>

      <div className="relative h-5 rounded-full overflow-visible" style={{ background: 'rgba(255,255,255,0.08)' }}>
        {steps.slice(0, -1).map(c => (
          <div key={c.pct} className="absolute top-0 bottom-0 w-px bg-white/25"
               style={{ left: `${(c.uptoMin / window.timer) * 100}%` }} />
        ))}
        <div className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${color}55, ${color})`, minWidth: 10 }} />
        {!completed && !timeUp && (
          <div className="absolute top-1/2" style={{ left: `${frac * 100}%`, color }}>
            <div className="aitb-tip absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: 14, height: 14, background: `radial-gradient(circle, #fff 15%, ${color} 60%)` }} />
            {SPARKS.map((s, i) => (
              <span key={i} className="aitb-spark"
                style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--dur': `${s.dur}s`, '--delay': `${s.delay}s` } as React.CSSProperties} />
            ))}
          </div>
        )}
      </div>

      <div className="flex text-[10px] font-black mt-1 text-gray-400">
        {steps.map((c, i) => (
          <span key={c.pct} className="text-right" style={{ width: `${segWidth(i)}%`, color: i === activeIdx && !timeUp ? color : undefined }}>
            {c.pct}%
            <span className="block font-bold text-gray-500">{points(c.pct)} pts</span>
            <span className="block font-bold text-gray-600">{i === 0 ? '≤' : '@'}{fmtMin(c.uptoMin)}</span>
          </span>
        ))}
        <span className="flex-1 text-right" style={{ color: timeUp ? '#9ca3af' : undefined }}>
          Base
          <span className="block font-bold text-gray-500">{points(100)} pts</span>
          <span className="block font-bold text-gray-600">@{fmtMin(window.timer)}</span>
        </span>
      </div>

      {!completed && (
        <div className="text-gray-500 text-xs font-bold mt-1">
          {timeUp
            ? '⏱ Timer is out — you still earn full base points. Keep going!'
            : pct >= 150 ? '⚡ Full bonus — finish before the clock leaves the gold zone!'
            : '⚡ The bonus drops every second — finish before the bar hits the end!'}
        </div>
      )}
    </div>
  )
}
