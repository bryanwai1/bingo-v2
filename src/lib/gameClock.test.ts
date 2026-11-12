import test from 'node:test'
import assert from 'node:assert/strict'
import { timerPatchForGame } from './gameClock.ts'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const at = (s: number) => new Date(NOW + s * 1000).toISOString()

test('start sets the end time from the seconds on the clock', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 600, timer_end_at: null }, true, NOW), { timer_end_at: at(600) })
})
test('start restarts a countdown that already ended', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 300, timer_end_at: at(-5) }, true, NOW), { timer_end_at: at(300) })
})
test('start leaves a running countdown alone', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 600, timer_end_at: at(120) }, true, NOW), {})
})
test('start with no time on the clock does nothing', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 0, timer_end_at: null }, true, NOW), {})
  assert.deepEqual(timerPatchForGame({}, true, NOW), {})
})
test('stop pauses a running countdown and keeps the remainder', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 600, timer_end_at: at(120) }, false, NOW), { timer_seconds: 120, timer_end_at: null })
})
test('stop leaves an ended or idle countdown alone', () => {
  assert.deepEqual(timerPatchForGame({ timer_seconds: 0, timer_end_at: at(-1) }, false, NOW), {})
  assert.deepEqual(timerPatchForGame({ timer_seconds: 90, timer_end_at: null }, false, NOW), {})
})
