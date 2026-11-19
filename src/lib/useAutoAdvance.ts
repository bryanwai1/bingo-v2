import { useCallback, useEffect, useState } from 'react'

/** Seconds each slide stays up before the next one slides in on its own. */
export const HERO_ROTATE_MS = 4000
export const INSTRUCTION_ROTATE_MS = 8000

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Index for a carousel that moves on by itself so players notice there is more
 * than one picture or instruction. The first time the player acts (Next, Back,
 * a dot, a swipe, a tap) it stops for good: they are driving now.
 * `paused` holds it without cancelling (e.g. a video is playing).
 */
export function useAutoAdvance(total: number, intervalMs: number, paused = false) {
  const [idx, setIdx] = useState(0)
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    if (stopped || paused || total < 2 || reducedMotion()) return
    const t = setInterval(() => setIdx(i => (i + 1) % total), intervalMs)
    return () => clearInterval(t)
  }, [stopped, paused, total, intervalMs])

  /** A player-driven move: change slide and stop auto-play. */
  const go = useCallback((next: number | ((i: number) => number)) => {
    setStopped(true)
    setIdx(next)
  }, [])
  /** Stop auto-play without moving (the player touched the content). */
  const stop = useCallback(() => setStopped(true), [])
  /** Back to the first slide and running again (a new card opened). */
  const reset = useCallback(() => { setIdx(0); setStopped(false) }, [])

  return { idx: total > 0 ? Math.min(idx, total - 1) : 0, go, stop, reset, stopped }
}
