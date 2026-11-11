// Pure client logic for cooperative game sessions (ADR-004). No React, no
// supabase import, so it runs under node:test. The server (SQL RPCs) is the
// authority on team, role and version; nothing here is trusted for that.

export type CoopRole = 'player' | 'observer'
export type CoopStatus = 'lobby' | 'playing' | 'completed'
export const MAX_OBSERVERS = 9

export interface CoopMember { member_id: string; name: string; role: CoopRole; slot?: number | null }
export interface CoopSnapshot {
  session_id: string
  scan_id: string
  game_key: string
  status: CoopStatus
  state: unknown
  version: number
  completed_at: string | null
  members: CoopMember[]
}
export interface MoveResult { snapshot: CoopSnapshot; firstCompletion: boolean }

/** The part of a puzzle that is plain logic (the React View is added in stub.tsx). */
export interface CoopPuzzleLogic<S, A> {
  key: string
  initState(): S
  reduce(s: S, a: A): S
  isSolved(s: S): boolean
  /** Games where both players act in the same turn (PRD-007): an action that the server
   *  merges itself (coop_pick / coop_hide) instead of a whole-state coop_move. */
  remote?(a: A): { kind: 'pick'; index: number } | { kind: 'hide' } | null
}

/** Players a game needs (PRD-007): Icon Matching 2, everything else 1. The server enforces the same. */
export const playersNeeded = (gameKey?: string) => (gameKey === 'icon-matching' ? 2 : 1)

export function lobbyNeeds(members: CoopMember[], gameKey?: string) {
  const need = playersNeeded(gameKey)
  const players = members.filter(m => m.role === 'player').length
  const observers = members.filter(m => m.role === 'observer').length
  const missing: CoopRole[] = []
  if (players < need) missing.push('player')
  if (observers < 1) missing.push('observer')
  return { players, observers, need, missing, canStart: players === need && observers >= 1 && observers <= MAX_OBSERVERS }
}

/** What the lobby says is missing, or null when the game can start. */
export function lobbyMessage(members: CoopMember[], gameKey?: string): string | null {
  const n = lobbyNeeds(members, gameKey)
  if (n.canStart) return null
  if (n.need === 1) return `Waiting for ${n.missing.map(m => `a ${m}`).join(' and ') || 'exactly one player'}.`
  const parts = [n.players < n.need ? `${n.need} players` : '', n.observers < 1 ? 'at least 1 observer' : ''].filter(Boolean)
  return parts.length ? `Needs ${parts.join(' and ')}.` : `Needs exactly ${n.need} players.`
}

export function playLabel(status: CoopStatus | null): string {
  return status === 'lobby' ? 'Join lobby' : status === 'playing' ? 'Rejoin game' : status === 'completed' ? 'View result' : 'Play'
}

const CODES = ['NOT_ON_TEAM', 'PLAYER_TAKEN', 'OBSERVERS_FULL', 'LOBBY_INCOMPLETE', 'NOT_PLAYER',
  'STALE', 'PICK_LOCKED', 'PICK_TAKEN', 'ALREADY_COMPLETED', 'NOT_PLAYING', 'NOT_ADMIN', 'NOT_IN_SESSION', 'STATE_TOO_BIG'] as const
export type CoopErrorCode = typeof CODES[number] | 'UNKNOWN'

