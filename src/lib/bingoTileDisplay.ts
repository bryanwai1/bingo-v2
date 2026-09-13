// Non-JSX helpers behind the per-board bingo tile display mode
// (bingo_sections.tile_display). The tile faces themselves live in
// components/BingoTileFace.tsx — kept apart so that file only exports
// components (React Fast Refresh requirement).

export type TileDisplay = 'icon' | 'words'

export function normalizeTileDisplay(value: string | null | undefined): TileDisplay {
  return value === 'words' ? 'words' : 'icon'
}

// ── Category → icon mapping ───────────────────────────────────────────────────
// Keyword rules map each admin-defined category to the best-fitting icon, with a
// stable hash fallback so even brand-new categories always get a consistent one.

const ICON_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\ba\.?i\b|artificial|robot|cyber|android|machine|\btech\b|digital/, 'cpu'],
  [/physical|fitness|exercise|workout|cardio|sport|\brun\b|athlet|agilit/, 'activity'],
  [/strength|power|\blift\b|\bgym\b|muscle|endurance/, 'activity'],
  [/team|group|squad|crew|together|collab|unity|partner/, 'users'],
  [/compet|versus|battle|tournament|champion|\brace\b|rival|relay/, 'trophy'],
  // Before the hunt rule: "Mall Hunt" is its own thing, not a scavenger hunt.
  [/\bmall\b|shop|store|retail|arcade|plaza/, 'bag'],
  [/hunt|search|scavenger|\bfind\b|seek|\bspot\b|locate|detect/, 'search'],
  [/puzzle|brain|logic|riddle|solve|mystery|enigma|sequence/, 'lightbulb'],
  [/quiz|trivia|knowledge|learn|study|memory|\bmind\b|\bword/, 'book'],
  [/creativ|\bart\b|craft|design|draw|paint|imagin|sculpt/, 'sparkles'],
  [/music|sound|rhythm|dance|\bsing\b|\bsong\b|\bbeat\b|audio/, 'music'],
  [/photo|picture|\bsnap\b|camera|selfie|\bimage\b|video|film/, 'camera'],
  [/talk|communicat|speak|language|debate|present|story|express|tongue/, 'message'],
  [/\bmap\b|location|\bplace\b|travel|navigat|route|explore|adventure|journey|world/, 'compass'],
  [/energy|speed|\bfast\b|quick|electric|spark|flash|reflex/, 'zap'],
  [/challenge|mission|\btask\b|\bgame\b|\bplay\b|activit|round|stage|tower|cube|shape|stack/, 'target'],
]

export function resolveIconKey(category: string): string {
  const c = (category || '').toLowerCase()
  for (const [re, key] of ICON_RULES) if (re.test(c)) return key
  let h = 0
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0
  const generics = ['star', 'target', 'flag', 'zap', 'compass', 'sparkles']
  return generics[h % generics.length] || 'star'
}

// ── Words mode ────────────────────────────────────────────────────────────────

// Trim a title down to what actually fits a tile. Leading filler verbs carry no
// information at this size, so they go first; then we cut on a word boundary.
// The full title is still one tap away (and lives in the tile's title/aria).
const FILLER = /^(?:please\s+|go\s+(?:and\s+)?|try\s+to\s+|make\s+sure\s+to\s+|you\s+must\s+|complete\s+the\s+|the\s+)/i

export function shortenTitle(title: string, maxChars = 20): string {
  const clean = (title || '').trim().replace(FILLER, '')
  if (clean.length <= maxChars) return clean
  const cut = clean.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

// ── Category → colour ─────────────────────────────────────────────────────────
// Cards in one category share a colour on the board, whatever each row's
// hex_code says: a card copied in from another board arrives with that board's
// colour, and the admin's "color for all" only fixes it once someone notices.
// The category's colour is the one most of its cards already carry (ties go
// to the earliest card), so nothing changes on a board that is already tidy.

export function categoryColors(tasks: ReadonlyArray<{ category?: string | null; hex_code: string; sort_order?: number }>): Record<string, string> {
  const tally: Record<string, Map<string, { n: number; first: number }>> = {}
  const sorted = [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  sorted.forEach((t, i) => {
    const cat = (t.category ?? '').trim()
    if (!cat || !t.hex_code) return
    const m = (tally[cat] ??= new Map())
    const e = m.get(t.hex_code)
    if (e) e.n += 1; else m.set(t.hex_code, { n: 1, first: i })
  })
  const out: Record<string, string> = {}
  for (const [cat, m] of Object.entries(tally)) {
    let best: { hex: string; n: number; first: number } | null = null
    for (const [hex, e] of m) {
      if (!best || e.n > best.n || (e.n === best.n && e.first < best.first)) best = { hex, ...e }
    }
    if (best) out[cat] = best.hex
  }
  return out
}

/** The same cards, each painted with its category's colour. */
export function withCategoryColors<T extends { category?: string | null; hex_code: string; sort_order?: number }>(tasks: T[]): T[] {
  const colors = categoryColors(tasks)
  return tasks.map(t => {
    const hex = colors[(t.category ?? '').trim()]
    return hex && hex !== t.hex_code ? { ...t, hex_code: hex } : t
  })
}
