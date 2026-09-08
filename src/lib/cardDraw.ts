// Per-team card draws: the bank a card deals from, and the default banks for
// the three Mall Hunt cards whose instructions promise in-app content.

export type DrawItem = {
  id: string
  position: number
  label: string
  /** Nudge shown to the team on demand. Never the answer. */
  hint: string | null
  /** The answer, for the facilitator only — never rendered to a team. */
  detail: string | null
  hex: string | null
}

export type DrawAssignment = {
  slot: number
  item_id: string
}

/**
 * Pick `count` items, favouring the ones fewest other teams have already drawn.
 *
 * Blind random would hand three teams the same riddle while four items sat
 * unused. Sorting by how often each item has gone out spreads the bank, and the
 * random tiebreak keeps two teams drawing at once from getting identical sets.
 */
export function pickItems(
  items: DrawItem[],
  count: number,
  usage: Record<string, number>,
): DrawItem[] {
  return [...items]
    .map(item => ({ item, used: usage[item.id] ?? 0, jitter: Math.random() }))
    .sort((a, b) => (a.used - b.used) || (a.jitter - b.jitter))
    .slice(0, Math.min(count, items.length))
    .map(x => x.item)
}

type Seed = { label: string; hint?: string; detail?: string; hex?: string }

/** Seeded from the card's own instructions, then editable per venue. */
export const DEFAULT_DRAW_BANKS: Record<string, { count: number; items: Seed[] }> = {
  'Colour Hunt': {
    count: 4,
    items: [
      { label: 'Red', hex: '#ef4444' },
      { label: 'Orange', hex: '#f97316' },
      { label: 'Yellow', hex: '#eab308' },
      { label: 'Green', hex: '#22c55e' },
      { label: 'Teal', hex: '#14b8a6' },
      { label: 'Blue', hex: '#3b82f6' },
      { label: 'Purple', hex: '#a855f7' },
      { label: 'Pink', hex: '#ec4899' },
      { label: 'Black', hex: '#111827' },
      { label: 'White', hex: '#f9fafb' },
      { label: 'Gold', hex: '#d4a017' },
      { label: 'Silver', hex: '#9ca3af' },
    ],
  },

  // The riddle bank from the Gurney Plaza deck. detail is the answer — shown to
  // the team only after they have been to the spot, so it settles arguments
  // without giving the riddle away.
  'Escape the Mall': {
    count: 1,
    items: [
      { label: 'I move you up but never break a sweat — step on, step off, no walking yet.', detail: 'Escalator', hint: 'You will hear it moving before you see it.' },
      { label: 'Lost your way? Just look at me — a map of every shop, floor by floor.', detail: 'Directory board', hint: 'Look near a main entrance.' },
      { label: 'Many stalls beneath one roof; hungry crowds all gather here.', detail: 'Food court', hint: 'Follow the smell of lunch.' },
      { label: 'Press a button, step inside — I carry you floor to floor.', detail: 'Lift / Elevator', hint: 'There is usually one at each end of the building.' },
      { label: 'Ask me anything at all — the desk where lost is always found.', detail: 'Information counter', hint: 'Someone in uniform is standing behind it.' },
      { label: 'Coins and wishes fall in me while water dances for the crowd.', detail: 'Fountain', hint: 'Listen for running water.' },
      { label: 'The open heart of the mall — where events and crowds fill the hall.', detail: 'Centre court', hint: 'The biggest open space on the ground floor.' },
      { label: 'Dark and loud with a giant screen — buy a ticket to watch the scene.', detail: 'Cinema', hint: 'Try the top floor.' },
    ],
  },

  'Route Master': {
    count: 4,
    items: [
      { label: 'The main entrance', hint: 'Where most shoppers come in' },
      { label: 'The food court', hint: 'Busiest at lunchtime' },
      { label: 'The cinema', hint: 'Follow the posters' },
      { label: 'The information counter', hint: 'Staffed, usually on the ground floor' },
      { label: 'The fountain or water feature', hint: 'Listen for it' },
      { label: 'Centre court', hint: 'The open events space' },
      { label: 'The top-floor lift lobby', hint: 'As high as the lifts go' },
      { label: 'A bookstore', hint: 'Any one will do' },
      { label: 'A sports shop', hint: 'Any one will do' },
      { label: 'A toy or gadget shop', hint: 'Any one will do' },
      { label: 'The supermarket entrance', hint: 'Usually the lowest floor' },
      { label: 'A coffee shop', hint: 'Any one will do' },
    ],
  },
}

/** What the draw is called on the card, so the heading reads naturally. */
export function drawHeading(title: string, count: number): string {
  if (title === 'Colour Hunt') return `Your ${count} colours`
  if (title === 'Escape the Mall') return 'Your riddle'
  if (title === 'Route Master') return `Your ${count} checkpoints`
  return count === 1 ? 'Your card' : `Your ${count}`
}
