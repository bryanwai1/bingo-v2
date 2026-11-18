// Icon Matching: one player selects both cards. Run: npm test.
// Client behavior, role rendering and the single-player migration contract.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { createIconMatching, type IconState } from './iconMatchingLogic.ts'
import {
  lobbyNeeds, lobbyMessage, playersNeeded, createCoopApi, submitMove, currentState,
  type CoopSnapshot, type CoopMember,
} from './session.ts'

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
    members: [mem('player', 1), mem('observer', 1)].map((m, i) => ({ ...m, slot: m.role === 'player' ? i : null })),
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


test('one player and at least one observer can start; extra players cannot', () => {
  const members = [mem('player', 1), mem('observer', 1)]
  assert.equal(playersNeeded('icon-matching'), 1)
  assert.equal(lobbyNeeds(members, 'icon-matching').canStart, true)
  assert.equal(lobbyMessage(members, 'icon-matching'), null)
  assert.equal(lobbyNeeds([mem('player', 1)], 'icon-matching').canStart, false)
  assert.equal(lobbyNeeds([...members, mem('player', 2)], 'icon-matching').canStart, false)
  assert.equal(playersNeeded('memory-spot'), 1)
})

test('same player selects both cards; first pick stays hidden to observers', () => {
  const first = pick(s0, 0, 0)
  assert.deepEqual(first.picks, { 0: 0 })
  assert.deepEqual(pick(first, 0, 0), first)
  assert.equal((render(first, { isPlayer: false }).match(/<img/g) ?? []).length, 0)
  assert.ok(render(first, { isPlayer: true }).includes('Pick a second card'))
  const both = pick(first, missOf(0), 0)
  assert.deepEqual(both.flipped, [0, missOf(0)])
  assert.equal((render(both, { isPlayer: false }).match(/<img/g) ?? []).length, 2)
  assert.ok(!/<img/i.test(render(both, { isPlayer: true })))
  assert.deepEqual(pick(both, 7, 0), both)
  const hidden = p.reduce(both, { type: 'hide' })
  assert.deepEqual(hidden.flipped, [])
  assert.deepEqual(hidden.picks, {})
})

test('one player completes every pair through the server pick API', async () => {
  const f = fakeServer(), api = createCoopApi(f.rpc)
  f.set(s0)
  const seen = new Set<string>()
  for (let i = 0; i < s0.cards.length; i++) {
    if (seen.has(s0.cards[i])) continue
    seen.add(s0.cards[i])
    await submitMove(api, p, 'p1', f.get(), { type: 'pick', index: i, slot: 0 })
    await submitMove(api, p, 'p1', f.get(), { type: 'pick', index: pairOf(i), slot: 0 })
  }
  assert.equal(f.get().status, 'completed')
  assert.ok(p.isSolved(f.get().state as IconState))
  assert.ok(f.calls.every(([fn]) => fn === 'coop_pick'))
})

test('observers cannot send selections; reload preserves the first selection', async () => {
  const f = fakeServer()
  assert.equal(await submitMove(createCoopApi(f.rpc), p, 'o1', f.get(), { type: 'pick', index: 0, slot: 0 }, 'observer'), null)
  assert.deepEqual(f.calls, [])
  const first = pick(s0, 0, 0)
  const snap = { ...f.get(), state: JSON.parse(JSON.stringify(first)) }
  assert.equal(pick(currentState(snap, p), pairOf(0), 0).last, 'match')
})

test('migration enforces one player and selection order under the session lock', () => {
  const sql = readFileSync(new URL('../../../supabase/coop-games/20261118_icon_matching_single_player.sql', import.meta.url), 'utf8')
  assert.match(sql, /maxp := 1/)
  assert.match(sql, /need := 1/)
  assert.match(sql, /for update/)
  assert.match(sql, /mine := case when picks/)
  assert.ok(!sql.includes('if picks ? mine then'))
})
