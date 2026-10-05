// ── Award slide sequence + tier helpers ─────────────────────────────────────
//
// Slide ids:
//   · "main", "intro", "holding", "lineup" — singletons (unique)
//   · "<prizeKind>:<n>"  — prize slide where n is a stable, never-reused
//                          positional counter within the kind. Removing a
//                          prize slide leaves surrounding ids untouched.
//
// Display rank in a tier ("Consolation #1, #2, …") is computed from the order
// a slide appears in `slide_order`, NOT from the numeric suffix.
//
// Team assignment is canonical:
//   · `first` slides (in display order) take ranks 1..first_count
//   · `second` slides take the next block, then `third`, then `consolation`
//   · `consolation_group` slides come after all single consolation slides.
//     Each takes 3 ranks. They are assigned in REVERSE display order so the
//     first-displayed group reveals the WORST ranks (ceremonial worst→best).
// Reordering visible slides does not change who wins what (with the one
// exception that consolation_group display order intentionally controls
// which group reveals worst-first).

export type PrizeKind =
  | 'consolation'
  | 'consolation_group'
  | 'fifth'
  | 'fourth'
  | 'third'
  | 'second'
  | 'first'
type SingletonKind = 'main' | 'intro' | 'holding' | 'lineup' | 'scoreboard' | 'closing'
export type AwardSlideKind = SingletonKind | PrizeKind

/** Teams shown on a single consolation_group slide. */
const CONSOLATION_GROUP_SIZE = 3

function isSingletonKind(kind: string): kind is SingletonKind {
  return (
    kind === 'main' ||
    kind === 'intro' ||
    kind === 'holding' ||
    kind === 'lineup' ||
    kind === 'scoreboard' ||
    kind === 'closing'
  )
}

export type AwardSlideId = string

export interface AwardSlideDescriptor {
  id: AwardSlideId
  kind: AwardSlideKind
  /** 1-based position within kind, as displayed. null for singletons. */
  rank: number | null
  /** Team ranks revealed by this slide. Length 1 for single-team prize slides,
   *  CONSOLATION_GROUP_SIZE for `consolation_group`, null for singletons. */
  teamRanks: number[] | null
}

export interface PrizeCounts {
  consolation_count: number
  consolation_group_count: number
  /** Optional: saved orders predating 4th/5th place have no such slides, so
   *  countsFromOrder reports 0 and existing team ranks are unchanged. */
  fifth_count?: number
  fourth_count?: number
  third_count: number
  second_count: number
  first_count: number
}

/**
 * The prize line-up a board gets when it has no saved award config: five
 * places, no consolation groups.
 *
 * The admin and the ceremony used to hard-code their own copy of this, and
 * they agreed only by coincidence - a board with no config row would have
 * shown one sequence in the editor and a different one on the projector the
 * moment either copy changed.
 */
export const DEFAULT_PRIZE_COUNTS: PrizeCounts = {
  consolation_count: 0,
  consolation_group_count: 0,
  fifth_count: 1,
  fourth_count: 1,
  third_count: 1,
  second_count: 1,
  first_count: 1,
}

// This array assigns team ranks, so 'fourth'/'fifth' must sit between 'third'
// and 'consolation': adding a 4th place pushes every consolation rank down one.
const CANONICAL_KINDS: PrizeKind[] = [
  'first', 'second', 'third', 'fourth', 'fifth', 'consolation', 'consolation_group',
]

export const SLIDE_LABELS: Record<AwardSlideKind, { label: string; emoji: string; accent: string }> = {
  main:              { label: 'Main slide',         emoji: '🎬', accent: '#fca5a5' },
  intro:             { label: 'Animated opener',    emoji: '✨', accent: '#fde68a' },
  holding:           { label: 'Holding slide',      emoji: '⏳', accent: '#fcd34d' },
  lineup:            { label: 'Team lineup',        emoji: '👥', accent: '#a5f3fc' },
  scoreboard:        { label: 'Full scoreboard',    emoji: '📊', accent: '#86efac' },
  closing:           { label: 'Closing slide',       emoji: '🎬', accent: '#fca5a5' },
  first:             { label: 'Grand Champion',     emoji: '🏆', accent: '#fde047' },
  second:            { label: 'First Runner-Up',    emoji: '🥈', accent: '#e5e7eb' },
  third:             { label: 'Second Runner-Up',   emoji: '🥉', accent: '#f59e0b' },
  fourth:            { label: 'Fourth Place',        emoji: '🎗', accent: '#93c5fd' },
  fifth:             { label: 'Fifth Place',         emoji: '🎗', accent: '#c7d2fe' },
  consolation:       { label: 'Honorable Mention',  emoji: '🎖', accent: '#c4b5fd' },
  consolation_group: { label: 'Honorable Trio',     emoji: '🎖', accent: '#c4b5fd' },
}

