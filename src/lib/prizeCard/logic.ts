// PRD-008 prize card: the rules the screens share. No React, no Supabase, so
// `npm test` can run it. The server is the authority for a claim (claim_prize);
// everything here is display.

import { normalizeUrl } from '../normalizeUrl.ts'

/** Prize placements sit on reserved slots 200..209 of bingo_board_cards (ADR-008). */
export const PRIZE_SLOT_MIN = 200
export const PRIZE_SLOT_MAX = 209
export const POPUP_MS = 5000

/** Slots 0..199 are the grid (a cube packs 25 per face); 200+ is never a tile. */
export const isGridSlot = (slot: number) => slot < PRIZE_SLOT_MIN

/** First free reserved slot, or null when all ten are taken. */
export function nextPrizeSlot(usedSlots: number[]): number | null {
  for (let s = PRIZE_SLOT_MIN; s <= PRIZE_SLOT_MAX; s++) if (!usedSlots.includes(s)) return s
  return null
}

/** A prize card (or its board copy) may sit on a board once; a second add is refused. */
export function canAddPrize(boardCards: { section_id: string; task_id: string; slot: number }[], sectionId: string, taskIds: string[]): boolean {
  return !boardCards.some(b => b.section_id === sectionId && !isGridSlot(b.slot) && taskIds.includes(b.task_id))
}

/** The "Prize card" checkbox cannot change while the card sits on any board. */
export const prizeFlagLocked = (placedCount: number | null) => (placedCount ?? 0) > 0

/** The Maps button opens http or https only; anything else (javascript:, data:) gives no button. */
export function safeMapsUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const url = normalizeUrl(raw)
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:' ? url : null
  } catch { return null }
}

/** Threshold field: a whole number, at least 1. */
export function clampThreshold(raw: string | number): number {
  return Math.max(1, Math.floor(Number(raw) || 1))
}

/** Maps link as typed by the admin, with or without https://. Empty is fine. */
export function mapsUrlError(v: string): string {
  const t = v.trim()
  if (!t || /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return ''
  return 'Enter a link, for example https://maps.app.goo.gl/abc'
}

/** Reveal text as stored: trimmed, empty becomes null. */
export function cleanPrizeSecrets<T extends Record<string, string>>(s: T): { [K in keyof T]: string | null } {
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.trim() || null])) as { [K in keyof T]: string | null }
}

export interface Placement { id: string; task_id: string; slot: number }
export interface ScanLite { task_id: string; board_card_id: string | null; completed: boolean }

/**
 * Completed grid boxes for one team (AC-8). Same predicate as the server: a box
 * counts when a completed scan names its placement, or (legacy scan without a
 * box) its card. Pending and submitted scans have completed = false. A prize
 * placement is never counted.
 */
export function completedGridCount(placements: Placement[], scans: ScanLite[]): number {
  const done = scans.filter(s => s.completed)
  return placements.filter(p => isGridSlot(p.slot)
    && done.some(s => s.board_card_id === p.id || (s.board_card_id == null && s.task_id === p.task_id))).length
}

export interface Claim { id: string; board_card_id: string; team_id: string; team_name: string; claimed_at: string }

export type StripState =
  | { kind: 'locked'; count: number; threshold: number }
  | { kind: 'claimable'; canClaim: boolean }
  | { kind: 'won'; winner: string; more?: boolean }
  | { kind: 'lost'; winner: string; text?: string }
  | { kind: 'unavailable'; text: string }

export function stripState(a: {
  count: number; threshold: number; claim: Claim | null | undefined; teamId: string; role: 'player' | 'observer'
}): StripState {
  if (a.claim) return a.claim.team_id === a.teamId
    ? { kind: 'won', winner: a.claim.team_name }
    : { kind: 'lost', winner: a.claim.team_name }
  if (a.count < a.threshold) return { kind: 'locked', count: a.count, threshold: a.threshold }
  return { kind: 'claimable', canClaim: a.role === 'player' }
}

export const claimedByText = (name: string) => `${name} has claimed this card`
export const tooLateText = (winner: string | null) => `Too late, ${winner ?? 'another group'} got it first`
export const projectorText = (name: string) => `${name} claimed the prize`

/** A lost race and a refused stale claim look the same to the team (AC-3, AC-4). */
export function parseClaimResult(raw: unknown): { ok: true } | { ok: false; winner: string | null } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { ok?: unknown; winner?: unknown }
  if (r.ok === true) return { ok: true }
  return { ok: false, winner: typeof r.winner === 'string' ? r.winner : null }
}

/**
 * What the projector band shows at `now`. `seenAt[id]` is when this screen first
 * saw the claim (null = it was already there when the screen opened, so no popup).
 * Popups run one at a time, in claim order, POPUP_MS each; a claim still waiting
 * for its turn is not shown yet. After its popup a claim is a persistent line.
 */
export function bandState(claims: Claim[], seenAt: Record<string, number | null>, now: number): { popup: Claim | null; lines: Claim[] } {
  let popup: Claim | null = null
  const lines: Claim[] = []
  let prevEnd = -Infinity
  for (const c of [...claims].sort((x, y) => x.claimed_at.localeCompare(y.claimed_at))) {
    const seen = seenAt[c.id] ?? null
    if (seen === null) { lines.push(c); continue }
    const start = Math.max(seen, prevEnd)
    prevEnd = start + POPUP_MS
    if (now >= prevEnd) lines.push(c)
    else if (now >= start) popup = c
  }
  return { popup, lines }
}

