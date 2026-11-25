import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ScheduleClock } from '../lib/cardSchedule'
import type { PauseSpan } from '../types/database'

interface Row { game_started?: boolean | null; game_start_at?: string | null; timer_end_at?: string | null; card_pauses?: PauseSpan[] | null }

/**
 * The board's game clock for card schedules: whether the game started, when,
 * the pause log and the timer end, kept live. `now` ticks every second while
 * `active` (some card has a schedule), so countdowns move; otherwise it stays put.
 */
export function useScheduleClock(sectionId: string | null | undefined, active: boolean): ScheduleClock {
  const [row, setRow] = useState<Row>({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!sectionId || !active) return
    let live = true
    const apply = (r: Row | null) => { if (live && r) setRow(prev => ({ ...prev, ...r })) }
    supabase.from('bingo_sections').select('game_started, game_start_at, timer_end_at, card_pauses').eq('id', sectionId).maybeSingle()
      .then(async ({ data, error }) => {
        if (!error) { apply(data); return }
        // game_start_at / card_pauses are missing until their migrations have run.
        const retry = await supabase.from('bingo_sections').select('game_started, timer_end_at').eq('id', sectionId).maybeSingle()
        apply(retry.data)
      })
    const channel = supabase
      .channel(`schedule-clock-${sectionId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `id=eq.${sectionId}` },
        ({ new: r }) => apply(r as Row))
      .subscribe()
    return () => { live = false; void supabase.removeChannel(channel) }
  }, [sectionId, active])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  return {
    now,
    gameStarted: !!row.game_started,
    gameStartAt: row.game_start_at ? Date.parse(row.game_start_at) : null,
    pauses: row.card_pauses ?? null,
    timerEndAt: row.timer_end_at ? Date.parse(row.timer_end_at) : null,
  }
}
