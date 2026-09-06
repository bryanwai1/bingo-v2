import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { AITB_POINTS, AITB_BONUS_MULT, aitbSpeedBonus, type AitbActivity } from '../lib/aitbActivities'

// One activity inside a bundle, ported from the company AITB mission page.
//
// The layout is deliberately faithful: hero, check-in, the animated bonus
// track, tickable step cards, tool list, marshal sign-off. The scoring is the
// original too — the only change is where it is stored, since points now land
// on the bingo scoreboard rather than a separate AITB leaderboard.
//
// It portals to document.body and takes the whole viewport. Rendered in place
// it inherited the participant page's background, padding and stray copy, so a
// mission read as a card floating on someone else's screen. A mission is a
// mode, not a panel. On a wide screen the column stays phone-width and centred
// rather than stretching, so the same layout reads as deliberate.
//
// The primary action is pinned to the bottom bar. It used to sit in normal
// flow below the fold on a short phone, which meant the one control that must
// always be reachable was the one you had to hunt for.

export type BundleProgress = {
  id: string
  activity_id: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  checked_in_at: string | null
  steps_done: number[]
  bonus: number
  difficulty: 'Easy' | 'Normal' | 'Hard'
}

function fmtElapsed(ms: number): string {
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
function BonusBar({ elapsedMs, activity, completed, bankedBonus }: {
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

export function BundleMission({ activity, progress, teamId, bundleId, onBack, onChange }: {
  activity: AitbActivity
  progress: BundleProgress | null
  teamId: string
  bundleId: string
  onBack: () => void
  onChange: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [celebrate, setCelebrate] = useState(false)
  const [busy, setBusy] = useState(false)

  const done = progress?.status === 'approved'

  useEffect(() => {
    if (!progress?.checked_in_at || done) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [progress?.checked_in_at, done])

  // The mission owns the screen while it is open, so the page behind must not
  // scroll under it on iOS.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const elapsedMs = progress?.checked_in_at
    ? now - new Date(progress.checked_in_at).getTime() : 0

  const complete = { Easy: 200, Normal: 350, Hard: 500 }[activity.difficulty]
  const points = (progress?.checked_in_at ? AITB_POINTS.scan : 0)
    + (progress?.steps_done?.length ?? 0) * AITB_POINTS.step
    + (done ? complete + (progress?.bonus ?? 0) : 0)

  const checkIn = async () => {
    setBusy(true)
    await supabase.rpc('checkin_bundle_activity', {
      p_team: teamId, p_bundle: bundleId,
      p_activity: progress?.activity_id ?? '', p_difficulty: activity.difficulty,
    })
    setBusy(false); onChange()
  }

  const toggleStep = async (i: number) => {
    if (!progress || done) return
    const on = !progress.steps_done.includes(i)
    await supabase.rpc('toggle_bundle_step', {
      p_team: teamId, p_activity: progress.activity_id, p_step: i, p_on: on,
    })
    onChange()
  }

  const tryComplete = async () => {
    if (!progress?.checked_in_at) return
    setBusy(true); setPwError('')
    const bonus = aitbSpeedBonus(Date.now() - new Date(progress.checked_in_at).getTime(), activity)
    const { error } = await supabase.rpc('review_bundle_activity', {
      p_id: progress.id, p_approve: true, p_code: pw, p_bonus: bonus,
    })
    setBusy(false)
    if (error) { setPwError('Wrong password — ask the marshal!'); return }
    setPwOpen(false); setPw(''); setCelebrate(true); onChange()
  }

  const stepsDone = progress?.steps_done?.length ?? 0

  return createPortal(
    <div className="fixed inset-0 bg-black" style={{ zIndex: 2147482000 }}>
      {/* Phone-width column, centred. Full bleed on a phone, a deliberate
          device-shaped frame on a laptop or projector. */}
      <div className="relative mx-auto flex h-full w-full max-w-[480px] flex-col bg-gray-950 text-white shadow-2xl">

        {/* Scrollable region — everything except the pinned action. */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="relative">
            <img src={`/aitb/hero${activity.id}.jpg`} alt="" className="w-full aspect-video object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />

            <button onClick={onBack}
              className="absolute top-3 left-3 px-4 py-2 rounded-xl font-black text-sm backdrop-blur active:scale-95 transition-transform"
              style={{ background: 'rgba(17,24,39,0.8)', color: activity.color, border: `1.5px solid ${activity.color}66` }}>
              ← Back
            </button>

            <div className="absolute bottom-3 left-4 right-4">
              <div className="text-xs font-black tracking-widest uppercase" style={{ color: activity.color }}>
                Activity {activity.act} · {activity.mins} min · {activity.outType}
              </div>
              <h1 className="text-3xl font-black leading-tight">{activity.emoji} {activity.name}</h1>
            </div>
          </div>

          <div className="px-4 pt-4">
            <p className="text-gray-300 text-base mb-4">{activity.tagline}</p>

            <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-4"
                 style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${activity.color}44` }}>
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">{activity.difficulty}</span>
              <div className="flex-1" />
              <span className="font-black text-xl" style={{ color: activity.color }}>{points} pts</span>
            </div>

            {progress?.checked_in_at && (
              <BonusBar elapsedMs={elapsedMs} activity={activity}
                        completed={done} bankedBonus={progress.bonus} />
            )}

            <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
              ✅ Tick as you go — +{AITB_POINTS.step} each!
            </div>
            <div className="flex flex-col gap-2 mb-5">
              {activity.steps.map((s, i) => {
                const ticked = progress?.steps_done?.includes(i) ?? false
                const locked = !progress?.checked_in_at || done
                return (
                  <button key={i} onClick={() => void toggleStep(i)} disabled={locked}
                    className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                    style={{
                      background: ticked ? `${activity.color}1e` : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${ticked ? activity.color : 'rgba(255,255,255,0.1)'}`,
                      opacity: locked && !ticked ? 0.6 : 1,
                    }}>
                    <span className="text-3xl">{activity.stepEmojis[i]}</span>
                    <span className={`flex-1 font-bold ${ticked ? 'line-through opacity-70' : ''}`}>{s}</span>
                    <span className="text-2xl">{ticked ? '✅' : '⬜'}</span>
                  </button>
                )
              })}
            </div>

            {activity.props.length > 0 && (
              <div className="rounded-2xl px-4 py-3 mb-5"
                   style={{ background: `${activity.color}12`, border: `2px solid ${activity.color}44` }}>
                <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-1.5">🎒 Ask the marshal for</div>
                <ul className="text-sm text-white/80 space-y-0.5">
                  {activity.props.map(pr => <li key={pr}>· {pr}</li>)}
                </ul>
              </div>
            )}

            <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">🤖Your AI tools</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {activity.apps.map(a => (
                <span key={a} className="px-3 py-2 rounded-xl text-sm font-bold"
                      style={{ background: `${activity.color}18`, border: `1.5px solid ${activity.color}55`, color: activity.color }}>
                  {a}
                </span>
              ))}
            </div>

            {done && (
              <div className="rounded-2xl p-5 text-center mb-4" style={{ background: 'rgba(52,211,153,0.12)', border: '2px solid #34d399' }}>
                <div className="text-5xl mb-1">🎉</div>
                <div className="font-black text-2xl text-emerald-400">MISSION COMPLETE!</div>
                <div className="text-gray-300 font-bold mt-1">
                  {points} points earned{progress?.bonus ? ` — incl. +${progress.bonus} speed bonus!` : ''}
                </div>
              </div>
            )}
          </div>

          {/* Breathing room so the last card clears the pinned bar. */}
          <div className="h-4" />
        </div>

        {/* Pinned action. Always reachable with a thumb, never scrolled past. */}
        <div
          className="border-t border-white/10 bg-gray-950/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {!progress?.checked_in_at ? (
            <button onClick={() => void checkIn()} disabled={busy}
              className="w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 disabled:opacity-60"
              style={{ background: activity.color, color: '#000' }}>
              🚀 START MISSION (+{AITB_POINTS.scan} pts)
            </button>
          ) : done ? (
            <button onClick={onBack}
              className="w-full py-4 rounded-2xl font-black text-lg transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.2)', color: '#fff' }}>
              ← Back to the board
            </button>
          ) : (
            <>
              <button onClick={() => { setPwOpen(true); setPwError('') }}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all active:scale-95"
                style={{ background: 'rgba(52,211,153,0.15)', border: '2px solid #34d399', color: '#34d399' }}>
                🏁 DONE? CALL THE MARSHAL!
              </button>
              <div className="text-center text-[11px] font-bold text-gray-500 mt-1.5">
                {stepsDone}/{activity.steps.length} steps ticked · {points} pts so far
              </div>
            </>
          )}
        </div>
      </div>

      {pwOpen && (
        <div className="fixed inset-0 z-10 bg-black/80 flex items-center justify-center p-6" onClick={() => setPwOpen(false)}>
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-sm" style={{ border: '2px solid rgba(52,211,153,0.4)' }}
               onClick={e => e.stopPropagation()}>
            <div className="text-center text-4xl mb-2">🔒</div>
            <div className="font-black text-xl text-center mb-1 text-white">Marshal check</div>
            <p className="text-gray-400 text-sm text-center mb-4">Hand your phone to the marshal! 🙌</p>
            <input type="password" inputMode="numeric" autoFocus value={pw}
              onChange={e => { setPw(e.target.value); setPwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') void tryComplete() }}
              placeholder="Marshal password"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 font-bold text-center text-lg outline-none mb-2"
              style={{ border: pwError ? '2px solid #f87171' : '2px solid rgba(255,255,255,0.15)' }} />
            {pwError && <div className="text-red-400 text-sm font-bold text-center mb-2">{pwError}</div>}
            <button onClick={() => void tryComplete()} disabled={busy}
              className="w-full py-3 rounded-xl font-black text-lg" style={{ background: '#34d399', color: '#000' }}>
              ✅ Confirm complete
            </button>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="fixed inset-0 z-20 bg-black/85 flex items-center justify-center p-6" onClick={() => setCelebrate(false)}>
          <div className="text-center animate-bounce-in">
            <div className="text-8xl mb-3">🏆</div>
            <div className="font-black text-4xl mb-2" style={{ color: activity.color }}>{points} POINTS!</div>
            <div className="text-gray-300 font-bold text-lg">You smashed {activity.name}!</div>
            <div className="text-gray-500 text-sm mt-4">tap anywhere to close</div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
