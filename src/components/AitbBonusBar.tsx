import { AITB_BONUS_MULT, aitbSpeedBonus, type AitbActivity } from '../lib/aitbActivities'

// Shared by every AITB mission surface (bundle and standalone, real and demo)
// — extracted so the timer/bonus ladder looks and behaves identically
// everywhere instead of drifting between four copy-pasted versions.

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

/* Counts UP from check-in; the fill crosses the activity's own milestones and
   the bonus steps down as it passes each one. Showing the ladder is the point —
   a team that can see "+800 until 5:00" moves differently to one that cannot. */
export function BonusBar({ elapsedMs, activity, completed, bankedBonus }: {
  elapsedMs: number; activity: AitbActivity; completed: boolean; bankedBonus: number
}) {
  const tiers = activity.bonusTiers
  const endMin = tiers[tiers.length - 1].uptoMin
  const frac = Math.min(1, elapsedMs / (endMin * 60_000))
  const shown = completed ? bankedBonus : aitbSpeedBonus(elapsedMs, activity)
  const mult = AITB_BONUS_MULT[activity.difficulty] ?? 1
  const tierPts = (i: number) => Math.round(tiers[i].pts * mult)
  const maxPts = tierPts(0)
  const ratio = maxPts ? shown / maxPts : 0
  const barColor = ratio >= 0.9 ? '#34d399' : ratio >= 0.7 ? '#2dd4bf'
    : ratio >= 0.5 ? '#fbbf24' : ratio > 0.2 ? '#fb923c' : '#f87171'
  const sparks = [
    { dx: 10, dy: -14, dur: 0.8, delay: 0 }, { dx: -8, dy: -16, dur: 1.0, delay: 0.15 },
    { dx: 14, dy: -6, dur: 0.7, delay: 0.3 }, { dx: -12, dy: 8, dur: 0.9, delay: 0.45 },
    { dx: 8, dy: 14, dur: 0.85, delay: 0.6 }, { dx: -4, dy: 16, dur: 1.1, delay: 0.75 },
  ]
  const segWidth = (i: number) => {
    const from = i === 0 ? 0 : tiers[i - 1].uptoMin
    return ((tiers[i].uptoMin - from) / endMin) * 100
  }
  return (
    <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">{completed ? 'Finished in' : '⏱ Your team timer'}</div>
          <div className="font-black text-3xl tabular-nums text-white">{fmtElapsed(elapsedMs)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider">{completed ? 'Bonus banked' : 'Finish NOW for'}</div>
          <div className="font-black text-2xl transition-colors duration-700" style={{ color: completed ? '#34d399' : barColor }}>
            +{shown}{!completed && ' pts'}
          </div>
        </div>
      </div>
      <div className="relative h-5 rounded-full overflow-visible" style={{ background: 'rgba(255,255,255,0.08)' }}>
        {tiers.slice(0, -1).map(t => (
          <div key={t.uptoMin} className="absolute top-0 bottom-0 w-px bg-white/25"
               style={{ left: `${(t.uptoMin / endMin) * 100}%` }} />
        ))}
        <div className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${barColor}55, ${barColor})`, minWidth: 10 }} />
        {!completed && (
          <div className="absolute top-1/2" style={{ left: `${frac * 100}%`, color: barColor }}>
            <div className="aitb-tip absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: 14, height: 14, background: `radial-gradient(circle, #fff 15%, ${barColor} 60%)` }} />
            {sparks.map((s, i) => (
              <span key={i} className="aitb-spark"
                style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--dur': `${s.dur}s`, '--delay': `${s.delay}s` } as React.CSSProperties} />
            ))}
          </div>
        )}
      </div>
      <div className="flex text-[10px] font-black mt-1 text-gray-400">
        {tiers.map((t, i) => (
          <span key={t.uptoMin} style={{ width: `${segWidth(i)}%`, color: !completed && shown === tierPts(i) ? barColor : undefined }}>
            +{tierPts(i)}
            <span className="block font-bold text-gray-600">≤{fmtMin(t.uptoMin)}</span>
          </span>
        ))}
        <span style={{ color: !completed && shown === 0 ? '#f87171' : undefined }}>0</span>
      </div>
      {!completed && (
        <div className="text-gray-500 text-xs font-bold mt-1">
          ⚡ Every milestone you pass, the bonus drops — finish before the bar hits the end!
        </div>
      )}
    </div>
  )
}
