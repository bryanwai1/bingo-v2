// Run: npm test. Pure logic of Memory & Spot the Difference (PRD-006), no React.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gameKeyForTitle } from './gameCards.ts'
import { currentState, submitMove, createCoopApi, type CoopSnapshot } from './session.ts'
import {
  spotPuzzle, parseHotspots, pictureUrl, hotspotsUrl, hotspotBox, toImagePoint, hitTest, judgeTap, remainingPause,
  WRONG_PAUSE_MS, TAP_TOLERANCE_PX, type SpotState, type SpotData,
} from './spotLogic.ts'

// The real file, read straight from public/ (AC-3: data comes from hotspots.json).
const file = new URL('../../../public/grab/Memory & Spot the Difference/hotspots.json', import.meta.url)
const data: SpotData = parseHotspots(JSON.parse(readFileSync(file, 'utf8')))
const NEED = data.hotspots.length
const T0 = 1_000_000

// Play a list of ids as correct taps through the real reducer.
const find = (s: SpotState, ids: number[]) => ids.reduce((st, id) => spotPuzzle.reduce(st, { type: 'hit', id, need: NEED, now: T0 }), s)
const tapAt = (s: SpotState, id: number, now = T0) => {
  const h = data.hotspots.find(x => x.id === id)!
  return judgeTap(s, data, h.x, h.y, now)
}

test('the game card maps to this puzzle key', () => {
  assert.equal(gameKeyForTitle('Memory & Spot the Difference'), 'memory-spot')
  assert.equal(spotPuzzle.key, 'memory-spot')
})

test('AC-1: player gets Picture A, observer Picture B, never the answer key', () => {
  assert.equal(pictureUrl('player'), '/grab/Memory%20&%20Spot%20the%20Difference/Picture_A.png')
  assert.equal(pictureUrl('observer'), '/grab/Memory%20&%20Spot%20the%20Difference/Picture_B.png')
  assert.equal(hotspotsUrl, '/grab/Memory%20&%20Spot%20the%20Difference/hotspots.json')
  for (const f of ['spotLogic.ts', 'spot.tsx']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/answer[_ ]?key|Picture_C/i.test(src.replace(/\/\/.*$/gm, '')), `${f} must not reference the answer key`)
  }
})

test('AC-2: hotspot boxes are percentages of the 1448x1086 image', () => {
  const b = hotspotBox({ id: 9, x: 500, y: 250, radius: 50 }, { imageWidth: 1000, imageHeight: 500, hotspots: [] })
  assert.deepEqual(b, { left: '50%', top: '50%', width: '10%' })
  // the same box whatever the display size: the function takes no display size at all
  const first = hotspotBox(data.hotspots[0], data)
  assert.equal(first.left, `${(373 / 1448) * 100}%`)
})

test('AC-3: five circles are read from hotspots.json; a changed file changes the game', () => {
  assert.equal(data.imageWidth, 1448)
  assert.equal(data.hotspots.length, 5)
  const moved = parseHotspots({ imageWidth: 100, imageHeight: 100, hotspots: [{ id: 1, x: 10, y: 10, radius: 5 }, { id: 2, x: 80, y: 80, radius: 5 }] })
  assert.equal(moved.hotspots.length, 2)
  assert.equal(hitTest(moved, 80, 80)?.id, 2)
  assert.equal(hitTest(moved, 50, 50), null)
  assert.throws(() => parseHotspots({ imageWidth: 100, hotspots: [] }))
  assert.throws(() => parseHotspots({ imageWidth: 100, imageHeight: 100, hotspots: [{ id: 1, x: 'a', y: 1, radius: 1 }] }))
})

test('AC-4: a new game has nothing found, 0 of 5', () => {
  const s = currentState({ state: {} } as CoopSnapshot, spotPuzzle)
  assert.deepEqual(s.found, [])
  assert.equal(spotPuzzle.isSolved(s), false)
})

test('AC-5: a tap inside a circle, or within 22 px of it, finds it; the count goes up by one', () => {
  const s0 = spotPuzzle.initState()
  const r = tapAt(s0, 5)
  assert.equal(r.outcome, 'found')
  const s1 = spotPuzzle.reduce(s0, r.action!)
  assert.deepEqual(s1.found, [5])
  // hotspot 5: (257,784) r36; 36 + 22 = 58 from the centre still counts, 59 does not
  assert.equal(judgeTap(s0, data, 257 + 36 + TAP_TOLERANCE_PX, 784, T0).outcome, 'found')
  assert.equal(judgeTap(s0, data, 257 + 36 + TAP_TOLERANCE_PX + 1, 784, T0).outcome, 'wrong')
})

test('AC-6: a wrong tap changes no count, starts a 3 s pause the observer can read from the state', () => {
  const s0 = find(spotPuzzle.initState(), [1])
  const r = judgeTap(s0, data, 5, 5, T0)
  assert.equal(r.outcome, 'wrong')
  const s1 = spotPuzzle.reduce(s0, r.action!)
  assert.deepEqual(s1.found, [1])
  assert.equal(s1.wrongUntil, T0 + WRONG_PAUSE_MS)
  assert.equal(remainingPause(s1, T0 + 1000), 2000)
  assert.equal(remainingPause(s1, T0 + 5000), 0)
})

