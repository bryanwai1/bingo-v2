import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  createCoopApi, coopErrorCode, submitMove, readSession, type CoopPuzzleLogic, type CoopSnapshot, type CoopErrorCode, type CoopRole, type CoopStatus, type MoveResult,
} from '../lib/coopGames/session'

// Single seam the UI uses for a coop session (ADR-004). State reaches clients
// only through coop_get; the Broadcast channel carries a nudge, never data.
// Refetch on nudge, on SUBSCRIBED (reconnect), on tab focus, and every 5 s.
const POLL_MS = 5000

const api = createCoopApi(async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
})

export function useCoopSession(memberId: string | null, scanId: string | null) {
  const [snap, setSnap] = useState<CoopSnapshot | null>(null)
  const [peeked, setPeeked] = useState<CoopStatus | null>(null)
  const [peekState, setPeekState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState<CoopErrorCode | null>(null)
  const [live, setLive] = useState(true)
  const [busy, setBusy] = useState(false)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const sessionId = snap?.session_id ?? null

  const peek = useCallback(async () => {
    if (!memberId || !scanId) return
    setPeekState('loading')
    try { setPeeked(await api.peek(memberId, scanId)); setPeekState('ok') } catch { setPeekState('error') }
  }, [memberId, scanId])
  useEffect(() => { void peek() }, [peek])

  const refetch = useCallback(async () => {
    if (!memberId || !sessionId) return
    const r = await readSession(api, memberId, sessionId)
    if (r.kind === 'snap') { setSnap(r.snap); setLive(true) }
    else if (r.kind === 'offline') setLive(false)
    else {
      // reset by an admin, replaced as player, or wrong team: leave the session
      setSnap(null); setLive(true); setError(r.kind === 'gone' ? null : r.kind === 'replaced' ? 'NOT_IN_SESSION' : 'NOT_ON_TEAM')
      void peek()
    }
  }, [memberId, sessionId, peek])

  const nudge = useCallback(() => {
    void channel.current?.send({ type: 'broadcast', event: 'nudge', payload: {} })
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const ch = supabase.channel(`coop:${sessionId}`)
      .on('broadcast', { event: 'nudge' }, () => { void refetch() })
      .subscribe(s => { if (s === 'SUBSCRIBED') void refetch() })
    channel.current = ch
    const poll = setInterval(() => { void refetch() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') void refetch() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(poll); document.removeEventListener('visibilitychange', onVis)
      supabase.removeChannel(ch); channel.current = null
    }
  }, [sessionId, refetch])

  /** Run an RPC call, keep the snapshot, nudge the others. Errors become `error`. */
  const run = useCallback(async <T extends CoopSnapshot | MoveResult>(f: () => Promise<T>): Promise<T | null> => {
    setBusy(true); setError(null)
    try {
      const r = await f()
      setSnap('snapshot' in r ? r.snapshot : r)
      nudge()
      return r
    } catch (e) {
      const c = coopErrorCode(e)
      setError(c)
      if (c === 'STALE' || c === 'ALREADY_COMPLETED') void refetch()
      return null
    } finally { setBusy(false) }
  }, [nudge, refetch])

  const open = useCallback((gameKey: string) =>
    memberId && scanId ? run(() => api.open(memberId, scanId, gameKey)) : Promise.resolve(null), [memberId, scanId, run])
  const start = useCallback(() =>
    memberId && sessionId ? run(() => api.start(memberId, sessionId)) : Promise.resolve(null), [memberId, sessionId, run])
  const move = useCallback(<S, A>(puzzle: CoopPuzzleLogic<S, A>, action: A, role: CoopRole) =>
    memberId && snap && role === 'player' && snap.status === 'playing'
      ? run(() => submitMove(api, puzzle, memberId, snap, action, role) as Promise<MoveResult>) : Promise.resolve(null), [memberId, snap, run])
  const leave = useCallback(async () => {
    if (memberId && sessionId) { try { await api.leave(memberId, sessionId) } catch { /* leaving is best effort */ } }
    nudge(); setSnap(null); void peek()
  }, [memberId, sessionId, nudge, peek])

  return useMemo(() => ({ snap, peeked, peekState, error, live, busy, open, start, move, leave, retryPeek: peek }),
    [snap, peeked, peekState, error, live, busy, open, start, move, leave, peek])
}
