import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { AITB_POINTS, aitbByName, aitbMaxPoints, aitbSpeedBonus, aitbToolUrl, aitbToolCaption, type AitbActivity } from '../lib/aitbActivities'
import { BonusBar } from './AitbBonusBar'
import { AitbMissionModule } from './AitbMissionModule'
import type { BingoTask } from '../types/database'

// Demo-only mirror of BundleCard/BundleMission (see those files for the real,
// Supabase-backed version). This page's whole design is "reads real boards,
// writes nothing" — every scan/photo/answer already runs in local React
// state — so a bundle tile here needs its own local-state progress instead
// of bingo_bundle_progress rows, or opening it would either write into a
// real team's progress or silently no-op.

type DemoProgress = {
  activityId: string
  checkedInAt: number | null
  stepsDone: number[]
  words: string[]
  bonus: number
  status: 'pending' | 'approved'
}

function emptyProgress(activityId: string): DemoProgress {
  return { activityId, checkedInAt: null, stepsDone: [], words: [], bonus: 0, status: 'pending' }
}

// ── Full-screen mission view, local state only ──────────────────────────────
function DemoBundleMission({ activity, progress, marshalPassword, onBack, onChange }: {
  activity: AitbActivity
  progress: DemoProgress
  marshalPassword: string
  onBack: () => void
  onChange: (p: DemoProgress) => void
}) {
  const [now, setNow] = useState(Date.now())
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [celebrate, setCelebrate] = useState(false)

  const done = progress.status === 'approved'

  useEffect(() => {
    if (!progress.checkedInAt || done) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [progress.checkedInAt, done])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const elapsedMs = progress.checkedInAt ? now - progress.checkedInAt : 0
  const complete = { Easy: 200, Normal: 350, Hard: 500 }[activity.difficulty]
  const points = (progress.checkedInAt ? AITB_POINTS.scan : 0)
    + progress.stepsDone.length * AITB_POINTS.step
    + (done ? complete + progress.bonus : 0)

  const checkIn = () => onChange({ ...progress, checkedInAt: progress.checkedInAt ?? Date.now() })

  const toggleStep = (i: number) => {
    if (!progress.checkedInAt || done) return
    const on = !progress.stepsDone.includes(i)
    onChange({ ...progress, stepsDone: on ? [...progress.stepsDone, i] : progress.stepsDone.filter(x => x !== i) })
  }

  const saveWords = (words: string[]) => {
    if (!progress.checkedInAt || done) return
    onChange({ ...progress, words })
  }

  const tryComplete = () => {
    if (!progress.checkedInAt) return
    setPwError('')
    if (pw.trim() !== marshalPassword) { setPwError('Wrong password — ask the marshal!'); return }
    const bonus = aitbSpeedBonus(Date.now() - progress.checkedInAt, activity)
    onChange({ ...progress, status: 'approved', bonus })
    setPwOpen(false); setPw(''); setCelebrate(true)
  }

  const stepsDone = progress.stepsDone.length

  return createPortal(
    <div className="fixed inset-0 bg-black" style={{ zIndex: 2147482000 }}>
      <div className="relative mx-auto flex h-full w-full max-w-[480px] flex-col bg-gray-950 text-white shadow-2xl">
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

            {progress.checkedInAt && (
              <BonusBar elapsedMs={elapsedMs} activity={activity} completed={done} bankedBonus={progress.bonus} />
            )}

            {/* Steps read as this card's instructions — shown above the
                interactive module so the "spin, keep what you get" rule is
                seen before there's anything to spin. */}
            <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
              ✅ Tick as you go — +{AITB_POINTS.step} each!
            </div>
            <div className="flex flex-col gap-2 mb-5">
              {activity.steps.map((s, i) => {
                const ticked = progress.stepsDone.includes(i)
                const locked = !progress.checkedInAt || done
                return (
                  <button key={i} onClick={() => toggleStep(i)} disabled={locked}
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

            {activity.module && (
              <AitbMissionModule activity={activity} savedWords={progress.words}
                disabled={!progress.checkedInAt || done} onSave={saveWords}
                progressId={`demo-${activity.id}`} />
            )}

            {activity.props.length > 0 && (
              <div className="rounded-2xl px-4 py-3 mb-5"
                   style={{ background: `${activity.color}12`, border: `2px solid ${activity.color}44` }}>
                <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-1.5">🎒 Ask the marshal for</div>
                <ul className="text-sm text-white/80 space-y-0.5">
                  {activity.props.map(pr => <li key={pr}>· {pr}</li>)}
                </ul>
              </div>
            )}

            <div className="rounded-2xl p-3 mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.1)' }}>
              <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">🤖 Your AI tools — tap to open</div>
              <div className="flex flex-wrap gap-2">
                {activity.apps.map(a => {
                  const url = aitbToolUrl(a)
                  const caption = aitbToolCaption(a)
                  const cls = "px-3 py-2 rounded-xl text-sm font-bold transition-transform active:scale-95"
                  const style = { background: `${activity.color}18`, border: `1.5px solid ${activity.color}55`, color: activity.color }
                  const content = (
                    <>
                      <span className="flex items-center gap-1">{a}{url && ' ↗'}</span>
                      {caption && <span className="block text-[10px] font-bold opacity-70 normal-case">{caption}</span>}
                    </>
                  )
                  return url
                    ? <a key={a} href={url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{content}</a>
                    : <span key={a} className={cls} style={style}>{content}</span>
                })}
              </div>
            </div>

            {done && (
              <div className="rounded-2xl p-5 text-center mb-4" style={{ background: 'rgba(52,211,153,0.12)', border: '2px solid #34d399' }}>
                <div className="text-5xl mb-1">🎉</div>
                <div className="font-black text-2xl text-emerald-400">MISSION COMPLETE!</div>
                <div className="text-gray-300 font-bold mt-1">
                  {points} points earned{progress.bonus ? ` — incl. +${progress.bonus} speed bonus!` : ''}
                </div>
              </div>
            )}
          </div>
          <div className="h-4" />
        </div>

        <div className="border-t border-white/10 bg-gray-950/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {!progress.checkedInAt ? (
            <button onClick={checkIn}
              className="w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95"
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
            <p className="text-white/40 text-[11px] text-center mb-2">🧪 Demo marshal password: <span className="font-black text-yellow-300">{marshalPassword}</span></p>
            <input type="password" inputMode="numeric" autoFocus value={pw}
              onChange={e => { setPw(e.target.value); setPwError('') }}
              onKeyDown={e => { if (e.key === 'Enter') tryComplete() }}
              placeholder="Marshal password"
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 font-bold text-center text-lg outline-none mb-2"
              style={{ border: pwError ? '2px solid #f87171' : '2px solid rgba(255,255,255,0.15)' }} />
            {pwError && <div className="text-red-400 text-sm font-bold text-center mb-2">{pwError}</div>}
            <button onClick={tryComplete}
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

// ── Bundle tile: the list of activities, local state only ───────────────────
export function DemoBundleCard({ task, marshalPassword }: { task: BingoTask; marshalPassword: string }) {
  const [items, setItems] = useState<{ id: string; title: string; activity?: AitbActivity }[]>([])
  const [progress, setProgress] = useState<Record<string, DemoProgress>>({})
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: bi } = await supabase.from('bingo_bundle_items')
      .select('activity_id, sort_order, bingo_tasks!bingo_bundle_items_activity_id_fkey(id, title)')
      .eq('bundle_id', task.id).order('sort_order')
    setItems((bi ?? []).map((r) => {
      const t = (r as unknown as { bingo_tasks: { id: string; title: string } }).bingo_tasks
      return { id: t.id, title: t.title, activity: aitbByName(t.title) }
    }))
  }, [task.id])

  useEffect(() => { void load() }, [load])

  const progressFor = (id: string) => progress[id] ?? emptyProgress(id)

  const scoreOf = (p: DemoProgress) => {
    const complete = { Easy: 200, Normal: 350, Hard: 500 }[
      items.find(it => it.id === p.activityId)?.activity?.difficulty ?? 'Normal'
    ]
    return (p.checkedInAt ? 100 : 0) + p.stepsDone.length * 100 + (p.status === 'approved' ? complete + p.bonus : 0)
  }

  const total = items.reduce((n, it) => n + scoreOf(progressFor(it.id)), 0)
  const doneCount = items.filter(it => progressFor(it.id).status === 'approved').length

  const openItem = items.find(it => it.id === open)
  if (openItem?.activity) {
    return (
      <DemoBundleMission
        activity={openItem.activity}
        progress={progressFor(openItem.id)}
        marshalPassword={marshalPassword}
        onBack={() => setOpen(null)}
        onChange={p => setProgress(prev => ({ ...prev, [openItem.id]: p }))}
      />
    )
  }

  return (
    <div className="rounded-3xl border-2 border-white/15 bg-white/5 overflow-hidden">
      <div className="px-5 py-4 bg-white/5 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Activity set</p>
            <p className="text-white font-black text-lg leading-tight">{task.title}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black text-emerald-300 tabular-nums">{total}</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">points</p>
          </div>
        </div>
        <p className="text-white/50 text-xs mt-1.5">
          {doneCount} of {items.length} approved · play them in any order
        </p>
      </div>

      <div className="divide-y divide-white/5">
        {items.map(it => {
          const p = progressFor(it.id)
          const a = it.activity
          const score = scoreOf(p)
          const max = a ? aitbMaxPoints(a) : 0

          return (
            <button key={it.id} onClick={() => setOpen(it.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
              <span className="text-xl flex-shrink-0">{a?.emoji ?? '▪'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-white font-bold text-sm leading-tight">{it.title}</span>
                <span className="block text-white/40 text-[11px] mt-0.5">
                  {a ? `${a.mins} min · ${a.difficulty}` : 'Activity'}
                  {max > 0 && ` · up to ${max} pts`}
                </span>
              </span>
              {p.status === 'approved' ? (
                <span className="px-2 py-1 rounded-lg bg-emerald-400/20 text-emerald-300 text-xs font-black flex-shrink-0">
                  ✓ {score}
                </span>
              ) : p.checkedInAt ? (
                <span className="px-2 py-1 rounded-lg bg-amber-400/20 text-amber-300 text-xs font-black flex-shrink-0">
                  {score} pts
                </span>
              ) : (
                <span className="text-white/25 text-xs flex-shrink-0">Not started</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
