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
  | { kind: 'won'; winner: string }
  | { kind: 'lost'; winner: string }

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
