// Per-board look of the PLAYER screens (join, waiting, board).
// Stored on bingo_sections.player_theme — see supabase/core-tables/20261006_player_theme.sql.
// Components live in components/PlayerBackdrop.tsx; this file stays JSX-free.

export type PlayerTheme = 'default' | 'grab'

export const PLAYER_THEMES: ReadonlyArray<{ value: PlayerTheme; label: string; hint: string }> = [
  { value: 'default', label: 'Bingo Dash', hint: 'The standard dark look' },
  { value: 'grab', label: 'Grab Game Day', hint: 'Green stadium art, phone and laptop versions' },
]

export function normalizePlayerTheme(value: string | null | undefined): PlayerTheme {
  return value === 'grab' ? 'grab' : 'default'
}

/** Grab brand green, used for accents on the Grab theme. */
export const GRAB_GREEN = '#00B14F'
