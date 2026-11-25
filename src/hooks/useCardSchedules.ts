import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hasSchedule, scheduleEvent, scheduleStatus, type CardSchedule, type ScheduleStatus } from '../lib/cardSchedule'
import { supabase } from '../lib/supabase'
import { useScheduleClock } from './useScheduleClock'
import type { BingoTask } from '../types/database'

export interface ScheduleAlert { id: string; kind: 'opened' | 'closing'; text: string }

/** One short two-tone beep. Browsers may refuse it before the page was touched; that is fine. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination)
      const t = ctx.currentTime + i * 0.18
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      o.start(t); o.stop(t + 0.17)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch { /* no sound */ }
}

/**
 * Schedules for the cards on a board: each card's live status, plus a banner,
 * sound and vibration when one opens or is about to close.
 */
export function useCardSchedules(sectionId: string | null | undefined, tasks: BingoTask[], notify = true) {
  // The facilitator can change a schedule (Open now / Lock now) while the board is open,
  // so re-read the scheduled cards every 10 s and let the fresh copy win.
  const [fresh, setFresh] = useState<Record<string, CardSchedule | null>>({})
  const scheduledIds = useMemo(() => tasks.filter(t => hasSchedule(t.schedule)).map(t => t.id).join(','), [tasks])
  useEffect(() => {
    if (!scheduledIds) return
    let live = true
    const load = () => supabase.from('bingo_tasks').select('id, schedule').in('id', scheduledIds.split(','))
      .then(({ data }) => {
        if (live && data) setFresh(Object.fromEntries(data.map(r => [r.id as string, (r.schedule ?? null) as CardSchedule | null])))
      })
    const id = setInterval(load, 10_000)
    return () => { live = false; clearInterval(id) }
  }, [scheduledIds])
  const live = useMemo(() => tasks.map(t => (t.id in fresh ? { ...t, schedule: fresh[t.id] } : t)), [tasks, fresh])
  const scheduled = useMemo(() => live.filter(t => hasSchedule(t.schedule)), [live])
  const clock = useScheduleClock(sectionId, scheduled.length > 0)
  const statuses = useMemo(() => {
    const m = new Map<string, ScheduleStatus>()
    for (const t of scheduled) { const s = scheduleStatus(t.schedule, clock); if (s) m.set(t.placement_id ?? t.id, s) }
    return m
  }, [scheduled, clock])

  const prev = useRef(new Map<string, ScheduleStatus>())
  const warned = useRef(new Set<string>())
  const [alerts, setAlerts] = useState<ScheduleAlert[]>([])

  useEffect(() => {
    if (!notify) return
    const fresh: ScheduleAlert[] = []
    for (const t of scheduled) {
      const key = t.placement_id ?? t.id
      const r = scheduleEvent(t.title, t.schedule, prev.current.get(key), statuses.get(key) ?? null, warned.current.has(key))
      if (r.warned) warned.current.add(key); else warned.current.delete(key)
      if (r.event) fresh.push({ id: `${key}-${r.event.kind}-${Date.now()}`, kind: r.event.kind, text: r.event.text })
    }
    prev.current = statuses
    if (fresh.length === 0) return
    // A tick of the game clock is what makes a card open, so the alert is raised from here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlerts(a => [...a, ...fresh])
    beep()
    try { navigator.vibrate?.([200, 100, 200]) } catch { /* no vibration */ }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        fresh.forEach(f => new Notification('Bingo Dash', { body: f.text }))
      }
    } catch { /* no system notification */ }
  }, [statuses, scheduled, notify])

  const dismiss = useCallback((id: string) => setAlerts(a => a.filter(x => x.id !== id)), [])
  const statusOf = useCallback((t: BingoTask) => statuses.get(t.placement_id ?? t.id) ?? null, [statuses])
  return { statusOf, alerts, dismiss, clock }
}
