import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTime, scanElapsedMs } from './timeBonus.ts'

const scan = { scanned_at: '2026-11-12T10:00:00Z', completed_at: '2026-11-12T10:10:00Z' }

test('time is opened to completed', () => {
  assert.equal(scanElapsedMs(scan), 600_000)
})
test("an admin's corrected time replaces it", () => {
  assert.equal(scanElapsedMs({ ...scan, time_override_seconds: 240 }), 240_000)
  assert.equal(scanElapsedMs({ ...scan, time_override_seconds: 0 }), 0)
})
test('a corrected time counts even without a completion time', () => {
  assert.equal(scanElapsedMs({ scanned_at: scan.scanned_at, completed_at: null, time_override_seconds: 90 }), 90_000)
})
test('minutes and seconds, or plain seconds', () => {
  assert.equal(parseTime('4:30'), 270)
  assert.equal(parseTime(' 12:05 '), 725)
  assert.equal(parseTime('90'), 90)
  assert.equal(parseTime('0:00'), 0)
})
test('anything else is not a time', () => {
  for (const bad of ['', 'abc', '4:75', '-3', '1:2:3', '4.5']) assert.equal(parseTime(bad), null)
})
