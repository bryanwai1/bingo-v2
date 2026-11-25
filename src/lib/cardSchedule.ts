// Card schedule: when a card is open for teams. Pure logic, no React or Supabase,
// so `npm test` can run it. The server (bingo_scans trigger, see
// supabase/card-schedule/20261126_card_schedule.sql) re-checks the same rules
// when a team opens a card; everything here is display plus the client guard.
//
// "Game start" is the moment the admin first pressed Start (bingo_sections.
// game_start_at). Time the game or timer spent paused (card_pauses) is not
// counted, so "30 min after start" means 30 minutes of play.

import { activeElapsedMs } from './timeBonus.ts'
import type { PauseSpan } from '../types/database'

export type SchedRule =
  | { type: 'after_start'; minutes: number }
  | { type: 'at'; at: string }

export interface CardSchedule {
  open?: SchedRule | null
  close?: SchedRule | null
  /** Open only during the last N minutes of the board timer. */
  lastMinutes?: number | null
  /** Shown to players while the card is not open yet, e.g. "Only available after 10:30 am". */
  label?: string | null
  /** Tell teams when the card opens (default on). */
  notifyOpen?: boolean
  /** Warn teams this many minutes before the card closes; null/0 = no warning. */
  notifyCloseMinutes?: number | null
  /** Replaces the default notification text. */
  notifyText?: string | null
  /** Admin override that beats every rule. */
  override?: 'open' | 'locked' | null
}

export interface ScheduleClock {
  now: number
  gameStarted: boolean
  /** Epoch ms of the first Start press; null before the game has started. */
  gameStartAt: number | null
  pauses: PauseSpan[] | null
  /** Epoch ms the board timer ends; null when no timer is running. */
  timerEndAt: number | null
}

export type ScheduleState = 'open' | 'before' | 'closed'

export interface ScheduleStatus {
  state: ScheduleState
  /** True when teams cannot open the card right now. */
  locked: boolean
  /** Play-time ms until it opens; null when that cannot be told yet. */
  opensInMs: number | null
  /** Ms until it closes while open; null when it never closes or is not open. */
  closesInMs: number | null
  /** Short text for the tile ("12:30", "Closed"). */
  short: string
  /** The sentence players read on the card. */
  text: string
}