// ── Unlock conditions (required cards, score, lines, window, stock) ──────────
export interface PrizeRule {
  prize_threshold?: number
  prize_required_task_ids?: string[] | null
  prize_stock?: number | null
  prize_per_team?: number | null
  prize_min_points?: number | null
  prize_min_lines?: number | null
  prize_open_at?: string | null
  prize_close_at?: string | null
}

/** A grid card as the prize card needs it: enough to draw a copy of it. */
export interface PrizeGridCard {
  id: string
  placement_id?: string | null
  cloned_from?: string | null
  title: string
  hex_code: string
  tile_icon?: string | null
  category_icon?: string | null
  category?: string | null
}

/** One grey-then-coloured copy of a required card, shown on the prize card. */
export interface PrizeSlot { key: string; title: string; hex: string; iconKey: string | null; category: string; done: boolean }

export interface PrizeView {
  state: StripState
  slots: PrizeSlot[]
  /** Combined progress for the bar: required cards plus the other cards still needed. */
  done: number
  total: number
  /** Short condition lines under the bar, e.g. "Score 320 / 500". */
  notes: { text: string; ok: boolean }[]
  /** Prizes left, when the prize has a stock. */
  stockLeft: number | null
}

/** The cards on this board that a prize requires (an id may name the copy or its library original). */
export function requiredCards<T extends { id: string; cloned_from?: string | null }>(grid: T[], requiredIds: string[] | null | undefined): T[] {
  const want = new Set(requiredIds ?? [])
  if (want.size === 0) return []
  return grid.filter(t => want.has(t.id) || (!!t.cloned_from && want.has(t.cloned_from)))
}

const hhmm = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Everything the prize card shows, from the card's rule and the team's progress.
 * `isDone(card)` says whether the team completed that grid box. Display only: the
 * server (claim_prize) re-checks every condition.
 */
export function prizeView(a: {
  rule: PrizeRule
  grid: PrizeGridCard[]
  isDone: (card: PrizeGridCard) => boolean
  points: number
  lines: number
  claims: Claim[]
  teamId: string
  role: 'player' | 'observer'
  now?: number
}): PrizeView {
  const { rule, grid, isDone } = a
  const now = a.now ?? Date.now()
  const threshold = Math.max(1, rule.prize_threshold ?? 20)
  const req = requiredCards(grid, rule.prize_required_task_ids)
  const count = grid.filter(isDone).length
  const reqDone = req.filter(isDone).length
  const otherNeeded = Math.max(0, threshold - req.length)
  const otherDone = count - reqDone
  const total = req.length + otherNeeded
  const done = reqDone + Math.min(otherDone, otherNeeded)
  const cardsMet = reqDone === req.length && otherDone >= otherNeeded
  const pointsOk = rule.prize_min_points == null || a.points >= rule.prize_min_points
  const linesOk = rule.prize_min_lines == null || a.lines >= rule.prize_min_lines

  const early = !!rule.prize_open_at && now < Date.parse(rule.prize_open_at)
  const closed = !!rule.prize_close_at && now > Date.parse(rule.prize_close_at)

  const stock = rule.prize_stock ?? null
  const perTeam = Math.max(1, rule.prize_per_team ?? 1)
  const stockLeft = stock == null ? null : Math.max(0, stock - a.claims.length)
  const mine = a.claims.filter(c => c.team_id === a.teamId)
  const eligible = cardsMet && pointsOk && linesOk && !early && !closed

  const notes: PrizeView['notes'] = []
  if (rule.prize_min_points != null) notes.push({ text: `Score ${Math.floor(a.points)} / ${rule.prize_min_points}`, ok: pointsOk })
  if (rule.prize_min_lines != null) notes.push({ text: `Bingo lines ${a.lines} / ${rule.prize_min_lines}`, ok: linesOk })
  if (rule.prize_open_at && early) notes.push({ text: `Opens ${hhmm(rule.prize_open_at)}`, ok: false })
  if (rule.prize_close_at && !closed) notes.push({ text: `Closes ${hhmm(rule.prize_close_at)}`, ok: true })
  if (stock != null && stock > 1 && stockLeft != null) notes.push({ text: `${stockLeft} of ${stock} prizes left`, ok: stockLeft > 0 })

  let state: StripState
  if (mine.length > 0) {
    state = { kind: 'won', winner: mine[0].team_name,
      more: a.role === 'player' && eligible && mine.length < perTeam && stockLeft !== 0 }
  } else if (stockLeft === 0) {
    const first = [...a.claims].sort((x, y) => x.claimed_at.localeCompare(y.claimed_at))[0]
    state = { kind: 'lost', winner: first?.team_name ?? 'Another group', text: stock != null && stock > 1 ? `All ${stock} prizes have been claimed` : undefined }
  } else if (closed) {
    state = { kind: 'unavailable', text: 'The claim window has closed' }
  } else if (!eligible) {
    state = { kind: 'locked', count: done, threshold: total }
  } else {
    state = { kind: 'claimable', canClaim: a.role === 'player' }
  }

  const slots = req.map(c => ({
    key: c.placement_id ?? c.id, title: c.title, hex: c.hex_code,
    iconKey: c.tile_icon ?? c.category_icon ?? null, category: c.category ?? '', done: isDone(c),
  }))
  return { state, slots, done, total, notes, stockLeft }
}