test('AC-7: during the pause any tap changes nothing and does not restart it; afterwards taps count', () => {
  const s1 = spotPuzzle.reduce(spotPuzzle.initState(), { type: 'miss', now: T0 })
  const during = judgeTap(s1, data, 5, 5, T0 + 1000)
  assert.equal(during.outcome, 'paused')
  assert.equal(during.action, undefined)
  const onTarget = tapAt(s1, 2, T0 + 1000)
  assert.equal(onTarget.outcome, 'paused')
  // the reducer is safe on its own, too (a late or duplicate action)
  assert.equal(spotPuzzle.reduce(s1, { type: 'miss', now: T0 + 1000 }), s1)
  assert.equal(spotPuzzle.reduce(s1, { type: 'hit', id: 2, need: NEED, now: T0 + 1000 }), s1)
  assert.equal(tapAt(s1, 2, T0 + WRONG_PAUSE_MS).outcome, 'found')
})

test('AC-8: tapping a found difference again changes nothing, starts no pause, says already found', () => {
  const s = find(spotPuzzle.initState(), [3])
  const r = tapAt(s, 3)
  assert.equal(r.outcome, 'already')
  assert.equal(r.action, undefined)
  // two devices sending the same hit: the second is a no-op
  assert.equal(spotPuzzle.reduce(s, { type: 'hit', id: 3, need: NEED, now: T0 }), s)
  assert.equal(s.wrongUntil, 0)
})

test('AC-9: an observer never sends; the screen tells them only the player can move', async () => {
  const sent: string[] = []
  const api = createCoopApi(async fn => { sent.push(fn); return null })
  const snap = { session_id: 's', scan_id: 'x', game_key: 'memory-spot', status: 'playing', state: {}, version: 1, completed_at: null, members: [] } as CoopSnapshot
  const out = await submitMove(api, spotPuzzle, 'o1', snap, { type: 'miss', now: T0 }, 'observer')
  assert.equal(out, null)
  assert.deepEqual(sent, [])
  const src = readFileSync(new URL('./spot.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes('Only the player can move'))
})

test('AC-10: a tap is converted to image pixels from the displayed rectangle, so zoom does not matter', () => {
  const normal = toImagePoint({ left: 10, top: 20, width: 362, height: 271.5 }, 10 + 181, 20 + 135.75, data)
  const zoomed = toImagePoint({ left: -400, top: -300, width: 1448, height: 1086 }, -400 + 724, -300 + 543, data)
  assert.deepEqual([Math.round(normal.x), Math.round(normal.y)], [724, 543])
  assert.deepEqual([zoomed.x, zoomed.y], [724, 543])
})

test('AC-11: the fifth difference solves the puzzle, only then', () => {
  assert.equal(spotPuzzle.isSolved(find(spotPuzzle.initState(), [1, 2, 3, 4])), false)
  assert.equal(spotPuzzle.isSolved(find(spotPuzzle.initState(), [1, 2, 3, 4, 5])), true)
  // locked after solving: no more changes
  const done = find(spotPuzzle.initState(), [1, 2, 3, 4, 5])
  assert.equal(spotPuzzle.reduce(done, { type: 'miss', now: T0 }), done)
  assert.equal(judgeTap(done, data, 5, 5, T0).outcome, 'locked')
})

test('AC-11: solving is sent once through the shared completion (solved flag on the move)', async () => {
  const moves: Array<{ solved: boolean }> = []
  const api = createCoopApi(async (_fn, a) => {
    moves.push({ solved: a.p_solved as boolean })
    return { snapshot: {}, first_completion: true }
  })
  const four = find(spotPuzzle.initState(), [1, 2, 3, 4])
  const snap = { session_id: 's', scan_id: 'x', game_key: 'memory-spot', status: 'playing', state: four, version: 4, completed_at: null, members: [] } as CoopSnapshot
  await submitMove(api, spotPuzzle, 'p1', snap, { type: 'hit', id: 5, need: NEED, now: T0 }, 'player')
  assert.deepEqual(moves, [{ solved: true }])
})

test('AC-12: no timer in the puzzle: solving after the bonus ran out is the same move (server gives base points)', () => {
  const late = find(spotPuzzle.initState(), [1, 2, 3, 4, 5])
  assert.equal(spotPuzzle.isSolved(late), true)
  assert.equal('timer' in late || 'deadline' in late, false)
})

test('AC-13: a late joiner reads found marks, count and remaining pause from the shared state alone', () => {
  const s = spotPuzzle.reduce(find(spotPuzzle.initState(), [2, 4]), { type: 'miss', now: T0 })
  const wire = JSON.parse(JSON.stringify(s)) as SpotState // what the server stores and sends
  const seen = currentState({ state: wire } as CoopSnapshot, spotPuzzle)
  assert.deepEqual(seen.found, [2, 4])
  assert.equal(remainingPause(seen, T0 + 1200), 1800)
})

test('AC-7 (clock skew): a pause set far in the future by another clock blocks no longer than the 3 s shown', () => {
  const skewed: SpotState = { v: 1, found: [], need: 0, wrongUntil: T0 + 60_000 }
  assert.equal(remainingPause(skewed, T0), 0)
  assert.notEqual(judgeTap(skewed, data, 5, 5, T0).outcome, 'paused')
  assert.deepEqual(spotPuzzle.reduce(skewed, { type: 'hit', id: 2, need: NEED, now: T0 }).found, [2])
})
