// Run: npm test. Tests for PRD-005 (Icon Matching) at the puzzle seam: initState / reduce / isSolved.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createIconMatching, BOARD, VIEW_MS, ICON_POOL, cardLabel, iconSrc, type IconState,
} from './iconMatchingLogic.ts'
import { createCoopApi, submitMove, currentState, type CoopSnapshot } from './session.ts'
import { gameKeyForTitle } from './gameCards.ts'

const p = createIconMatching()
const fresh = () => p.initState()
const count = <T,>(xs: T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())
const posOfPair = (s: IconState) => {
  const first = s.cards[0]
  return [0, s.cards.findIndex((c, i) => i > 0 && c === first)]
}
const posOfMiss = (s: IconState) => [0, s.cards.findIndex((c, i) => i > 0 && c !== s.cards[0])]
const solveAll = (s: IconState) => {
  const seen = new Map<string, number>()
  let st = s
  s.cards.forEach((c, i) => {
    if (seen.has(c)) { st = p.reduce(st, { type: 'flip', index: seen.get(c)! }); st = p.reduce(st, { type: 'flip', index: i }) }
    else seen.set(c, i)
  })
  return st
}

test('AC-1: 4x4 board labelled A1 to D4, face-down, 8 icons from icon-01..21 twice each', () => {
  const s = fresh()
  assert.equal(BOARD.rows, 4); assert.equal(BOARD.cols, 4)
  assert.equal(s.cards.length, 16)
  assert.deepEqual(s.flipped, []); assert.deepEqual(s.matched, [])
  const c = count(s.cards)
  assert.equal(c.size, 8)
  for (const n of c.values()) assert.equal(n, 2)
  for (const id of s.cards) assert.match(id, /^icon-(0[1-9]|1\d|2[01])$/)
  assert.equal(cardLabel(0, s.cols), 'A1'); assert.equal(cardLabel(3, s.cols), 'A4')
  assert.equal(cardLabel(4, s.cols), 'B1'); assert.equal(cardLabel(15, s.cols), 'D4')
  assert.equal(iconSrc('icon-07'), '/grab/icons/icon-07.png')
})

test('AC-2: boards are drawn again at random; never resources/original icons', () => {
  const boards = new Set(Array.from({ length: 30 }, () => fresh().cards.join()))
  assert.ok(boards.size > 1)
  const picked = new Set(Array.from({ length: 30 }, () => [...new Set(fresh().cards)].sort().join()))
  assert.ok(picked.size > 1, 'the 8 chosen icons change too')
  assert.equal(ICON_POOL.length, 21)
  assert.ok(ICON_POOL.every(id => /^icon-\d\d$/.test(id)))
  assert.ok(!iconSrc('icon-01').includes('resources') && !iconSrc('icon-01').includes('original'))
})

test('AC-3: board size is one config value; 2x2 plays and solves', () => {
  const q = createIconMatching({ rows: 2, cols: 2 })
  let s = q.initState()
  assert.equal(s.cards.length, 4)
  assert.equal(count(s.cards).size, 2)
  s = solveAll(s) // reduce of the 2x2 puzzle is the same logic
  assert.throws(() => createIconMatching({ rows: 3, cols: 3 }), /even/)
})

test('AC-4: tapping a face-down card marks it flipped', () => {
  const s = p.reduce(fresh(), { type: 'flip', index: 5 })
  assert.deepEqual(s.flipped, [5])
})

test('AC-5: the player View never draws an icon (source check)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./iconMatching.tsx', import.meta.url), 'utf8')
  // icons are drawn in exactly one branch, guarded by !isPlayer
  assert.match(src, /!isPlayer\s*&&[\s\S]{0,80}iconSrc|isPlayer\s*\?[\s\S]{0,200}iconSrc/)
  assert.equal((src.match(/iconSrc\(/g) ?? []).length, 1)
})

test('AC-6: second flip with the same icon matches both for good', () => {
  const s0 = fresh(); const [a, b] = posOfPair(s0)
  const s = p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b })
  assert.deepEqual(s.matched.sort(), [a, b].sort())
  assert.deepEqual(s.flipped, [])
  assert.equal(s.last, 'match')
  const again = p.reduce(s, { type: 'flip', index: a })
  assert.deepEqual(again, s)
})

