// Per-team card draw, shown above a card's instructions.
//
// Three Mall Hunt cards tell the team to open the card for something — their
// four colours, their riddle, their four checkpoints. This is what supplies it.
// The draw is stored, so reopening the card shows the same result rather than
// dealing again, and it is spread across the bank so teams differ.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { pickItems, type DrawItem } from '../lib/cardDraw'

export function CardDrawPanel({ teamId, taskId, count, heading, demo = false }: {
  teamId: string
  taskId: string
  /** How many items to deal. */
  count: number
  /** e.g. "Your 4 colours" — what the team is being given. */
  heading: string
  demo?: boolean
}) {
  const [items, setItems] = useState<DrawItem[]>([])
  const [drawn, setDrawn] = useState<DrawItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHints, setShowHints] = useState(false)
  const demoDrawn = useRef<DrawItem[]>([])
  // The result is decided the moment you tap; the shuffle is presentation only,
  // so a slow network can never leave a team watching it spin forever.
  const [rolling, setRolling] = useState(false)
  const [settled, setSettled] = useState(0)
  const [flash, setFlash] = useState<DrawItem[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => () => { timers.current.forEach(window.clearTimeout) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: bank } = await supabase.from('bingo_draw_items')
        .select('id, position, label, hint, hex').eq('task_id', taskId).order('position')
      const list = (bank ?? []) as DrawItem[]
      setItems(list)

      if (demo) { setDrawn(demoDrawn.current); return }
      const { data: mine } = await supabase.from('bingo_draw_assignments')
        .select('slot, item_id').eq('team_id', teamId).eq('task_id', taskId).order('slot')
      const byId = new Map(list.map(i => [i.id, i]))
      setDrawn((mine ?? []).map(a => byId.get(a.item_id)).filter((x): x is DrawItem => !!x))
    } finally {
      setLoading(false)
    }
  }, [teamId, taskId, demo])

  useEffect(() => { void load() }, [load])

  const draw = async () => {
    if (items.length === 0) return
    setBusy(true)
    setError(null)
    try {
      // Favour items other teams have not had yet.
      let usage: Record<string, number> = {}
      if (!demo) {
        const { data: taken } = await supabase.from('bingo_draw_assignments')
          .select('item_id').eq('task_id', taskId)
        for (const t of taken ?? []) usage[t.item_id] = (usage[t.item_id] ?? 0) + 1
      } else {
        usage = {}
      }
      const picked = pickItems(items, count, usage)

      if (!demo) {
        const { error: err } = await supabase.from('bingo_draw_assignments').insert(
          picked.map((item, slot) => ({ team_id: teamId, task_id: taskId, item_id: item.id, slot })),
        )
        if (err) { setError(err.message); return }
      } else {
        demoDrawn.current = picked
      }
      runShuffle(picked)
    } finally {
      setBusy(false)
    }
  }

  const SPIN_MS = 900       // everything blurs past
  const STAGGER_MS = 420    // then slots land one by one

  const runShuffle = (picked: DrawItem[]) => {
    // Someone who has asked for less motion gets the result straight away.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDrawn(picked)
      setSettled(picked.length)
      return
    }
    setDrawn(picked)
    setSettled(0)
    setRolling(true)

    const tick = window.setInterval(() => {
      setFlash(Array.from({ length: picked.length },
        () => items[Math.floor(Math.random() * items.length)]))
    }, 80)

    picked.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setSettled(i + 1), SPIN_MS + i * STAGGER_MS))
    })
    timers.current.push(window.setTimeout(() => {
      window.clearInterval(tick)
      setRolling(false)
    }, SPIN_MS + picked.length * STAGGER_MS))
  }

  if (loading) return null
  // A card with an empty bank shows nothing rather than an empty promise.
  if (items.length === 0) return null

  const hasHints = drawn.some(d => d.hint)

  return (
    <div className="mb-5">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎲 {heading}
      </div>

      {rolling && (
        <p className="text-white/60 text-xs font-black text-center mb-2 uppercase tracking-widest">
          Drawing…
        </p>
      )}

      {drawn.length === 0 ? (
        <button
          onClick={() => void draw()}
          disabled={busy}
          className="w-full py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {busy ? 'Drawing…' : count === 1 ? 'Draw your card' : `Draw your ${count}`}
        </button>
      ) : (
        <>
          <div className={count === 1 ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
            {drawn.map((real, i) => {
              const landed = i < settled
              const d = landed ? real : (flash[i] ?? real)
              return (
              <div
                key={real.id}
                className={`rounded-2xl px-3 py-3 flex items-center gap-3 ${landed ? 'animate-bounce-in' : ''}`}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `2px solid ${d.hex ?? 'rgba(255,255,255,0.25)'}`,
                  opacity: landed ? 1 : 0.55,
                  transition: 'opacity .12s linear',
                }}
              >
                {d.hex && (
                  <span className="w-9 h-9 rounded-xl flex-shrink-0 border border-white/30"
                        style={{ background: d.hex }} />
                )}
                <div className="min-w-0">
                  <p className="text-white font-black leading-snug">
                    {count > 1 && !d.hex && <span className="text-white/40 mr-1">{i + 1}.</span>}
                    {d.label}
                  </p>
                  {landed && d.hint && showHints && (
                    <p className="text-white/60 text-xs font-bold mt-0.5">💡 {d.hint}</p>
                  )}
                </div>
              </div>
              )
            })}
          </div>

          {/* A nudge only. The answer lives on the item too, but is never
              fetched here — solving it is the point of the card. */}
          {hasHints && !rolling && (
            <button
              onClick={() => setShowHints(v => !v)}
              className="mt-2 w-full py-2 rounded-xl bg-white/10 border border-white/25 text-white/70 text-xs font-black"
            >
              {showHints ? 'Hide hint' : '💡 Need a hint?'}
            </button>
          )}
        </>
      )}

      {error && (
        <p className="mt-2 text-red-300 text-xs font-bold text-center">{error}</p>
      )}
    </div>
  )
}
