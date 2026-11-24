import type { BingoTask } from '../types/database'

export type Needs = Pick<BingoTask, 'players_min' | 'players_max' | 'players_whole_team' | 'play_location' | 'is_station'>

/** "2", "2–4", "Whole team", or null when the card does not say. */
export function peopleLabel(t: Needs): string | null {
  if (t.players_whole_team) return 'Whole team'
  const min = t.players_min ?? null
  if (!min) return null
  const max = t.players_max ?? null
  return max && max > min ? `${min}–${max}` : String(min)
}

export function hasNeeds(t: Needs): boolean {
  return !!peopleLabel(t) || !!t.play_location?.trim()
}
