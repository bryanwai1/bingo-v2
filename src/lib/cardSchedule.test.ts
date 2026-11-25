// Card schedule rules. Run: npm test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleStatus, scheduleEvent, ruleWallTime, hasSchedule, formatCountdown, type ScheduleClock } from './cardSchedule.ts'

const MIN = 60_000
const T0 = Date.parse('2026-11-25T10:00:00Z')
const clock = (o: Partial<ScheduleClock> = {}): ScheduleClock =>
  ({ now: T0 + 10 * MIN, gameStarted: true, gameStartAt: T0, pauses: null, timerEndAt: null, ...o })

test('no schedule, or an empty one, means always open', () => {
  assert.equal(scheduleStatus(null, clock()), null)
  assert.equal(scheduleStatus({}, clock()), null)
  assert.equal(hasSchedule({ open: null }), false)
})

test('open N minutes after start: locked until then, with a countdown', () => {
  const s = { open: { type: 'after_start' as const, minutes: 30 } }
  const st = scheduleStatus(s, clock())!
  assert.equal(st.state, 'before')
  assert.equal(st.locked, true)
  assert.equal(st.opensInMs, 20 * MIN)
  assert.equal(st.text, 'Opens in 20:00')
  assert.equal(scheduleStatus(s, clock({ now: T0 + 30 * MIN }))!.state, 'open')
})

test('before the game has started a relative rule says when it will open', () => {
  const st = scheduleStatus({ open: { type: 'after_start', minutes: 30 } }, clock({ gameStartAt: null, gameStarted: false }))!
  assert.equal(st.state, 'before')
  assert.equal(st.opensInMs, null)
  assert.equal(st.text, 'Opens 30 min after the game starts')
})

test('paused time does not count toward minutes after start', () => {
  const s = { open: { type: 'after_start' as const, minutes: 30 } }
  const pauses = [{ start: T0 + 5 * MIN, end: T0 + 15 * MIN }]
  // 35 min on the wall clock, 10 of them paused: 25 min played.
  assert.equal(scheduleStatus(s, clock({ now: T0 + 35 * MIN, pauses }))!.state, 'before')
  assert.equal(scheduleStatus(s, clock({ now: T0 + 40 * MIN, pauses }))!.state, 'open')
  assert.equal(ruleWallTime(s.open, { gameStarted: true, gameStartAt: T0, pauses, timerEndAt: null }), T0 + 40 * MIN)
})

test('fixed clock times and the lock label', () => {
  const at = new Date(T0 + 90 * MIN).toISOString()
  const s = { open: { type: 'at' as const, at }, label: 'Only available after 11:30 am' }
  const st = scheduleStatus(s, clock())!
  assert.equal(st.state, 'before')
  assert.equal(st.text, 'Only available after 11:30 am')
  assert.equal(scheduleStatus(s, clock({ now: T0 + 91 * MIN }))!.state, 'open')
})

test('close rule: open window, then closed', () => {
  const s = { open: { type: 'after_start' as const, minutes: 10 }, close: { type: 'after_start' as const, minutes: 40 } }
  assert.equal(scheduleStatus(s, clock({ now: T0 + 5 * MIN }))!.state, 'before')
  const open = scheduleStatus(s, clock({ now: T0 + 20 * MIN }))!
  assert.equal(open.state, 'open')
  assert.equal(open.closesInMs, 20 * MIN)
  const closed = scheduleStatus(s, clock({ now: T0 + 40 * MIN }))!
  assert.equal(closed.state, 'closed')
  assert.equal(closed.locked, true)
})

test('only in the last N minutes of the timer', () => {
  const s = { lastMinutes: 15 }
  assert.equal(scheduleStatus(s, clock({ timerEndAt: T0 + 60 * MIN }))!.state, 'before')
  assert.equal(scheduleStatus(s, clock({ timerEndAt: T0 + 20 * MIN }))!.state, 'open')
  assert.equal(scheduleStatus(s, clock({ timerEndAt: null }))!.state, 'before')
})

test('admin override beats every rule', () => {
  const s = { open: { type: 'after_start' as const, minutes: 999 }, override: 'open' as const }
  assert.equal(scheduleStatus(s, clock())!.state, 'open')
  const locked = scheduleStatus({ override: 'locked' }, clock())!
  assert.equal(locked.locked, true)
})

test('notifications: opening is news only if the team watched it happen', () => {
  const s = { open: { type: 'after_start' as const, minutes: 30 }, notifyCloseMinutes: 5, close: { type: 'after_start' as const, minutes: 60 } }
  const before = scheduleStatus(s, clock({ now: T0 + 29 * MIN }))
  const open = scheduleStatus(s, clock({ now: T0 + 30 * MIN }))
  assert.equal(scheduleEvent('Card A', s, before, open, false).event?.text, 'Card A is now open')
  // first sight of an already-open card: nothing
  assert.equal(scheduleEvent('Card A', s, null, open, false).event, null)
  assert.equal(scheduleEvent('Card A', { ...s, notifyOpen: false }, before, open, false).event, null)
  assert.equal(scheduleEvent('Card A', { ...s, notifyText: 'Go go go' }, before, open, false).event?.text, 'Go go go')
})

test('notifications: the closing warning fires once', () => {
  const s = { close: { type: 'after_start' as const, minutes: 60 }, notifyCloseMinutes: 5 }
  const early = scheduleStatus(s, clock({ now: T0 + 50 * MIN }))
  assert.equal(scheduleEvent('Card A', s, early, early, false).event, null)
  const late = scheduleStatus(s, clock({ now: T0 + 56 * MIN }))
  const first = scheduleEvent('Card A', s, early, late, false)
  assert.equal(first.event?.text, 'Card A closes in 4 min')
  assert.equal(scheduleEvent('Card A', s, late, late, first.warned).event, null)
})

test('countdown format', () => {
  assert.equal(formatCountdown(12 * MIN + 30_000), '12:30')
  assert.equal(formatCountdown(65 * MIN), '1:05:00')
})
