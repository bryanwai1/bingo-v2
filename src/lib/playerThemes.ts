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

// The look of the board a player last saw, so a screen that has to fetch the
// board before it knows its theme (the scoreboard) can paint the right
// background on its very first frame instead of flashing the default one.
const LAST_THEME_KEY = 'bingo-dash-player-theme'

export function rememberPlayerTheme(theme: PlayerTheme): void {
  try { localStorage.setItem(LAST_THEME_KEY, theme) } catch { /* private mode: no cache, no harm */ }
}

export function lastPlayerTheme(): PlayerTheme {
  try { return normalizePlayerTheme(localStorage.getItem(LAST_THEME_KEY)) } catch { return 'default' }
}
