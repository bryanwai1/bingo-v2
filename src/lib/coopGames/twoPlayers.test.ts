// PRD-007: Icon Matching with two players. Run: npm test.
// The SQL rules (AC-2, AC-8, AC-10 on the real server) are in
// supabase/coop-games/coop_sessions.test.sql; here the client logic and a fake server run.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { createIconMatching, type IconState } from './iconMatchingLogic.ts'
import {
  lobbyNeeds, lobbyMessage, playersNeeded, coopErrorCode, createCoopApi, submitMove, currentState,
  type CoopSnapshot, type CoopMember,
} from './session.ts'
import { stubPuzzle } from './stubLogic.ts'

const srcUrl = new URL('./iconMatching.tsx', import.meta.url)
const tmpUrl = new URL('./.prd007-iconMatching.gen.mjs', import.meta.url)
writeFileSync(tmpUrl, ts.transpileModule(readFileSync(srcUrl, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)
const mod = await import(tmpUrl.href)
rmSync(tmpUrl)
const View = mod.iconMatching.View as (p: Record<string, unknown>) => unknown
const render = (state: IconState, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(View as never, { state, dispatch: () => {}, canAct: true, ...props }))

const p = createIconMatching()
const mem = (role: 'player' | 'observer', n: number): CoopMember => ({ member_id: `${role[0]}${n}`, name: `${role}${n}`, role })
const pick = (s: IconState, index: number, slot: number) => p.reduce(s, { type: 'pick', index, slot })
const s0 = p.initState()
const pairOf = (i: number) => s0.cards.findIndex((c, j) => j !== i && c === s0.cards[i])
const missOf = (i: number) => s0.cards.findIndex((c, j) => j !== i && c !== s0.cards[i])

// Fake of coop_pick / coop_hide: the slot comes from the member, as on the server.
// Calls are serialized (the server locks the session row), there is no base version.
function fakeServer() {
  let s: CoopSnapshot = {
    session_id: 's1', scan_id: 'x', game_key: 'icon-matching', status: 'playing', state: {}, version: 1, completed_at: null,
    members: [mem('player', 1), mem('player', 2), mem('observer', 1)].map((m, i) => ({ ...m, slot: m.role === 'player' ? i : null })),
  }
  const calls: [string, Record<string, unknown>][] = []
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    calls.push([fn, a])
    const me = s.members.find(m => m.member_id === a.p_member)
    if (!me || me.role !== 'player') throw new Error('NOT_PLAYER')
    const cur = Object.keys(s.state as object).length ? s.state as IconState : (a.p_init as IconState)
    let next = cur
    if (fn === 'coop_pick') {
      next = p.reduce(cur, { type: 'pick', index: a.p_index as number, slot: me.slot! })
      if (next === cur && JSON.stringify(cur) !== JSON.stringify(a.p_init)) throw new Error('PICK_LOCKED')
    } else if (fn === 'coop_hide') next = p.reduce(cur, { type: 'hide' })
    else throw new Error('USE_PICK')
    s = { ...s, state: next, version: s.version + 1, status: p.isSolved(next) ? 'completed' : 'playing' }
    return { snapshot: s, first_completion: p.isSolved(next) }
  }
  return { rpc, calls, get: () => s, set: (st: IconState) => { s = { ...s, state: st } } }
}

test('AC-1: Icon Matching needs 2 players and 1 observer; Spot the Difference still 1 and 1', () => {
  assert.equal(playersNeeded('icon-matching'), 2)
  assert.equal(playersNeeded('memory-spot'), 1)
  const one = [mem('player', 1), mem('observer', 1)]
  assert.equal(lobbyNeeds(one, 'icon-matching').canStart, false)
  assert.equal(lobbyNeeds([mem('player', 1), mem('player', 2)], 'icon-matching').canStart, false)
  assert.equal(lobbyNeeds([...one, mem('player', 2)], 'icon-matching').canStart, true)
  assert.equal(lobbyNeeds([...one, mem('player', 2), mem('player', 3)], 'icon-matching').canStart, false)
  assert.equal(lobbyNeeds(one, 'memory-spot').canStart, true)
  assert.equal(lobbyNeeds(one).canStart, true)
  assert.match(lobbyMessage(one, 'icon-matching')!, /Needs 2 players/)
  assert.match(lobbyMessage([mem('player', 1), mem('player', 2)], 'icon-matching')!, /observer/)
  assert.equal(lobbyMessage([...one, mem('player', 2)], 'icon-matching'), null)
  assert.equal(lobbyMessage([mem('observer', 1)], 'memory-spot'), 'Waiting for a player.')
  assert.equal(lobbyMessage([], 'memory-spot'), 'Waiting for a player and a observer.') // wording unchanged from before PRD-007
})

test('AC-2: the refusal codes of a full team are worded for the screen', () => {
  assert.equal(coopErrorCode(new Error('PLAYER_TAKEN')), 'PLAYER_TAKEN')
})

test('AC-3: a tap is that player\'s pick, locked for the turn, sent through coop_pick with no slot', async () => {
  const a = pick(s0, 3, 0)
  assert.deepEqual(a.picks, { 0: 3 })
  assert.deepEqual(a.flipped, [])
  assert.deepEqual(pick(a, 5, 0), a, 'a second card by the same player changes nothing')
  const f = fakeServer()
  const r = await submitMove(createCoopApi(f.rpc), p, 'p1', f.get(), { type: 'pick', index: 3, slot: 1 })
  assert.deepEqual(f.calls[0][0], 'coop_pick')
  assert.equal(f.calls[0][1].p_index, 3)
  assert.ok(!('p_slot' in f.calls[0][1]), 'the client never names the slot')
  assert.deepEqual((r!.snapshot.state as IconState).picks, { 0: 3 }, 'p1 is slot 0 on the server whatever the action says')
})

test('AC-4: the other player\'s card is refused and no pick is recorded', () => {
  const a = pick(s0, 3, 0)
  assert.deepEqual(pick(a, 3, 1), a)
  assert.deepEqual(pick(a, 3, 1).picks, { 0: 3 })
  assert.equal(coopErrorCode({ message: 'PICK_TAKEN' }), 'PICK_TAKEN')
  assert.equal(coopErrorCode({ message: 'PICK_LOCKED' }), 'PICK_LOCKED')
})

test('AC-5: both players see both pick labels, never an icon', () => {
  const mine = pick(s0, 0, 0)
  for (const slot of [0, 1]) {
    for (const canAct of [true, false]) {
      const html = render(mine, { isPlayer: true, canAct, mySlot: slot })
      assert.ok(!/<img/i.test(html)); assert.ok(!/icon-\d\d/.test(html))
    }
  }
  const withOther = { ...mine, picks: { 0: 0, 1: 6 } } as IconState // both picks exist before the server evaluates
  const mineHtml = render(withOther, { isPlayer: true, mySlot: 0 })
  const otherHtml = render(withOther, { isPlayer: true, mySlot: 1 })
  for (const html of [mineHtml, otherHtml]) { assert.ok(html.includes('A1') && html.includes('B3')); assert.ok(!/<img/i.test(html)) }
  assert.ok(mineHtml.includes('A1, your pick') && mineHtml.includes('B3, other player'))
  assert.ok(otherHtml.includes('B3, your pick') && otherHtml.includes('A1, other player'))
})

test('AC-6: observers see nothing until both players have picked', () => {
  const one = pick(s0, 0, 0)
  const html1 = render(one, { isPlayer: false, canAct: false })
  assert.ok(!/<img/i.test(html1)); assert.ok(!html1.includes('flipped')); assert.ok(!html1.includes('pick'))
  assert.equal(render(s0, { isPlayer: false, canAct: false }).replace(/ *aria-live[^>]*/, ''), render(one, { isPlayer: false, canAct: false }).replace(/ *aria-live[^>]*/, ''))
  const b = missOf(0)
  const both = pick(pick(s0, 0, 0), b, 1)
  assert.deepEqual(both.flipped, [0, b])
  assert.equal((render(both, { isPlayer: false, canAct: false }).match(/<img/g) ?? []).length, 2)
})

test('AC-7: both picks are evaluated: match stays, miss turns back, a new turn has no picks', () => {
  const m = pick(pick(s0, 0, 1), pairOf(0), 0)
  assert.deepEqual(m.matched.sort(), [0, pairOf(0)].sort()); assert.deepEqual(m.picks, {}); assert.equal(m.last, 'match')
  const x = missOf(0)
  const miss = pick(pick(s0, 0, 0), x, 1)
  assert.deepEqual(miss.flipped, [0, x]); assert.deepEqual(miss.picks, {}); assert.equal(miss.last, 'miss')
  assert.deepEqual(pick(miss, 7, 0), miss, 'no pick during the viewing period')
  const h = p.reduce(miss, { type: 'hide' })
  assert.deepEqual(h.flipped, []); assert.deepEqual(h.picks, {})
  assert.deepEqual(pick(h, 7, 0).picks, { 0: 7 })
})

test('AC-7: the last pair solves the game once, through coop_pick; hide goes through coop_hide', async () => {
  const f = fakeServer()
  const seen = new Set<string>(); let st = s0
  s0.cards.forEach((c, i) => { if (seen.has(c)) return; seen.add(c); const j = pairOf(i); st = pick(pick(st, i, 0), j, 1) })
  assert.ok(p.isSolved(st))
  // one pair left
  const lastA = s0.cards.findIndex((_, i) => st.matched.includes(i))
  const back = { ...st, matched: st.matched.filter(i => i !== lastA && i !== pairOf(lastA)) }
  f.set(back)
  const api = createCoopApi(f.rpc)
  await submitMove(api, p, 'p1', f.get(), { type: 'pick', index: lastA, slot: 0 })
  const r = await submitMove(api, p, 'p2', f.get(), { type: 'pick', index: pairOf(lastA), slot: 1 })
  assert.equal(r!.firstCompletion, true); assert.equal(r!.snapshot.status, 'completed')
  assert.deepEqual(f.calls.map(c => c[0]), ['coop_pick', 'coop_pick'])
  const g = fakeServer()
  g.set(pick(pick(s0, 0, 0), missOf(0), 1))
  await submitMove(createCoopApi(g.rpc), p, 'p1', g.get(), { type: 'hide' })
  assert.equal(g.calls[0][0], 'coop_hide')
})

test('AC-8: observers send nothing; coop_move is closed for icon-matching on the server; stub still uses coop_move', async () => {
  const f = fakeServer()
  assert.equal(await submitMove(createCoopApi(f.rpc), p, 'o1', f.get(), { type: 'pick', index: 0, slot: 0 }, 'observer'), null)
  assert.deepEqual(f.calls, [])
  await assert.rejects(createCoopApi(f.rpc).move('p1', 's1', 1, {}, false), /USE_PICK/)
  const seen: string[] = []
  await submitMove(createCoopApi(async fn => { seen.push(fn); return { snapshot: {}, first_completion: false } }), stubPuzzle, 'p1',
    { ...f.get(), game_key: 'stub', state: stubPuzzle.initState() }, { type: 'tap' })
  assert.deepEqual(seen, ['coop_move'])
  const sql = readFileSync(new URL('../../../supabase/coop-games/20261104_coop_two_players.sql', import.meta.url), 'utf8')
  assert.match(sql, /create or replace function public\.coop_pick/)
  assert.match(sql, /slot/)
  assert.ok(!/p_slot/.test(sql), 'the slot is never a parameter')
})

test('AC-9: a reload restores both picks from the snapshot', () => {
  const half = { ...pick(s0, 0, 0) }
  const snap: CoopSnapshot = { ...fakeServer().get(), state: JSON.parse(JSON.stringify(half)) }
  assert.deepEqual(currentState(snap, p).picks, { 0: 0 })
  assert.deepEqual(pick(currentState(snap, p), 0, 0), currentState(snap, p), 'a pick already made stays made')
  assert.ok(render(currentState(snap, p), { isPlayer: true, mySlot: 0 }).includes('A1, your pick'))
})

test('AC-10: two simultaneous picks are both recorded (no version clash)', async () => {
  const f = fakeServer()
  const api = createCoopApi(f.rpc)
  const stale = f.get() // both clients hold the same snapshot / version
  const x = 2, y = missOf(2)
  const rpc2 = (m: string, i: number) => submitMove(api, { ...p, initState: () => s0 }, m, stale, { type: 'pick', index: i, slot: 0 })
  const [r1, r2] = await Promise.all([rpc2('p1', x), rpc2('p2', y)])
  assert.ok(r1 && r2)
  const st = f.get().state as IconState
  const picked = [...st.flipped, ...st.matched, ...Object.values(st.picks ?? {})]
  assert.ok(picked.includes(x) && picked.includes(y), 'both picks survive')
})