export function coopErrorCode(e: unknown): CoopErrorCode {
  const msg = typeof e === 'string' ? e : (e as { message?: string } | null)?.message ?? ''
  return CODES.find(c => msg.includes(c)) ?? 'UNKNOWN'
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>

/** Thin typed wrapper over the RPCs. `rpc` must throw on error. */
export function createCoopApi(rpc: Rpc) {
  return {
    peek: async (member: string, scan: string) =>
      (await rpc('coop_peek', { p_member: member, p_scan: scan })) as CoopStatus | null,
    open: async (member: string, scan: string, gameKey: string) =>
      (await rpc('coop_open', { p_member: member, p_scan: scan, p_game_key: gameKey })) as CoopSnapshot,
    /** null when the session no longer exists (reset by an admin). */
    get: async (member: string, session: string) =>
      (await rpc('coop_get', { p_member: member, p_session: session })) as CoopSnapshot | null,
    start: async (member: string, session: string) =>
      (await rpc('coop_start', { p_member: member, p_session: session })) as CoopSnapshot,
    leave: async (member: string, session: string) => { await rpc('coop_leave', { p_member: member, p_session: session }) },
    /** PRD-007: each player's own pick. The server decides the slot; `init` is used only if no state exists yet. */
    pick: async (member: string, session: string, index: number, init: unknown): Promise<MoveResult> => {
      const r = (await rpc('coop_pick', { p_member: member, p_session: session, p_index: index, p_init: init })) as
        { snapshot: CoopSnapshot; first_completion: boolean }
      return { snapshot: r.snapshot, firstCompletion: r.first_completion }
    },
    /** End of the viewing period; safe to call from both players (no-op when nothing is shown). */
    hide: async (member: string, session: string): Promise<MoveResult> => {
      const r = (await rpc('coop_hide', { p_member: member, p_session: session })) as
        { snapshot: CoopSnapshot; first_completion: boolean }
      return { snapshot: r.snapshot, firstCompletion: r.first_completion }
    },
    move: async (member: string, session: string, baseVersion: number, state: unknown, solved: boolean): Promise<MoveResult> => {
      const r = (await rpc('coop_move', {
        p_member: member, p_session: session, p_base_version: baseVersion, p_state: state, p_solved: solved,
      })) as { snapshot: CoopSnapshot; first_completion: boolean }
      return { snapshot: r.snapshot, firstCompletion: r.first_completion }
    },
  }
}
export type CoopApi = ReturnType<typeof createCoopApi>

/** A session starts with state {}: the puzzle's own initial state stands in until the first move. */
export function currentState<S, A>(snap: CoopSnapshot, puzzle: CoopPuzzleLogic<S, A>): S {
  const st = snap.state as object | null
  return st && Object.keys(st).length > 0 ? (st as S) : puzzle.initState()
}

/** Player action: reduce locally, send with the base version. Observers send nothing. */
export async function submitMove<S, A>(
  api: CoopApi, puzzle: CoopPuzzleLogic<S, A>, memberId: string, snap: CoopSnapshot, action: A, role: CoopRole = 'player',
): Promise<MoveResult | null> {
  if (role !== 'player' || snap.status !== 'playing') return null
  const remote = puzzle.remote?.(action)
  if (remote) {
    return remote.kind === 'pick' ? api.pick(memberId, snap.session_id, remote.index, puzzle.initState())
      : api.hide(memberId, snap.session_id)
  }
  const next = puzzle.reduce(currentState(snap, puzzle), action)
  return api.move(memberId, snap.session_id, snap.version, next, puzzle.isSolved(next))
}

/** coop_move credits the card itself (same transaction). The page only refreshes its copy,
 *  and only on the change playing -> completed, so an "Undo completion" is never healed back. */
export const justCompleted = (prev: CoopStatus | undefined, snap: CoopSnapshot) =>
  prev === 'playing' && snap.status === 'completed'

export type SessionRead =
  | { kind: 'snap'; snap: CoopSnapshot }
  | { kind: 'gone' }      // an admin reset deleted the session: back to Play
  | { kind: 'replaced' }  // a newer player took over this seat
  | { kind: 'refused' }   // member is not on the session's team
  | { kind: 'offline' }

/** One poll of coop_get, sorted into what the screen should do. */
export async function readSession(api: CoopApi, member: string, session: string): Promise<SessionRead> {
  try {
    const snap = await api.get(member, session)
    return snap ? { kind: 'snap', snap } : { kind: 'gone' }
  } catch (e) {
    const c = coopErrorCode(e)
    return c === 'NOT_IN_SESSION' ? { kind: 'replaced' } : c === 'NOT_ON_TEAM' ? { kind: 'refused' } : { kind: 'offline' }
  }
}
