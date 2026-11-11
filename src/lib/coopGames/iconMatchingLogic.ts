import type { CoopPuzzleLogic } from './session.ts'

// PRD-005 Icon Matching. The board size and the viewing period are config values.
export const BOARD = { rows: 4, cols: 4 }
export const VIEW_MS = 2500 // non-match viewing period (DESIGN-004 view-ms)

// Only the illustrated set; icons/resources and icons/original are never used.
export const ICON_POOL = Array.from({ length: 21 }, (_, i) => `icon-${String(i + 1).padStart(2, '0')}`)
export const iconSrc = (id: string) => `/grab/icons/${id}.png`
export const cardLabel = (i: number, cols: number) => `${String.fromCharCode(65 + Math.floor(i / cols))}${(i % cols) + 1}`

export interface IconState {
  v: 1
  cols: number
  cards: string[]      // icon id per position, row-major
  flipped: number[]    // 0 to 2 positions turned over and not matched
  matched: number[]
  last: 'match' | 'miss' | null
  /** PRD-007: each player's pick of the current turn, by player slot (0 or 1). Absent in older sessions. */
  picks?: Record<string, number>
}
export type IconAction = { type: 'flip'; index: number } | { type: 'pick'; index: number; slot: number } | { type: 'hide' }

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function createIconMatching(
  board: { rows: number; cols: number } = BOARD, rng: () => number = Math.random,
): CoopPuzzleLogic<IconState, IconAction> {
  const n = board.rows * board.cols
  if (n < 2 || n % 2 !== 0 || n / 2 > ICON_POOL.length) throw new Error('Board needs an even number of cards, at most 42')
  return {
    key: 'icon-matching',
    initState: () => {
      const icons = shuffle(ICON_POOL, rng).slice(0, n / 2)
      return { v: 1, cols: board.cols, cards: shuffle([...icons, ...icons], rng), flipped: [], matched: [], last: null, picks: {} }
    },
    remote: a => (a.type === 'pick' ? { kind: 'pick', index: a.index } : a.type === 'hide' ? { kind: 'hide' } : null),
    reduce: (s, a) => {
      if (a.type === 'hide') return s.flipped.length === 2 ? { ...s, flipped: [], last: null, picks: {} } : s
      if (a.type === 'pick') {
        // Mirror of coop_pick on the server: one locked pick per player, never the other player's card.
        const i = a.index, mine = String(a.slot), other = String(1 - a.slot)
        const picks = s.picks ?? {}
        if (!Number.isInteger(i) || i < 0 || i >= s.cards.length || (a.slot !== 0 && a.slot !== 1)) return s
        if (s.flipped.length >= 2 || s.matched.includes(i) || mine in picks || picks[other] === i) return s
        const both = { ...picks, [mine]: i }
        if (!(other in picks)) return { ...s, picks: both, last: null }
        const x = both['0'], y = both['1']
        return s.cards[x] === s.cards[y]
          ? { ...s, flipped: [], matched: [...s.matched, x, y], last: 'match', picks: {} }
          : { ...s, flipped: [x, y], last: 'miss', picks: {} }
      }
      const i = a.index
      if (!Number.isInteger(i) || i < 0 || i >= s.cards.length) return s
      if (s.flipped.length >= 2 || s.flipped.includes(i) || s.matched.includes(i)) return s
      if (s.flipped.length === 0) return { ...s, flipped: [i], last: null }
      const j = s.flipped[0]
      return s.cards[i] === s.cards[j]
        ? { ...s, flipped: [], matched: [...s.matched, j, i], last: 'match' }
        : { ...s, flipped: [j, i], last: 'miss' }
    },
    isSolved: s => s.matched.length === s.cards.length,
  }
}
