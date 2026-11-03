// Which cards are game cards. Keyed by card title (PRD-004 open question 1):
// renaming a card title switches its Play button off until this map is updated.
const GAME_CARDS: Record<string, string> = {
  'icon matching': 'icon-matching',
  'memory & spot the difference': 'memory-spot',
}

export function gameKeyForTitle(title: string | null | undefined): string | null {
  return GAME_CARDS[(title ?? '').trim().toLowerCase()] ?? null
}
