import type { ReactNode } from 'react'
import { resolveIconKey, shortenTitle, type TileDisplay } from '../lib/bingoTileDisplay'

// ── Bingo tile face ───────────────────────────────────────────────────────────
// What a player sees inside a 5×5 tile. Two modes, chosen per board in the admin
// (bingo_sections.tile_display):
//
//   'icon'  — a single crisp category icon. Nothing to squint at.
//   'words' — the CATEGORY in readable caps plus a shortened title. Deliberately
//             fewer words than the raw title: at 5 columns on a phone a tile is
//             ~70px wide, and a full title crammed into 3 lines of 9px is what
//             players complained they could not read.
//
// Shared by the player boards (BingoDashHome / BingoDashJoin), the Sample demo
// and the admin preview so they can never drift apart.

// Generated single-colour vector icons. They render white via `currentColor`, so
// they sit cleanly on ANY tile background colour (which AI raster icons can't
// guarantee) and stay razor-sharp at tiny sizes.
const ICONS: Record<string, ReactNode> = {
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  cpu: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.7 10.2 18 9 18 8a6 6 0 0 0-12 0c0 1 .2 2.2 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
  sparkles: <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />,
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  // Card-specific icons (bingo_tasks.tile_icon), used by the Grab Game Day cards.
  cube: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></>,
  puzzle: <><path d="M10 3a2 2 0 0 1 4 0v1h4a1 1 0 0 1 1 1v4h-1a2 2 0 0 0 0 4h1v4a1 1 0 0 1-1 1h-4v-1a2 2 0 0 0-4 0v1H6a1 1 0 0 1-1-1v-4h1a2 2 0 0 0 0-4H5V5a1 1 0 0 1 1-1h4V3Z"/></>,
  math: <><path d="M6 4v6M3 7h6"/><path d="M15 7h6"/><path d="M15.5 15.5l5 5M20.5 15.5l-5 5"/><path d="M3 18h6"/></>,
  spot: <><circle cx="10.5" cy="10.5" r="7"/><path d="m21 21-5.2-5.2"/><path d="M8 10.5h5M10.5 8v5"/></>,
  flip: <><rect x="3" y="4" width="7" height="9" rx="1.5"/><rect x="14" y="11" width="7" height="9" rx="1.5"/><path d="M13 5h4a3 3 0 0 1 3 3v1M11 19H7a3 3 0 0 1-3-3v-1"/></>,
  beans: <><ellipse cx="8" cy="9" rx="4.5" ry="3" transform="rotate(-35 8 9)"/><ellipse cx="16" cy="15.5" rx="4.5" ry="3" transform="rotate(-35 16 15.5)"/></>,
  tictactoe: <><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="M4.5 4.5l3 3M7.5 4.5l-3 3"/><circle cx="18" cy="18" r="1.6"/></>,
  jenga: <><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="4.5" y="9.5" width="18" height="5" rx="1" transform="translate(-1.5 0)"/><rect x="3" y="16" width="18" height="5" rx="1"/><path d="M9 3v5M15 3v5M9 16v5M15 16v5"/></>,
  chair: <><path d="M7 3h10v9H7z"/><path d="M5 12h14v3H5z"/><path d="M7 15v6M17 15v6"/></>,
  bottle: <><path d="M10 2h4v3l1.8 3.2A4 4 0 0 1 16.3 10v10a2 2 0 0 1-2 2H9.7a2 2 0 0 1-2-2V10a4 4 0 0 1 .5-1.8L10 5V2Z"/><path d="M7.7 13h8.6"/></>,
  ring: <><ellipse cx="12" cy="9" rx="8" ry="3.5"/><path d="M10 13v8M14 13v8M8.5 21h7"/></>,
  parcel: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/></>,
  cup: <><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M11 3v2M14 3v2"/></>,
  shoe: <><path d="M3 15c0-2.5 2-3 4-3l3-4 2 1.5 3 1.5c3 .5 6 1 6 4.5v1H3v-1.5Z"/><path d="M3 19h18"/></>,
  caterpillar: <><path d="M3 18a9 9 0 0 1 18 0"/><circle cx="6" cy="19" r="1.7"/><circle cx="10.5" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/><circle cx="19.5" cy="19" r="1.7"/></>,
  kart: <><path d="M3 15l2-5h8l3 3h4v2H3Z"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M9 10V7"/></>,
  knot: <><rect x="2.5" y="8" width="12" height="8" rx="4"/><rect x="9.5" y="8" width="12" height="8" rx="4"/></>,
  quiz: <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  hand: <><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V3.5a1.5 1.5 0 0 1 3 0V10M14 10V5a1.5 1.5 0 0 1 3 0v7M17 8.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.5 15.5a1.6 1.6 0 0 1 2.4-2.1L8 15"/></>,
  cards: <><rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/><path d="M7 12h4M7 16h4"/></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15.5v2"/></>,
}