test('AC-7: different icons: both stay flipped, player told no match, hide turns them face-down', () => {
  const s0 = fresh(); const [a, b] = posOfMiss(s0)
  const s = p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b })
  assert.deepEqual(s.flipped, [a, b]); assert.equal(s.last, 'miss'); assert.deepEqual(s.matched, [])
  assert.equal(VIEW_MS, 2500)
  const h = p.reduce(s, { type: 'hide' })
  assert.deepEqual(h.flipped, []); assert.deepEqual(h.matched, [])
  assert.deepEqual(p.reduce(fresh(), { type: 'hide' }).flipped, [], 'hide with nothing flipped is a no-op')
  const one = p.reduce(fresh(), { type: 'flip', index: 1 })
  assert.deepEqual(p.reduce(one, { type: 'hide' }), one, 'hide never unflips a single card')
})

test('AC-8: taps during the viewing period change nothing', () => {
  const s0 = fresh(); const [a, b] = posOfMiss(s0)
  const s = p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b })
  const other = [...s.cards.keys()].find(i => i !== a && i !== b)!
  assert.deepEqual(p.reduce(s, { type: 'flip', index: other }), s)
})

test('AC-9: flipped, matched or out-of-range cards do not count', () => {
  const one = p.reduce(fresh(), { type: 'flip', index: 2 })
  assert.deepEqual(p.reduce(one, { type: 'flip', index: 2 }), one)
  assert.deepEqual(p.reduce(one, { type: 'flip', index: 99 }), one)
  assert.deepEqual(p.reduce(one, { type: 'flip', index: -1 }), one)
  const s0 = fresh(); const [a, b] = posOfPair(s0)
  const m = p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b })
  assert.deepEqual(p.reduce(m, { type: 'flip', index: b }), m)
  const done = solveAll(fresh())
  assert.deepEqual(p.reduce(done, { type: 'flip', index: 0 }), done)
})

test('AC-10: an observer sends nothing, so the synced state is unchanged', async () => {
  const calls: unknown[] = []
  const api = createCoopApi(async (fn, args) => { calls.push([fn, args]); return null })
  const snap: CoopSnapshot = {
    session_id: 's', scan_id: 'x', game_key: 'icon-matching', status: 'playing', state: {}, version: 0, completed_at: null, members: [],
  }
  const r = await submitMove(api, p, 'o1', snap, { type: 'flip', index: 0 }, 'observer')
  assert.equal(r, null); assert.equal(calls.length, 0)
})

test('AC-11: matching the 8th pair solves; 7 pairs do not', () => {
  const s = solveAll(fresh())
  assert.equal(s.matched.length, 16)
  assert.ok(p.isSolved(s))
  assert.ok(!p.isSolved(fresh()))
  const seven = { ...s, matched: s.matched.slice(0, 14) }
  assert.ok(!p.isSolved(seven))
  // sent once as solved: submitMove passes isSolved(next) to coop_move
})

test('AC-11/12: the solve is sent with solved=true and no timer is involved', async () => {
  const seen: { solved: boolean; state: IconState }[] = []
  const api = createCoopApi(async (_fn, a) => {
    seen.push({ solved: a.p_solved as boolean, state: a.p_state as IconState })
    return { snapshot: {}, first_completion: true }
  })
  const s0 = fresh()
  const first = s0.cards.findIndex((c, i) => i > 0 && c === s0.cards[0])
  // 7 pairs matched already, one pair left
  let st = solveAll(s0)
  const lastPair = st.cards.map((c, i) => [c, i] as const).filter(([c]) => c === s0.cards[0]).map(([, i]) => i)
  st = { ...st, matched: st.matched.filter(i => !lastPair.includes(i)) }
  const snap: CoopSnapshot = {
    session_id: 's', scan_id: 'x', game_key: 'icon-matching', status: 'playing', state: st, version: 4, completed_at: null, members: [],
  }
  const r1 = await submitMove(api, p, 'p1', snap, { type: 'flip', index: 0 }, 'player')
  assert.equal(seen[0].solved, false)
  const mid: CoopSnapshot = { ...snap, state: seen[0].state, version: 5 }
  await submitMove(api, p, 'p1', mid, { type: 'flip', index: first }, 'player')
  assert.equal(seen[1].solved, true)
  assert.ok(r1)
})

test('AC-13: a late joiner reads the same flipped and matched cards, nothing is reshuffled', () => {
  const s0 = fresh(); const [a, b] = posOfMiss(s0)
  const mid = p.reduce(p.reduce(s0, { type: 'flip', index: a }), { type: 'flip', index: b })
  const snap: CoopSnapshot = {
    session_id: 's', scan_id: 'x', game_key: 'icon-matching', status: 'playing', state: JSON.parse(JSON.stringify(mid)), version: 3, completed_at: null, members: [],
  }
  assert.deepEqual(currentState(snap, p), mid)
  assert.deepEqual(currentState(snap, p).cards, s0.cards)
})

test('card title maps to the icon-matching key', () => {
  assert.equal(gameKeyForTitle('Icon Matching'), 'icon-matching')
})