/** Whether the schedule has any effect at all. */
export function hasSchedule(s: CardSchedule | null | undefined): boolean {
  if (!s) return false
  return !!(s.open || s.close || (s.lastMinutes ?? 0) > 0 || s.override)
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const clockTime = (iso: string) =>
  new Date(iso).toLocaleString([], { hour: 'numeric', minute: '2-digit', ...(Date.now() - Date.parse(iso) > 12 * 3600e3 || Date.parse(iso) - Date.now() > 12 * 3600e3 ? { month: 'short', day: 'numeric' } : {}) })

/** ms until a rule is reached, or null when it cannot be told (game not started). Zero or less = reached. */
function remaining(rule: SchedRule, c: ScheduleClock): number | null {
  if (rule.type === 'at') return Date.parse(rule.at) - c.now
  if (c.gameStartAt == null) return null
  return Math.max(0, rule.minutes) * 60_000 - activeElapsedMs(c.gameStartAt, c.now, { card_pauses: c.pauses })
}

export function scheduleStatus(s: CardSchedule | null | undefined, c: ScheduleClock): ScheduleStatus | null {
  if (!hasSchedule(s) || !s) return null
  const open = (over: Partial<ScheduleStatus> = {}): ScheduleStatus =>
    ({ state: 'open', locked: false, opensInMs: null, closesInMs: null, short: '', text: '', ...over })

  if (s.override === 'open') return open()
  if (s.override === 'locked') return { state: 'closed', locked: true, opensInMs: null, closesInMs: null, short: 'Locked', text: 'This card is locked by the facilitator' }

  // Closed first: a closed card stays closed even if an open rule is also met.
  const closeIn = s.close ? remaining(s.close, c) : null
  if (s.close && closeIn != null && closeIn <= 0) {
    return { state: 'closed', locked: true, opensInMs: null, closesInMs: null, short: 'Closed', text: 'This card has closed' }
  }

  // Everything that still has to be reached before it opens.
  const waits: (number | null)[] = []
  if (s.open) { const r = remaining(s.open, c); if (r == null || r > 0) waits.push(r) }
  const last = (s.lastMinutes ?? 0) > 0 ? s.lastMinutes! * 60_000 : 0
  if (last > 0) {
    if (c.timerEndAt == null) waits.push(null)
    else { const r = c.timerEndAt - c.now - last; if (r > 0) waits.push(r) }
  }
  if (waits.length > 0) {
    const known = waits.every((w): w is number => w != null)
    const opensInMs = known ? Math.max(...(waits as number[])) : null
    const auto = s.open?.type === 'at' && waits.length === 1 && known
      ? `Opens at ${clockTime(s.open.at)}`
      : opensInMs != null ? `Opens in ${formatCountdown(opensInMs)}`
      : s.open?.type === 'after_start' ? `Opens ${s.open.minutes} min after the game starts`
      : last > 0 ? `Opens in the last ${s.lastMinutes} min of the game`
      : 'Not open yet'
    return {
      state: 'before', locked: true, opensInMs, closesInMs: null,
      short: opensInMs != null ? formatCountdown(opensInMs) : 'Soon',
      text: s.label?.trim() || auto,
    }
  }

  return open({ closesInMs: closeIn != null && closeIn > 0 ? closeIn : null })
}

/** What a team should be told about a card right now, once per event. */
export type ScheduleEvent = { kind: 'opened' | 'closing'; text: string }

/**
 * Compare a card's previous and current status. `warned` remembers whether the
 * closing warning already fired. A card first seen already open fires nothing:
 * only a change the team watched happen is news.
 */
export function scheduleEvent(
  title: string, s: CardSchedule | null | undefined,
  prev: ScheduleStatus | null | undefined, next: ScheduleStatus | null, warned: boolean,
): { event: ScheduleEvent | null; warned: boolean } {
  if (!s || !next) return { event: null, warned }
  if (prev && prev.state === 'before' && next.state === 'open' && s.notifyOpen !== false) {
    return { event: { kind: 'opened', text: s.notifyText?.trim() || `${title} is now open` }, warned: false }
  }
  const lead = (s.notifyCloseMinutes ?? 0) * 60_000
  if (lead > 0 && next.state === 'open' && next.closesInMs != null && next.closesInMs <= lead && !warned) {
    const m = Math.max(1, Math.ceil(next.closesInMs / 60_000))
    return { event: { kind: 'closing', text: `${title} closes in ${m} min` }, warned: true }
  }
  if (next.state !== 'open') return { event: null, warned: false }
  return { event: null, warned }
}

/** Absolute time a card opens or closes, for the admin preview (play-time rules use the pause log). */
export function ruleWallTime(rule: SchedRule | null | undefined, c: Omit<ScheduleClock, 'now'>): number | null {
  if (!rule) return null
  if (rule.type === 'at') return Date.parse(rule.at)
  if (c.gameStartAt == null) return null
  // Walk forward until the play time after the start equals the rule's minutes.
  const want = Math.max(0, rule.minutes) * 60_000
  let t = c.gameStartAt + want
  for (let i = 0; i < 20; i++) {
    const played = activeElapsedMs(c.gameStartAt, t, { card_pauses: c.pauses })
    const gap = want - played
    if (gap <= 0) break
    t += gap
  }
  return t
}

/** One-line summary of a schedule for the editor. */
export function describeSchedule(s: CardSchedule | null | undefined): string {
  if (!hasSchedule(s) || !s) return 'No schedule: always open.'
  const rule = (r: SchedRule | null | undefined, verb: string) => !r ? null
    : r.type === 'after_start' ? `${verb} ${r.minutes} min after the game starts`
    : `${verb} ${r.at ? new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '(pick a time)'}`
  const parts = [
    rule(s.open, 'Opens'), rule(s.close, 'closes'),
    s.lastMinutes ? `only in the last ${s.lastMinutes} min of the timer` : null,
    s.override === 'open' ? 'forced open' : s.override === 'locked' ? 'forced locked' : null,
  ].filter(Boolean) as string[]
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}
