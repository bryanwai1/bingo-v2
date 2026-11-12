// Start game runs the board countdown; Stop / Lock game pauses it. The Board
// page and the Run Event page both build their game_started write from this,
// so the two buttons cannot drift apart. Pure, so `npm test` can cover it.

export interface BoardClock {
  timer_end_at?: string | null
  timer_seconds?: number | null
}

export interface TimerPatch {
  timer_end_at?: string | null
  timer_seconds?: number
}

const isRunning = (b: BoardClock, now: number) => !!b.timer_end_at && new Date(b.timer_end_at).getTime() > now

/**
 * Timer columns to write alongside game_started.
 * Start: a countdown with time on it that is not already running starts now.
 * Stop: a running countdown is paused, keeping the remaining seconds. A
 * countdown that already ended, or never ran, is left alone.
 */
export function timerPatchForGame(b: BoardClock, started: boolean, now: number): TimerPatch {
  if (started) {
    const secs = b.timer_seconds ?? 0
    return !isRunning(b, now) && secs > 0 ? { timer_end_at: new Date(now + secs * 1000).toISOString() } : {}
  }
  if (!isRunning(b, now)) return {}
  return {
    timer_seconds: Math.max(0, Math.round((new Date(b.timer_end_at!).getTime() - now) / 1000)),
    timer_end_at: null,
  }
}