/** The five kinds rendered by the place-slide design (photo + group number +
 *  total + slogan). `consolation` is a prize kind but NOT a place. */
export function isPlaceKind(kind: string): kind is PlaceKind {
  return (
    kind === 'first' || kind === 'second' || kind === 'third' ||
    kind === 'fourth' || kind === 'fifth'
  )
}

export type PlaceKind = 'first' | 'second' | 'third' | 'fourth' | 'fifth'

export function isPrizeKind(kind: string): kind is PrizeKind {
  return (
    kind === 'consolation' ||
    kind === 'consolation_group' ||
    kind === 'fifth' ||
    kind === 'fourth' ||
    kind === 'third' ||
    kind === 'second' ||
    kind === 'first'
  )
}

/** Count how many slides of each prize kind appear in slide_order. */
export function countsFromOrder(order: AwardSlideId[]): PrizeCounts {
  const c: PrizeCounts = {
    consolation_count: 0,
    consolation_group_count: 0,
    fifth_count: 0,
    fourth_count: 0,
    third_count: 0,
    second_count: 0,
    first_count: 0,
  }
  for (const id of order) {
    if (isSingletonKind(id)) continue
    const idx = id.lastIndexOf(':')
    if (idx < 0) continue
    const kind = id.slice(0, idx)
    if (kind === 'consolation') c.consolation_count++
    else if (kind === 'consolation_group') c.consolation_group_count++
    else if (kind === 'fifth') c.fifth_count = (c.fifth_count ?? 0) + 1
    else if (kind === 'fourth') c.fourth_count = (c.fourth_count ?? 0) + 1
    else if (kind === 'third') c.third_count++
    else if (kind === 'second') c.second_count++
    else if (kind === 'first') c.first_count++
  }
  return c
}

/** Default factory sequence: main, holding, …consolations…, 3rd→2nd→1st, scoreboard, closing. */
export function defaultSlideOrder(counts: PrizeCounts): AwardSlideId[] {
  const out: AwardSlideId[] = ['main', 'holding']
  for (let i = 0; i < counts.consolation_count; i++) out.push(`consolation:${i}`)
  for (let i = 0; i < counts.consolation_group_count; i++) out.push(`consolation_group:${i}`)
  for (let i = 0; i < (counts.fifth_count ?? 0); i++) out.push(`fifth:${i}`)
  for (let i = 0; i < (counts.fourth_count ?? 0); i++) out.push(`fourth:${i}`)
  for (let i = 0; i < counts.third_count; i++) out.push(`third:${i}`)
  for (let i = 0; i < counts.second_count; i++) out.push(`second:${i}`)
  for (let i = 0; i < counts.first_count; i++) out.push(`first:${i}`)
  out.push('scoreboard', 'closing')
  return out
}

/**
 * Drop unknown / malformed ids; if nothing remains, seed with default order
 * derived from the provided counts. Safe to call with user-supplied JSON.
 *
 * Also auto-injects newer singletons (`scoreboard`, `closing`) into legacy
 * saved orders that pre-date them, so existing ceremonies pick up the new
 * end-of-show flow without requiring an admin re-save.
 */
export function normalizeSlideOrder(
  saved: unknown,
  counts: PrizeCounts,
  /** False once the editor has saved with removable end slides (slide_text.v). */
  injectEndSlides = true,
): AwardSlideId[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaultSlideOrder(counts)
  const seen = new Set<string>()
  const out: AwardSlideId[] = []
  for (const raw of saved) {
    if (typeof raw !== 'string') continue
    if (seen.has(raw)) continue
    if (isSingletonKind(raw)) {
      out.push(raw); seen.add(raw); continue
    }
    const idx = raw.lastIndexOf(':')
    if (idx < 0) continue
    const kind = raw.slice(0, idx)
    const suffix = raw.slice(idx + 1)
    if (!isPrizeKind(kind)) continue
    if (!/^\d+$/.test(suffix)) continue
    out.push(raw); seen.add(raw)
  }
  if (!out.length) return defaultSlideOrder(counts)

  if (!injectEndSlides) return out
  if (!seen.has('scoreboard')) {
    let lastFirst = -1
    for (let i = 0; i < out.length; i++) {
      const id = out[i]
      if (!isSingletonKind(id) && id.startsWith('first:')) lastFirst = i
    }
    if (lastFirst >= 0) out.splice(lastFirst + 1, 0, 'scoreboard')
    else out.push('scoreboard')
    seen.add('scoreboard')
  }
  if (!seen.has('closing')) {
    out.push('closing')
    seen.add('closing')
  }
  return out
}

