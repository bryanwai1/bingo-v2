// Scoreboard skins for the projector.
//
// These are read at a distance, often over someone talking, sometimes in a
// room the facilitator did not choose. So each theme is a legibility decision
// before it is a visual one:
//
//   midnight — the default. Dark, calm, good in a controlled AV room.
//   arena    — maximum contrast and weight. For a big room, far seats, or a
//              dim projector where midnight greys disappear.
//   daylight — light background. A hotel function room with windows washes
//              out a dark screen completely; this is the fix for that, not a
//              style preference.

export type ScoreboardTheme = {
  key: string
  name: string
  hint: string
  /** Page background. */
  bg: string
  /** Row background + border. */
  row: string
  rowLead: string
  /** Text ramp. */
  heading: string
  body: string
  muted: string
  /** Accents. */
  accent: string
  accentSoft: string
  positive: string
  /** Stat colours. These were hardcoded in the projector rows, which meant
      daylight rendered amber-400 and green-400 on a near-white background —
      unreadable in exactly the bright room daylight exists to serve. */
  lines: string
  bonus: string
  duel: string
  /** Rank 1-3 accent, then everyone else. Silver on a light page was invisible. */
  rankColors: readonly [string, string, string]
  rankMuted: string
  /** Ambient blobs — empty string turns them off. */
  ambient: string
}

export const SCOREBOARD_THEMES: ScoreboardTheme[] = [
  {
    key: 'midnight',
    name: 'Midnight',
    hint: 'Dark and calm — best in a controlled AV room',
    bg: 'bg-gray-950 text-white',
    row: 'border-white/10 bg-white/[0.04]',
    rowLead: 'border-violet-400/50 bg-violet-500/15',
    heading: 'text-white',
    body: 'text-white/80',
    muted: 'text-white/40',
    accent: 'text-violet-300',
    accentSoft: 'text-fuchsia-300',
    positive: 'text-emerald-400',
    lines: 'text-amber-400',
    bonus: 'text-amber-400',
    duel: 'text-red-300',
    rankColors: ['#fbbf24', '#cbd5e1', '#d97706'],
    rankMuted: '#6b7280',
    ambient: 'bg-violet-600/20',
  },
  {
    key: 'arena',
    name: 'Arena',
    hint: 'Maximum contrast — for big rooms and far seats',
    bg: 'bg-black text-white',
    row: 'border-white/25 bg-white/[0.07]',
    rowLead: 'border-amber-400 bg-amber-400/20',
    heading: 'text-white',
    body: 'text-white',
    muted: 'text-white/55',
    accent: 'text-amber-300',
    accentSoft: 'text-amber-200',
    positive: 'text-lime-400',
    lines: 'text-amber-300',
    bonus: 'text-amber-300',
    duel: 'text-red-300',
    rankColors: ['#fbbf24', '#e2e8f0', '#f59e0b'],
    rankMuted: '#9ca3af',
    ambient: '',
  },
  {
    key: 'daylight',
    name: 'Daylight',
    hint: 'Light background — for bright rooms with windows',
    bg: 'bg-slate-100 text-slate-900',
    row: 'border-slate-300 bg-white',
    rowLead: 'border-violet-500 bg-violet-50',
    heading: 'text-slate-900',
    body: 'text-slate-700',
    muted: 'text-slate-500',
    accent: 'text-violet-700',
    accentSoft: 'text-fuchsia-700',
    positive: 'text-emerald-600',
    lines: 'text-amber-700',
    bonus: 'text-amber-700',
    duel: 'text-red-700',
    rankColors: ['#b45309', '#64748b', '#92400e'],
    rankMuted: '#64748b',
    ambient: '',
  },
]

export function getScoreboardTheme(key: string | null | undefined): ScoreboardTheme {
  return SCOREBOARD_THEMES.find(t => t.key === key) ?? SCOREBOARD_THEMES[0]
}
