// Run: npm test  (node:test, Node 22 type stripping; no new dependency).
// These cover the client logic. The SQL RPCs need a database: see
// supabase/coop-games/coop_sessions.test.sql for the manual checks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { gameKeyForTitle } from './gameCards.ts'
import {
  lobbyNeeds, playLabel, coopErrorCode, createCoopApi, submitMove, currentState, readSession, justCompleted,
  type CoopSnapshot, type CoopMember,
} from './session.ts'
import { stubPuzzle, STUB_TAPS } from './stubLogic.ts'

const mem = (role: 'player' | 'observer', n: number): CoopMember => ({ member_id: `${role}${n}`, name: `${role}${n}`, role })
const snap = (over: Partial<CoopSnapshot> = {}): CoopSnapshot => ({
  session_id: 's1', scan_id: 'scan1', game_key: 'stub', status: 'playing', state: stubPuzzle.initState(),
  version: 3, completed_at: null, members: [mem('player', 1), mem('observer', 1)], ...over,
})

// A fake of the server, mirroring the RPC rules, so the client flow is exercised end to end.
function fakeServer() {
  let s = snap({ status: 'lobby', version: 0, members: [] })
  const calls: string[] = []
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    calls.push(fn)
    const role = String(a.p_member).startsWith('p') ? 'player' : 'observer'
    if (fn === 'coop_move') {
      if (role !== 'player') throw new Error('NOT_PLAYER')
      if (s.status === 'completed') throw new Error('ALREADY_COMPLETED')
      if (a.p_base_version !== s.version) throw new Error('STALE')
      s = { ...s, state: a.p_state, version: s.version + 1, status: a.p_solved ? 'completed' : 'playing' }
      return { snapshot: s, first_completion: !!a.p_solved }
    }
    return s
  }
  return { rpc, calls, set: (n: CoopSnapshot) => { s = n }, get: () => s }
}

test('AC-1: only the two game cards map to a game', () => {
  assert.equal(gameKeyForTitle('Icon Matching'), 'icon-matching')
  assert.equal(gameKeyForTitle('Memory & Spot the Difference'), 'memory-spot')
  assert.equal(gameKeyForTitle('  icon matching '), 'icon-matching')
  assert.equal(gameKeyForTitle('Photo Hunt'), null)
  assert.equal(gameKeyForTitle(undefined), null)
})

test('AC-2: button label follows whether a session exists', () => {
  assert.equal(playLabel(null), 'Play')
  assert.equal(playLabel('lobby'), 'Join lobby')
  assert.equal(playLabel('playing'), 'Rejoin game')
  assert.equal(playLabel('completed'), 'View result')
})

test('AC-2: open goes through coop_open with the member and scan', async () => {
  const seen: unknown[] = []
  const api = createCoopApi(async (fn, a) => { seen.push([fn, a]); return snap() })
  const r = await api.open('p1', 'scan1', 'memory-spot')
  assert.deepEqual(seen[0], ['coop_open', { p_member: 'p1', p_scan: 'scan1', p_game_key: 'memory-spot' }])
  assert.equal(r.session_id, 's1')
})

test('AC-3: roster counts roles', () => {
  const n = lobbyNeeds([mem('player', 1), mem('observer', 1), mem('observer', 2)])
  assert.equal(n.players, 1)
  assert.equal(n.observers, 2)
})

test('AC-4: cannot start without a player or without an observer, and says which is missing', () => {
  assert.deepEqual(lobbyNeeds([]).missing, ['player', 'observer'])
  assert.deepEqual(lobbyNeeds([mem('observer', 1)]).missing, ['player'])
  assert.deepEqual(lobbyNeeds([mem('player', 1)]).missing, ['observer'])
  assert.equal(lobbyNeeds([mem('player', 1)]).canStart, false)
  assert.equal(lobbyNeeds([mem('observer', 1)]).canStart, false)
})

test('AC-5: exactly 1 player and 1 to 9 observers can start', () => {
  const obs = (n: number) => Array.from({ length: n }, (_, i) => mem('observer', i))
  assert.equal(lobbyNeeds([mem('player', 1), ...obs(1)]).canStart, true)
  assert.equal(lobbyNeeds([mem('player', 1), ...obs(9)]).canStart, true)
  assert.equal(lobbyNeeds([mem('player', 1), mem('player', 2), ...obs(2)]).canStart, false)
})

test('AC-5: start calls coop_start', async () => {
  const f = fakeServer()
  await createCoopApi(f.rpc).start('p1', 's1')
  assert.deepEqual(f.calls, ['coop_start'])
})

test('AC-6: refusals map to codes the screen can word', () => {
  assert.equal(coopErrorCode(new Error('PLAYER_TAKEN')), 'PLAYER_TAKEN')
  assert.equal(coopErrorCode({ message: 'P0001: OBSERVERS_FULL' }), 'OBSERVERS_FULL')
  assert.equal(coopErrorCode('NOT_ON_TEAM'), 'NOT_ON_TEAM')
  assert.equal(coopErrorCode(new Error('boom')), 'UNKNOWN')
})

test('AC-7: the player move is sent with the base version and the reduced state', async () => {
  const f = fakeServer()
  f.set(snap({ version: 3 }))
  const r = await submitMove(createCoopApi(f.rpc), stubPuzzle, 'p1', f.get(), { type: 'tap' })
  assert.ok(r)
  assert.equal(r.snapshot.version, 4)
  assert.equal((r.snapshot.state as { taps: number }).taps, 1)
  assert.equal(r.firstCompletion, false)
})