export function CategoryIcon({ category, className, iconKey }: { category: string; className?: string; iconKey?: string | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[iconKey && ICONS[iconKey] ? iconKey : resolveIconKey(category)]}
    </svg>
  )
}

// `size` matches the two grid densities in use: 'md' for the roomy boards
// (BingoDashHome / Sample, gap-2) and 'sm' for the tighter one (BingoDashJoin,
// gap-1.5).
export function TileFace({
  task, display, size = 'md', autoContrast = false,
}: {
  task: { title: string; color: string; category?: string | null; hex_code?: string | null; tile_icon?: string | null; category_icon?: string | null }
  display: TileDisplay
  size?: 'sm' | 'md'
  /** Pick white or near-black text from the tile colour. The default text
   *  colour follows the admin theme and can vanish on a coloured tile. */
  autoContrast?: boolean
}) {
  const dark = autoContrast && !!task.hex_code && isLightColor(task.hex_code)
  const textColor = autoContrast ? (dark ? '#111827' : '#ffffff') : undefined
  const shadow = dark ? '0 1px 1px rgba(255,255,255,0.35)' : '0 1px 3px rgba(0,0,0,0.65)'
  // The icon and caption follow the CATEGORY. Older cards (and copies from
  // another board) carry a colour name such as "Act 3 · The Mission" that
  // used to drive this — which is why two cards in one category could show
  // different icons. The colour name is only a fallback for uncategorised
  // cards.
  const category = ((task.category || '').trim() || task.color || '').trim()
  if (display === 'icon') {
    return (
      <div
        className="relative z-0 flex items-center justify-center w-full h-full text-white"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))', ...(dark ? { color: textColor } : {}) }}
      >
        <CategoryIcon category={category} iconKey={task.tile_icon ?? task.category_icon} className={size === 'sm' ? 'w-[50%] h-[50%]' : 'w-[52%] h-[52%]'} />
      </div>
    )
  }

  const short = shortenTitle(task.title, size === 'sm' ? 18 : 20)

  return (
    <div
      className="relative z-0 flex flex-col items-center justify-center text-center px-0.5 w-full h-full a-text"
      style={{ containerType: 'inline-size', textShadow: autoContrast ? shadow : '0 1px 2px rgba(0,0,0,0.5)', color: textColor }}
    >
      {category && (
        <p
          className="font-black uppercase tracking-tight leading-[1.05] line-clamp-2 break-words w-full"
          style={{ fontSize: fitFontSize(category, 0.62, 17) }}
        >
          {category}
        </p>
      )}
      {short && (
        <p
          className="a-text font-bold leading-[1.15] line-clamp-2 break-words w-full mt-0.5"
          style={{ fontSize: fitFontSize(short, 0.52, 13), color: textColor }}
        >
          {short}
        </p>
      )}
    </div>
  )
}

// Perceived brightness of a #rrggbb colour (0-255 weighted), true when dark
// text reads better on it than white.
function isLightColor(hex: string): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

// Text has to fit a tile that is ~64px wide on a phone and wider on a laptop, so
// size it in container units (1cqw = 1% of the tile) instead of pixels — one
// formula, right on every screen. Lines break between words, so the longest word
// is what decides whether anything clips.
//   `advance` — average glyph width as a fraction of the font size for that
//               weight/case; `maxCq` — the size we'd use if the text were short.
function fitFontSize(text: string, advance: number, maxCq: number): string {
  const longestWord = text.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 1)
  const fit = 92 / (longestWord * advance) // 92% of the tile width, the rest is padding
  return `${Math.max(maxCq * 0.62, Math.min(maxCq, fit))}cqw`
}
