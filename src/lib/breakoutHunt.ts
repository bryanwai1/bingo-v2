// Breakout Hunt — puzzle answer checking and the default puzzle bank.

export type BreakoutPuzzle = {
  id: string
  position: number
  image_url: string | null
  prompt: string | null
  answer: string
  aliases: string[]
  hint: string | null
}

export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type BreakoutProgress = {
  puzzle_id: string
  attempts: number
  hint_used: boolean
  solved_at: string | null
  photo_url: string | null
  photo_at: string | null
  submitted_at?: string | null
  review_status?: ReviewStatus
}

/**
 * Normalise a guess for comparison: case, spacing, punctuation and a leading
 * article all stop mattering, so "The Clock" and "clock!" both match "clock".
 */
export function normalizeGuess(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/^\s*(a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Levenshtein distance, capped — only used to forgive small typos. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length || !b.length) return Math.max(a.length, b.length)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Does this guess count?
 *
 * Accepts the answer, any alias, and a near-miss typo on either — a team that
 * types "escalater" has plainly solved it, and refusing that would feel broken
 * rather than strict. Longer words tolerate one more slip than short ones.
 */
export function isCorrectGuess(guess: string, puzzle: Pick<BreakoutPuzzle, 'answer' | 'aliases'>): boolean {
  const g = normalizeGuess(guess)
  if (!g) return false
  const candidates = [puzzle.answer, ...puzzle.aliases].map(normalizeGuess).filter(Boolean)
  return candidates.some(c => {
    if (g === c) return true
    // A guess that contains the answer as a whole word passes: "a big clock".
    if (new RegExp(`(^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(g)) return true
    const tolerance = c.length >= 8 ? 2 : c.length >= 5 ? 1 : 0
    return tolerance > 0 && editDistance(g, c) <= tolerance
  })
}

/**
 * The 10 puzzles from the Gurney Plaza deck. Answers only — the puzzle images
 * are uploaded per card, so this is what a fresh card is seeded with and what
 * the admin then edits.
 */
export const DEFAULT_BREAKOUT_PUZZLES: {
  answer: string
  aliases: string[]
  hint: string
}[] = [
  { answer: 'Tree', aliases: ['plant', 'palm', 'palm tree'], hint: 'It is alive, and it is probably in a big pot.' },
  { answer: 'Scissors', aliases: ['shears', 'a pair of scissors'], hint: 'Two blades, two handles — a salon or a craft shop has them.' },
  { answer: 'Clock', aliases: ['watch', 'wall clock', 'time'], hint: 'It tells you something you keep checking today.' },
  { answer: 'Umbrella', aliases: ['brolly', 'parasol'], hint: 'You want one when you leave and it is raining.' },
  { answer: 'Escalator', aliases: ['moving stairs', 'travelator', 'elevator stairs'], hint: 'It moves you up without you walking.' },
  { answer: 'Book', aliases: ['novel', 'magazine'], hint: 'A whole shop in this mall is full of them.' },
  { answer: 'Mannequin', aliases: ['dummy', 'model', 'display dummy'], hint: 'It wears clothes but never moves.' },
  { answer: 'Shopping bag', aliases: ['bag', 'paper bag', 'carrier bag'], hint: 'Almost every shopper walking past is holding one.' },
  { answer: 'Fountain', aliases: ['water feature', 'water fountain'], hint: 'Follow the sound of water.' },
  { answer: 'Bench', aliases: ['seat', 'chair', 'bench seat'], hint: 'Where tired shoppers rest their legs.' },
]