test('AC-8: an observer never sends a move; a direct observer request is refused by the server', async () => {
  const f = fakeServer()
  f.set(snap())
  const r = await submitMove(createCoopApi(f.rpc), stubPuzzle, 'o1', f.get(), { type: 'tap' }, 'observer')
  assert.equal(r, null)
  assert.deepEqual(f.calls, [])
  await assert.rejects(createCoopApi(f.rpc).move('o1', 's1', 3, {}, false), /NOT_PLAYER/)
  assert.equal(f.get().version, 3)
})

test('AC-9: solving flags first completion; the card is credited by coop_move, never by a second client call', async () => {
  const f = fakeServer()
  f.set(snap({ state: { v: 1, taps: STUB_TAPS - 1 } }))
  const r = await submitMove(createCoopApi(f.rpc), stubPuzzle, 'p1', f.get(), { type: 'tap' })
  assert.equal(r?.firstCompletion, true)
  assert.equal(r?.snapshot.status, 'completed')
  assert.deepEqual(f.calls, ['coop_move'])
})

test('AC-9: the UI is told the card is credited only on the playing -> completed change, so Undo completion sticks', () => {
  assert.equal(justCompleted('playing', snap({ status: 'completed' })), true)
  assert.equal(justCompleted(undefined, snap({ status: 'completed' })), false) // opened on an already completed (maybe undone) game
  assert.equal(justCompleted('completed', snap({ status: 'completed' })), false)
  assert.equal(justCompleted('lobby', snap({ status: 'playing' })), false)
})

test('AC-10: no client timeout logic ends the game: a late solve still completes', async () => {
  const f = fakeServer()
  f.set(snap({ state: { v: 1, taps: STUB_TAPS - 1 }, completed_at: null }))
  const r = await submitMove(createCoopApi(f.rpc), stubPuzzle, 'p1', f.get(), { type: 'tap' })
  assert.equal(r?.snapshot.status, 'completed')
})

test('AC-11: a second solve is refused and does not complete again', async () => {
  const f = fakeServer()
  f.set(snap({ status: 'completed', state: { v: 1, taps: STUB_TAPS }, version: 9 }))
  assert.equal(await submitMove(createCoopApi(f.rpc), stubPuzzle, 'p1', f.get(), { type: 'tap' }), null)
  assert.deepEqual(f.calls, [])
  await assert.rejects(createCoopApi(f.rpc).move('p1', 's1', 9, {}, true), /ALREADY_COMPLETED/)
})

test('AC-12 (BUG-004-1): after a reset open members drop back to Play, not "another team"', async () => {
  assert.equal(playLabel(null), 'Play')
  // coop_get returns null for a session the admin deleted
  assert.deepEqual(await readSession(createCoopApi(async () => null), 'o1', 's1'), { kind: 'gone' })
})

test('readSession: a replaced player, a wrong team and a dropped connection are told apart', async () => {
  const fail = (m: string) => createCoopApi(async () => { throw new Error(m) })
  assert.deepEqual(await readSession(fail('NOT_IN_SESSION'), 'p1', 's1'), { kind: 'replaced' })
  assert.deepEqual(await readSession(fail('NOT_ON_TEAM'), 'x', 's1'), { kind: 'refused' })
  assert.deepEqual(await readSession(fail('fetch failed'), 'p1', 's1'), { kind: 'offline' })
  const s = snap()
  assert.deepEqual(await readSession(createCoopApi(async () => s), 'p1', 's1'), { kind: 'snap', snap: s })
})

test('AC-13: a late joiner or reconnect reads the current snapshot', async () => {
  const f = fakeServer()
  f.set(snap({ version: 7, state: { v: 1, taps: 4 } }))
  const got = (await createCoopApi(f.rpc).get('o1', 's1'))!
  assert.equal(got.version, 7)
  assert.equal((got.state as { taps: number }).taps, 4)
})

test('AC-14: a non-team read surfaces NOT_ON_TEAM', async () => {
  const api = createCoopApi(async () => { throw new Error('NOT_ON_TEAM') })
  await assert.rejects(api.get('x', 's1'), (e: unknown) => coopErrorCode(e) === 'NOT_ON_TEAM')
})

test('stub puzzle: solved only at STUB_TAPS taps', () => {
  let s = stubPuzzle.initState()
  for (let i = 0; i < STUB_TAPS - 1; i++) s = stubPuzzle.reduce(s, { type: 'tap' })
  assert.equal(stubPuzzle.isSolved(s), false)
  assert.equal(stubPuzzle.isSolved(stubPuzzle.reduce(s, { type: 'tap' })), true)
})

test('AC-7: a just-started session (state {}) shows and reduces from the puzzle initial state', async () => {
  const f = fakeServer()
  f.set(snap({ state: {}, version: 1 }))
  assert.deepEqual(currentState(f.get(), stubPuzzle), { v: 1, taps: 0 })
  const r = await submitMove(createCoopApi(f.rpc), stubPuzzle, 'p1', f.get(), { type: 'tap' })
  assert.equal((r?.snapshot.state as { taps: number }).taps, 1)
})
