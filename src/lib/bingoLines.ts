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
// tie-break. It now scales the points a team earned from its tiles: 1 line
// ×1.2, 2 lines ×1.4, 3 lines ×1.6, and so on — +0.2 per line, uncapped (a
// full 12-line board lands at ×3.4).
//
// Only tile points are scaled. Duel winnings and the facilitator's manual
// bonus points are added after, untouched, so a line cannot inflate points a
// team never earned on the board.
export const BINGO_LINE_MULTIPLIER_STEP = 0.2

export function bingoMultiplier(bingos: number): number {
  return 1 + BINGO_LINE_MULTIPLIER_STEP * Math.max(0, bingos)
}

/** The extra points the lines are worth — shown on its own so the scoreboard
 *  can say where the jump came from instead of the total silently growing. */
export function bingoLineBonus(tilePoints: number, bingos: number): number {
  return (Number(tilePoints) || 0) * BINGO_LINE_MULTIPLIER_STEP * Math.max(0, bingos)
}
