// Where a draw slot gets its options from.
//
// Two stores exist and both are just lists of things a team can draw:
//   pool  — aitb_pool_items, the shared house vocabulary reused across cards
//   card  — bingo_draw_items, a bank belonging to this card alone
//
// A slot names which it reads, and everything downstream works off one key, so
// the presentation (wheel, deal, cup, list) never has to know the difference.

export type DrawSource = 'pool' | 'card'

/** One option a slot can land on. Only `label` is required; the rest decorate. */
export type DrawOption = {
  label: string
  photoUrl: string | null
  hex?: string | null
  hint?: string | null
}

export type SlotRow = {
  id: string
  position: number
  label: string
  emoji: string | null
  source: DrawSource
  pool_key: string | null
  /** How many items this one slot deals. 1 for a plain wheel or card. */
  deal_count: number
  /** Whether what this slot draws is part of the card's AI prompt. */
  in_prompt: boolean
}

/** Separates the items a multi-deal slot landed on, in the one saved string. */
export const DEAL_SEP = ' · '

/**
 * The key a slot's options are stored and looked up under.
 *
 * Prefixed so a card list and a house pool can never collide, and so two slots
 * reading the same pool share one entry rather than fetching it twice.
 */
export function slotKey(slot: Pick<SlotRow, 'id' | 'source' | 'pool_key'>): string {
  return slot.source === 'card' ? `card:${slot.id}` : `pool:${slot.pool_key ?? ''}`
}

/** Presentation styles a card can use for its draw. */
export const DRAW_STYLES = [
  { value: 'spin', label: 'Spin wheel', hint: 'Pie wheels the team spins, then locks.' },
  { value: 'deal', label: 'Card deal', hint: 'Cards dealt face-up together, no re-draws.' },
  { value: 'pick', label: 'Instant reveal', hint: 'Each slot flickers, then all land at once.' },
  { value: 'gamepick', label: 'Game checklist', hint: 'Tick a fixed list off as it is built.' },
] as const

export type DrawStyle = (typeof DRAW_STYLES)[number]['value']

/** What a card may already carry. 'list' was the standalone per-team deal;
 *  it is no longer offered, but cards configured with it still read back. */
export type StoredDrawStyle = DrawStyle | 'list'

/** Styles that draw from slots. 'gamepick' tracks a fixed list instead. */
export function styleUsesSlots(style: string | null | undefined): boolean {
  return style === 'spin' || style === 'deal' || style === 'pick'
}
