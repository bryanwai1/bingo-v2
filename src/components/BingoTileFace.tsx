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
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
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
      {ICONS[resolveIconKey(category)]}
    </svg>
  )
}

// `size` matches the two grid densities in use: 'md' for the roomy boards
// (BingoDashHome / Sample, gap-2) and 'sm' for the tighter one (BingoDashJoin,
// gap-1.5).
export function TileFace({
  task, display, size = 'md',
}: {
  task: { title: string; color: string }
  display: TileDisplay
  size?: 'sm' | 'md'
}) {
  if (display === 'icon') {
    return (
      <div
        className="relative z-0 flex items-center justify-center w-full h-full a-text"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
      >
        <CategoryIcon category={task.color} className={size === 'sm' ? 'w-[50%] h-[50%]' : 'w-[52%] h-[52%]'} />
      </div>
    )
  }

  const category = (task.color || '').trim()
  const short = shortenTitle(task.title, size === 'sm' ? 18 : 20)

  return (
    <div
      className="relative z-0 flex flex-col items-center justify-center text-center px-0.5 w-full h-full a-text"
      style={{ containerType: 'inline-size', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
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
          style={{ fontSize: fitFontSize(short, 0.52, 13) }}
        >
          {short}
        </p>
      )}
    </div>
  )
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
