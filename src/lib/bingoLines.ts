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

// ── Bingo line multiplier ─────────────────────────────────────────────────────
// Completing a line used to be worth nothing but bragging rights and a
// tie-break. It now lifts the team's running total at the moment the line
// lands: the 1st line multiplies it by 1.2, the 2nd by 1.4, the 3rd by 1.6,
// and so on (+0.2 per line).
//
// This is NOT a single multiplier applied to the final tile total — it is a
// replay of the board in the order tiles were crossed off, because points
// earned BEFORE a line are lifted by it and points earned AFTER are not:
//
//   100 pts    → line 1 → 100 × 1.2 = 120
//   +50 pts    →          120 +  50 = 170
//              → line 2 → 170 × 1.4 = 238
//
// so the same 50 points are worth more or less depending on when they landed.
// Only tile points are replayed. Duel winnings and the facilitator's manual
// bonus are added afterwards, untouched, so a line cannot inflate points a
// team never earned on the board.
export const BINGO_LINE_MULTIPLIER_STEP = 0.2

/** The multiplier the Nth completed line applies to the running total. */
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
  /** Tile points after every line multiplier has been applied. */
  total: number
  /** Raw tile points, before any line multiplier. */
  tilePoints: number
  /** What the lines added — total minus tilePoints. */
  lineBonus: number
  bingos: number
}

/**
 * Replay a team's board in completion order and apply each line multiplier at
 * the moment that line completes.
 *
 * A single tile can complete more than one line at once (a crossing box), in
 * which case each is applied in turn: ×1.2 then ×1.4.
 */
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

  const done = new Set<string>()
  let total = 0
  let tilePoints = 0
  let linesApplied = 0

  for (const c of ordered) {
    const pts = Number(c.points) || 0
    total += pts
    tilePoints += pts
    done.add(c.id)
    const linesNow = completedBingoLines(lineSlots, done).length
    while (linesApplied < linesNow) {
      linesApplied++
      total *= bingoLineMultiplier(linesApplied)
    }
  }

  return { total, tilePoints, lineBonus: total - tilePoints, bingos: linesApplied }
}
