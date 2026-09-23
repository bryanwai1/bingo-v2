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
// A completed line pays a multiplier on THE BOXES THAT FORM IT. The 1st line a
// team completes pays ×1.2 on the total of its five boxes, the 2nd ×1.4, then
// ×1.6, ×1.8 and ×2.0 — five lines' worth of bonus and no more.
//
//   Line 1 (row 1):  100+100+100+100+100 = 500 × 1.2 = 600
//   Line 2 (col 1):  100+100+100+100+100 = 500 × 1.4 = 700
//   3 boxes in no line:                               300
//                                            TOTAL = 1600
//
// Two rules that decide the awkward cases:
//
//  • A box on a crossing point counts in EVERY line it belongs to. Box 1 above
//    sits in both lines and is paid in both — intersecting lines are worth
//    planning for.
//  • A box in no scoring line is paid once at face value. Finishing a task
//    always earns its points; the line is what multiplies them.
//
// Boxes are therefore never paid their face value AND a line multiple — a box
// inside a scoring line is paid only through that line.
//
// Order matters: the multiplier a line gets depends on how many lines came
// before it, so this replays the board in the order boxes were crossed off.
// Duel winnings and the facilitator's manual bonus are added by the caller
// afterwards, untouched.
export const BINGO_LINE_MULTIPLIER_STEP = 0.2

/** How many completed lines can earn a multiplier. The 6th onward pay nothing. */
export const MAX_SCORING_LINES = 5

/** The multiplier the Nth completed line pays: 1 → 1.2, 2 → 1.4 … 5 → 2.0. */
export function bingoLineMultiplier(lineNumber: number): number {
  return 1 + BINGO_LINE_MULTIPLIER_STEP * lineNumber
}

export type BingoCompletion = {
  /** Placement id (or task id on legacy boards) — must match `lineSlots`. */
  id: string
  points: number
  /** When it was crossed off, ms. Ties and unknowns keep their array order. */
  at: number
}

export type BingoScore = {
  /** Points after every line multiplier has been applied. */
  total: number
  /** Raw box points, before any line multiplier. */
  tilePoints: number
  /** What the lines added — total minus tilePoints. */
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

  const pointsById = new Map<string, number>()
  for (const c of completions) pointsById.set(c.id, Number(c.points) || 0)
  const tilePoints = ordered.reduce((sum, c) => sum + (Number(c.points) || 0), 0)

  // Replay to find the ORDER lines complete — that order sets which multiplier
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

  const scoringLines = lineOrder.slice(0, MAX_SCORING_LINES)

  // Each scoring line pays its own boxes' total at its own multiplier.
  let total = 0
  const paidByLine = new Set<string>()
  scoringLines.forEach((lineIdx, i) => {
    let lineTotal = 0
    for (const slot of BINGO_LINES[lineIdx]) {
      const id = lineSlots[slot]?.id
      if (id === undefined) continue
      lineTotal += pointsById.get(id) ?? 0
      paidByLine.add(id)
    }
    total += lineTotal * bingoLineMultiplier(i + 1)
  })

  // Everything else — boxes in no scoring line, including boxes that only
  // appear in a 6th-or-later line — is paid once at face value.
  for (const c of ordered) {
    if (!paidByLine.has(c.id)) total += Number(c.points) || 0
  }

  return { total, tilePoints, lineBonus: total - tilePoints, bingos: lineOrder.length }
}
