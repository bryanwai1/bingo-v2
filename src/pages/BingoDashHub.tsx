import { Link } from 'react-router-dom'

// The front door. One game now, so this is a launcher rather than a game
// selector: player board, admin, slides, sample. Kept deliberately quiet —
// it is often the first thing a room of participants sees on a projector.

type Tile = {
  to: string
  emoji: string
  title: string
  sub: string
  primary?: boolean
  external?: boolean
}

const TILES: Tile[] = [
  { to: '/bingo-dash',            emoji: '🎯', title: 'Player Board',  sub: 'Join a team and start playing', primary: true },
  { to: '/bingo-dash/admin',      emoji: '⚙️', title: 'Admin Panel',   sub: 'Boards, cards, teams, scoring' },
  { to: '/bingo-dash/projector',  emoji: '📺', title: 'Projector',     sub: 'Live scoreboard for the room' },
  { to: '/bingo-dash/sample',     emoji: '🎬', title: 'Try a Demo',    sub: 'Play a sandbox round — nothing is saved' },
  { to: '/bingo-dash/slides',     emoji: '🎬', title: 'Event Slides',  sub: 'Briefing, groupings, awards' },
  { to: '/bingo-dash/crew',       emoji: '👥', title: 'Crew Passes',   sub: 'Bring co-trainers into your event' },
  { to: '/bingo-dash/events',     emoji: '🤝', title: 'Shared Events', sub: 'Run a day with another trainer' },
]

export function BingoDashHub() {
  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Ambient motion — slow enough to sit behind a live room without
          distracting from a facilitator talking over it. */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-teal-600/20 blur-3xl animate-pulse-slow" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 rounded-full bg-fuchsia-600/15 blur-3xl animate-pulse-slower" />
        <div className="absolute -bottom-40 left-1/4 w-96 h-96 rounded-full bg-sky-600/15 blur-3xl animate-pulse-slow" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-5 py-16">
        <header className="text-center mb-14 animate-rise">
          <div className="text-6xl mb-4 animate-float-soft">🎯</div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight bg-gradient-to-r from-teal-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">
            BINGO DASH
          </h1>
          <p className="text-white/55 mt-3 text-lg">Complete challenges · Scan tiles · Win</p>
        </header>

        <div className="grid sm:grid-cols-2 gap-4">
          {TILES.map((t, i) => (
            <Link
              key={t.to}
              to={t.to}
              style={{ animationDelay: `${i * 70}ms` }}
              className={`group animate-rise rounded-3xl border-2 p-5 transition-all duration-200
                hover:-translate-y-1 active:scale-[0.98]
                ${t.primary
                  ? 'border-teal-400/60 bg-teal-500/15 hover:border-teal-300 hover:bg-teal-500/25'
                  : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'}`}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
                  {t.emoji}
                </span>
                <div className="min-w-0">
                  <p className="font-black text-lg leading-tight">{t.title}</p>
                  <p className="text-white/45 text-sm leading-snug">{t.sub}</p>
                </div>
                <span className="ml-auto text-white/20 group-hover:text-white/50 transition-colors">→</span>
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-16 text-center animate-rise" style={{ animationDelay: '500ms' }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03]">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Powered by</span>
            <span className="text-sm font-black bg-gradient-to-r from-teal-300 to-fuchsia-300 bg-clip-text text-transparent">
              Pixels and Purpose Enterprise
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
