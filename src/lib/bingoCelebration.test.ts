// The B / BI / BIN / BING / BINGO popups: each step shows once, never again. Run: npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planLineCelebrations } from './bingoLines.ts'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/** Play a board the way a page does: re-plan every time the completed set changes. */
function play(steps: number[][], start: Set<number> = new Set()) {
  let celebrated = start
  const shown: string[] = []
  for (const lines of steps) {
    const r = planLineCelebrations(celebrated, new Set(lines))
    celebrated = r.next
    shown.push(...r.popups)
  }
  return shown
}

test('one new line at a time walks B, BI, BIN, BING, BINGO', () => {
  const steps = [[0], [0, 1], [0, 1, 2], [0, 1, 2, 3], [0, 1, 2, 3, 4]]
  assert.deepEqual(play(steps), ['B', 'BI', 'BIN', 'BING', 'BINGO'])
})

test('lines after the fifth show nothing: BINGO is not repeated', () => {
  const all = Array.from({ length: 12 }, (_, i) => i)
  const steps = all.map((_, i) => all.slice(0, i + 1))
  assert.deepEqual(play(steps), ['B', 'BI', 'BIN', 'BING', 'BINGO'])
})

test('a tile that closes several lines at once still shows each step once', () => {
  assert.deepEqual(play([[0, 5, 6]]), ['B', 'BI', 'BIN'])
  assert.deepEqual(play([[0], [0, 1, 2, 3, 4, 5, 6, 7]]), ['B', 'BI', 'BIN', 'BING', 'BINGO'])
})

test('re-running with the same lines (re-render, reload) shows nothing', () => {
  const first = planLineCelebrations(new Set(), new Set([0, 1]))
  assert.deepEqual(first.popups, ['B', 'BI'])
  assert.deepEqual(planLineCelebrations(first.next, new Set([0, 1])).popups, [])
})

test('undoing a line and finishing it again does not repeat its letter', () => {
  assert.deepEqual(play([[0], [], [0]]), ['B'])
})

test('undoing a line then completing a different one moves up a step, never back to B', () => {
  assert.deepEqual(play([[0], [], [5]]), ['B', 'BI'])
})

test('lines already celebrated on this device are not celebrated again', () => {
  assert.deepEqual(play([[0, 1, 2]], new Set([0, 1, 2])), [])
  assert.deepEqual(play([[0, 1, 2, 3]], new Set([0, 1, 2])), ['BING'])
})

test('no line is queued twice and the queue never holds a repeated letter', () => {
  for (let n = 1; n <= 12; n++) {
    const shown = play([Array.from({ length: n }, (_, i) => i)])
    assert.equal(new Set(shown).size, shown.length)
    assert.ok(shown.length <= 5)
  }
})

test('the board pages use the shared planner and wait for scans before taking their baseline', () => {
  for (const page of ['pages/BingoDashHome.tsx', 'pages/BingoDashJoin.tsx', 'pages/BingoDashSample.tsx']) {
    const s = src(page)
    assert.match(s, /planLineCelebrations\(/, `${page}: uses planLineCelebrations`)
    assert.doesNotMatch(s, /Math\.min\(baseSize \+ i \+ 1, 5\)/, `${page}: old capped-letter queue is gone`)
  }
  for (const page of ['pages/BingoDashHome.tsx', 'pages/BingoDashJoin.tsx']) {
    assert.match(src(page), /scansReady/, `${page}: baseline waits for the team's scans`)
  }
})