/** Next unused numeric suffix for a given prize kind. */
function nextPrizeId(order: AwardSlideId[], kind: PrizeKind): AwardSlideId {
  let max = -1
  for (const id of order) {
    if (isSingletonKind(id)) continue
    const idx = id.lastIndexOf(':')
    if (idx < 0) continue
    const k = id.slice(0, idx)
    const s = id.slice(idx + 1)
    if (k === kind) {
      const n = parseInt(s, 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `${kind}:${max + 1}`
}

/** Where each singleton belongs in a show, opener to finale. */
const SINGLETON_RANK: Record<SingletonKind, number> = {
  main: 0, intro: 1, holding: 2, lineup: 3, scoreboard: 90, closing: 99,
}
const singletonRank = (id: AwardSlideId) => (isSingletonKind(id) ? SINGLETON_RANK[id] : 50)

/**
 * Add a slide in its natural place: openers (main → intro → holding → lineup)
 * after the existing openers, the scoreboard before the closing slide, the
 * closing slide last, and prizes just before the end slides.
 */
export function addSlide(order: AwardSlideId[], kind: AwardSlideKind): AwardSlideId[] {
  const id: AwardSlideId = isSingletonKind(kind) ? kind : nextPrizeId(order, kind)
  if (order.includes(id)) return order
  const r = singletonRank(id)
  let at = order.length
  for (let i = 0; i < order.length; i++) {
    if (singletonRank(order[i]) > r) { at = i; break }
  }
  return [...order.slice(0, at), id, ...order.slice(at)]
}

/** Reset to the default order, keeping any optional openers (intro, lineup) the show has. */
export function resetSlideOrder(order: AwardSlideId[]): AwardSlideId[] {
  let out = defaultSlideOrder(countsFromOrder(order))
  for (const extra of ['intro', 'lineup'] as const) {
    if (order.includes(extra)) out = addSlide(out, extra)
  }
  return out
}

/** Remove a slide by id. */
export function removeSlide(order: AwardSlideId[], id: AwardSlideId): AwardSlideId[] {
  return order.filter(x => x !== id)
}

/**
 * Build slide descriptors. Rank-in-kind is display-order-based; team rank is
 * canonical (first tier takes ranks 1..first_count, etc.).
 *
 * `consolation` slides take 1 rank each, in display order.
 * `consolation_group` slides take CONSOLATION_GROUP_SIZE ranks each, but are
 * filled in REVERSE display order so the first-displayed group reveals the
 * worst ranks (ceremonial worst→best build).
 */
export function buildAwardSlides(order: AwardSlideId[]): AwardSlideDescriptor[] {
  const byKind: Record<PrizeKind, AwardSlideId[]> = {
    first: [], second: [], third: [], fourth: [], fifth: [],
    consolation: [], consolation_group: [],
  }
  for (const id of order) {
    if (isSingletonKind(id)) continue
    const idx = id.lastIndexOf(':')
    if (idx < 0) continue
    const kind = id.slice(0, idx)
    if (isPrizeKind(kind)) byKind[kind].push(id)
  }

  const teamRanksById: Record<string, number[]> = {}
  let rank = 1
  for (const kind of CANONICAL_KINDS) {
    const slidesOfKind = byKind[kind]
    if (kind === 'consolation_group') {
      const total = slidesOfKind.length * CONSOLATION_GROUP_SIZE
      // First-displayed group gets the worst (highest-numbered) ranks.
      let highest = rank + total - 1
      for (const id of slidesOfKind) {
        const ranks: number[] = []
        for (let k = CONSOLATION_GROUP_SIZE - 1; k >= 0; k--) {
          ranks.push(highest - k)
        }
        teamRanksById[id] = ranks
        highest -= CONSOLATION_GROUP_SIZE
      }
      rank += total
    } else {
      for (const id of slidesOfKind) {
        teamRanksById[id] = [rank++]
      }
    }
  }

  return order.map(id => {
    if (isSingletonKind(id)) return { id, kind: id, rank: null, teamRanks: null }
    const idx = id.lastIndexOf(':')
    const kind = id.slice(0, idx) as PrizeKind
    const posInKind = byKind[kind].indexOf(id)
    return {
      id,
      kind,
      rank: posInKind + 1,
      teamRanks: teamRanksById[id] ?? null,
    }
  })
}

/**
 * The number a place slide shows in its GROUP NUMBER box.
 *
 * Teams here are named "Group 8" / "Team 12A", so the first run of digits is
 * the group. A name with no digits ("Falcons") is returned as-is and the slide
 * renders it as text — a blank box mid-ceremony would be worse.
 */
export function groupLabel(name: string): string {
  const m = name.match(/\d+/)
  return m ? m[0] : name.trim()
}

/** HSBC red, used when a board has picked no colour of its own. */
export const HSBC_RED = '#DB0011'

/** The ceremony slides' background (holding, lineup, scoreboard…). */
export const CEREMONY_BACKGROUND = 'radial-gradient(ellipse at 50% 35%, #3b1f66 0%, #180a33 55%, #06020f 100%)'
/** Its main colour, for the colour picker when no colour is set. */
export const CEREMONY_COLOR = '#3b1f66'

/**
 * The main slide's two-stop gradient, from a single picked colour.
 *
 * The value reaches here from the database and is interpolated into a CSS
 * string, so it is validated as #rrggbb rather than trusted - a stored value
 * that is not a plain hex colour falls back to the HSBC red instead of being
 * pasted into the stylesheet. The darker stop comes from color-mix, so there
 * is no shade-arithmetic to get wrong.
 */
export function mainBackground(hex: string | null | undefined): string {
  // No colour picked: the ceremony's own purple, same as the other slides.
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return CEREMONY_BACKGROUND
  const c = hex
  return `linear-gradient(135deg, ${c} 0%, color-mix(in srgb, ${c}, #000 35%) 100%)`
}

// ── Editable slide text ───────────────────────────────────────────────────
export type SlideTextBlock = {
  pretitle?: string
  title?: string
  subtitle?: string
  tagline?: string
  hint?: string
  bg?: string
}
export type SlideText = {
  /** Set by the editor; see normalizeSlideOrder's injectEndSlides. */
  v?: number
  /** Main + closing logo: "default" emblem, "none", or an image URL. */
  logo?: string
  /** Backdrop behind the logo only (CSS colour); white when unset. */
  logo_bg?: string
  intro?: SlideTextBlock
  holding?: SlideTextBlock
  lineup?: SlideTextBlock
  scoreboard?: SlideTextBlock
  closing?: SlideTextBlock
}

/** Built-in text for each editable slide — what an empty field falls back to. */
export const SLIDE_TEXT_DEFAULTS = {
  intro: { pretitle: 'Ladies and Gentlemen', title: '🏆 AWARD CEREMONY', subtitle: 'Presenting your champions…' },
  holding: { pretitle: 'Ladies and Gentlemen', title: 'Presenting Awards', hint: '▶ Continue for the winners' },
  lineup: { pretitle: "Tonight's Contenders", title: '👥 MEET THE TEAMS' },
  scoreboard: { pretitle: 'Final Standings', title: '🏆 FULL SCOREBOARD' },
  closing: { pretitle: 'Thank You', subtitle: 'Thank you to all our teams', tagline: 'CONGRATULATIONS · SEE YOU NEXT TIME' },
} as const

/** Read stored slide_text defensively — it arrives as user-edited JSON. */
export function readSlideText(raw: unknown): SlideText {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SlideText) : {}
}

/** A field's stored text, or its default when blank. */
export function slideTextValue(
  text: SlideText,
  slide: keyof typeof SLIDE_TEXT_DEFAULTS,
  field: keyof SlideTextBlock,
  fallback?: string,
): string {
  const v = text[slide]?.[field]
  if (typeof v === 'string' && v.trim()) return v
  const d = (SLIDE_TEXT_DEFAULTS[slide] as SlideTextBlock)[field]
  return d ?? fallback ?? ''
}
