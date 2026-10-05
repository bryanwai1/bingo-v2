import type { BingoScan } from '../types/database'

// ── Per-card time bonus ───────────────────────────────────────────────────────
// A card pays 150% of its base points when a team finishes inside the FULL
// window. After that the bonus glides down evenly, second by second, to base
// points when the card's TIMER runs out — so two teams almost never score the
// same. Never below base — a slow team is un-rewarded, not punished. The clock
// is the team's own: opened the card (scanned_at) to completed it (completed_at).
//
//   full = 10, timer = 25   (percent at each landmark, straight line between)
//     10:00 150%  ·  13:00 140%  ·  16:00 130%  ·  19:00 120%  ·  22:00 110%
//     25:00+ 100% (base)          e.g. 11:30 → 146.67%  ·  20:45 → 113.00%

export const DEFAULT_BONUS_FULL_MIN = 10
export const DEFAULT_BONUS_TIMER_MIN = 25
export const MAX_BONUS_PCT = 150
const BASE_PCT = 100
/** Landmarks between full and timer: 140, 130, 120, 110 (the glide hits each exactly). */
const LANDMARKS = 5

/** Board-wide default; a card with no override of its own follows this. */
export interface BonusDefaults {
  default_bonus_full_minutes?: number | null
  default_bonus_timer_minutes?: number | null
}

/** A card's own override — null/undefined means "follow the board default". */
export interface BonusOverride {
  bonus_full_minutes?: number | null
  bonus_timer_minutes?: number | null
}

export interface BonusWindow {
  full: number
  timer: number
}

const positive = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null

/** Card override → board default → built-in default. Timer is never below full. */
export function resolveBonusWindow(
  card?: BonusOverride | null,
  board?: BonusDefaults | null,
): BonusWindow {
  const full = positive(card?.bonus_full_minutes) ?? positive(board?.default_bonus_full_minutes) ?? DEFAULT_BONUS_FULL_MIN
  const timer = positive(card?.bonus_timer_minutes) ?? positive(board?.default_bonus_timer_minutes) ?? DEFAULT_BONUS_TIMER_MIN
  return { full, timer: Math.max(full, timer) }
}

export interface BonusCheckpoint {
  pct: number
  /** The minute the glide reaches this %. */
  uptoMin: number
}

/** Landmarks on the glide: 150 at the end of the full window, then 140/130/120/110 evenly to the timer. */
export function bonusCheckpoints({ full, timer }: BonusWindow): BonusCheckpoint[] {
  const out: BonusCheckpoint[] = [{ pct: MAX_BONUS_PCT, uptoMin: full }]
  const step = (timer - full) / LANDMARKS
  for (let i = 1; i < LANDMARKS; i++) {
    out.push({ pct: MAX_BONUS_PCT - ((MAX_BONUS_PCT - BASE_PCT) / LANDMARKS) * i, uptoMin: full + step * i })
  }
  return out
}

/**
 * The % of base points earned for finishing at `elapsedMs`: 150 inside the
 * full window, a straight line down to 100 at the timer, 100 after. Unrounded.
 */
export function bonusPercent(elapsedMs: number, window: BonusWindow): number {
  const mins = elapsedMs / 60_000
  if (!(mins >= 0)) return BASE_PCT
  if (mins <= window.full) return MAX_BONUS_PCT
  if (mins >= window.timer) return BASE_PCT
  const left = (window.timer - mins) / (window.timer - window.full)
  return BASE_PCT + (MAX_BONUS_PCT - BASE_PCT) * left
}

/** Scores are kept to 2 decimal places. */
export const round2 = (n: number) => Math.round(n * 100) / 100

/** Points for a card finished at `elapsedMs`, to 2 decimals. */
export function bonusPoints(base: number, elapsedMs: number, window: BonusWindow): number {
  return round2((Number(base) || 0) * bonusPercent(elapsedMs, window) / 100)
}

/**
 * The scan that completed a box: this placement's own, or — for scans recorded
 * before board_card_id existed — any completed scan of the same card.
 */
export function completionScan(
  teamScans: BingoScan[],
  placementId: string | null | undefined,
  taskId: string,
): BingoScan | undefined {
  const done = teamScans.filter(s => s.completed)
  return (placementId ? done.find(s => s.board_card_id === placementId) : undefined)
    ?? done.find(s => !s.board_card_id && s.task_id === taskId)
}

/** Elapsed ms between opening and completing, or null when either time is unknown. */
export function scanElapsedMs(scan: Pick<BingoScan, 'scanned_at' | 'completed_at'> | undefined): number | null {
  if (!scan?.scanned_at || !scan.completed_at) return null
  const ms = Date.parse(scan.completed_at) - Date.parse(scan.scanned_at)
  return Number.isFinite(ms) ? ms : null
}

/**
 * What one finished box is worth. Without both timestamps (old data, demos) the
 * team simply gets base points.
 */
export function boxPoints(
  task: { id: string; points?: number | null; placement_id?: string | null } & BonusOverride,
  teamScans: BingoScan[],
  board?: BonusDefaults | null,
): number {
  const base = Number(task.points ?? 0) || 0
  const elapsed = scanElapsedMs(completionScan(teamScans, task.placement_id, task.id))
  if (elapsed === null) return base
  return bonusPoints(base, elapsed, resolveBonusWindow(task, board))
}
