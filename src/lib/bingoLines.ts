const BINGO_GRID_SIZE = 25

// All 12 possible bingo lines: 5 rows + 5 cols + 2 diagonals
export const BINGO_LINES: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

export function buildBingoSlots<T extends { id: string; sort_order: number }>(
  tasks: T[],
  size = BINGO_GRID_SIZE,
): (T | null)[] {
  const slots: (T | null)[] = Array(size).fill(null)
  const overflow: T[] = []
  for (const t of tasks) {
    const s = t.sort_order
    if (Number.isInteger(s) && s >= 0 && s < size && slots[s] === null) slots[s] = t
    else overflow.push(t)
  }
  for (const t of overflow) {
    const i = slots.findIndex(x => x === null)
    if (i !== -1) slots[i] = t
  }
  return slots
}

export function completedBingoLines(
  slots: ({ id: string } | null)[],
  completedIds: Set<string>,
): number[] {
  const out: number[] = []
  BINGO_LINES.forEach((line, i) => {
    const allDone = line.every(idx => {
      const task = slots[idx]
      return !!task && completedIds.has(task.id)
    })
    if (allDone) out.push(i)
  })
  return out
}

// ── Bingo line scoring ────────────────────────────────────────────────────────
// Every finished box pays its own points (already time-adjusted by the caller).
// Completed lines add a flat bonus on top: the 1st line a team completes pays
// +100, the 2nd +200, then +300, +400 and +500 — five lines' worth and no more.
//
//   Line 1 (row 1):  +100
//   Line 2 (col 1):  +200
//   3 other boxes:   still pay their own points
//
// A box on a crossing point counts toward every line it belongs to, but its own
// points are paid once. Order matters: the bonus a line gets depends on how many
// lines came before it, so this replays the board in the order boxes were
// crossed off. Duel winnings and the facilitator's manual bonus are added by the
// caller afterwards, untouched.
export const BINGO_LINE_BONUS_STEP = 100

/** How many completed lines earn a bonus. The 6th onward pay nothing. */
export const MAX_SCORING_LINES = 5

/** The bonus the Nth completed line pays: 1 → 100, 2 → 200 … 5 → 500. */
export function bingoLineBonus(lineNumber: number): number {
  return BINGO_LINE_BONUS_STEP * lineNumber
}

export type BingoCompletion = {
  /** Placement id (or task id on legacy boards) — must match `lineSlots`. */
  id: string
  points: number
  /** When it was crossed off, ms. Ties and unknowns keep their array order. */
  at: number
}

export type BingoScore = {
  /** Box points plus the line bonus. */
  total: number
  /** Box points alone, before any line bonus. */
  tilePoints: number
  /** What the completed lines added. */
  lineBonus: number
  /** Lines completed in total (may exceed the 5 that actually pay). */
  bingos: number
}

export function scoreWithBingoLines(
  completions: BingoCompletion[],
  lineSlots: ({ id: string } | null)[],
): BingoScore {
  // Stable sort by completion time. Scans recorded before completed_at existed
  // arrive as 0 and replay first, which is the best guess available and keeps
  // the result deterministic.
  const ordered = completions
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.at - b.c.at) || (a.i - b.i))
    .map(x => x.c)

  // Box points carry 2 decimals; round the sum so float noise never shows.
  const tilePoints = Math.round(ordered.reduce((sum, c) => sum + (Number(c.points) || 0), 0) * 100) / 100

  // Replay to find the ORDER lines complete — that order sets which bonus
  // each one earns. One box can close two lines at once (a crossing point);
  // completedBingoLines returns them in BINGO_LINES order, which then decides
  // which of the two is "first".
  const done = new Set<string>()
  const seen = new Set<number>()
  const lineOrder: number[] = []
  for (const c of ordered) {
    done.add(c.id)
    for (const idx of completedBingoLines(lineSlots, done)) {
      if (seen.has(idx)) continue
      seen.add(idx)
      lineOrder.push(idx)
    }
  }

  const lineBonus = lineOrder
    .slice(0, MAX_SCORING_LINES)
    .reduce((sum, _line, i) => sum + bingoLineBonus(i + 1), 0)
  const total = Math.round((tilePoints + lineBonus) * 100) / 100

  return { total, tilePoints, lineBonus, bingos: lineOrder.length }
}
