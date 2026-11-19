import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MyQrButton } from './MyQrButton'
import { barTabs, BAR_SPACER_PX } from '../lib/boardBar'
import type { PlayerTheme } from '../lib/playerThemes'

// Phone bottom bar for the player board (DESIGN-009): Invite | Board (logo, centre) | Scores.
// Phone only (md:hidden). The bar owns the observer-QR overlay; the header buttons it replaces
// are hidden on phone by the board screens. z-40: under the BINGO popup (z-50), help chat and the QR.

const TOKENS = {
  default: {
    text: '#d1d5db', accent: '#c084fc', glow: 'rgba(147,51,234,.55)',
    bar: 'rgba(17,20,30,.72)', border: 'rgba(255,255,255,.14)', gap: '#030712',
  },
  grab: {
    text: '#f3f4f6', accent: '#7CF0A8', glow: 'rgba(0,177,79,.55)',
    bar: 'rgba(4,28,16,.78)', border: 'rgba(124,240,168,.28)', gap: '#0b3d22',
  },
} as const

const Icon = ({ d, extra, head = false }: { d: string; extra?: string; head?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />{extra && <path d={extra} />}{head && <circle cx="9" cy="7" r="4" />}
  </svg>
)

const tabCls = 'flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] h-full text-[11px] font-bold transition-transform duration-150 motion-reduce:transition-none active:scale-110 focus-visible:outline-[3px] focus-visible:outline-yellow-300 rounded-2xl'

export function BoardBottomBar({ theme, inviteUrl, teamName, scoreboardPath, onInvite, onScores }: {
  theme: PlayerTheme
  /** Observer link of this team. Empty/null hides the Invite tab. */
  inviteUrl: string | null
  teamName?: string
  scoreboardPath: string
  /** The demo board owns its QR and scoreboard, so it takes over these two taps. */
  onInvite?: () => void
  onScores?: () => void
}) {
  const t = TOKENS[theme]
  const navigate = useNavigate()
  const [qrOpen, setQrOpen] = useState(false)
  const tabs = barTabs(!!inviteUrl)

  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  const board = (
    <button key="board" type="button" onClick={toTop} aria-label="Bingo board" aria-current="page"
      className="flex items-center justify-center h-full focus-visible:outline-[3px] focus-visible:outline-yellow-300 rounded-full">
      <span className="block w-14 h-14 rounded-full overflow-hidden -translate-y-[10px] transition-transform duration-150 motion-reduce:transition-none active:scale-110"
        style={{ boxShadow: `0 0 0 4px ${t.gap}, 0 0 0 6px ${t.accent}, 0 6px 18px ${t.glow}` }}>
        <img src="/icon-192.png" alt="" width={56} height={56} className="w-full h-full object-cover" draggable={false} />
      </span>
    </button>
  )
  const invite = (
    <button key="invite" type="button" onClick={() => (onInvite ? onInvite() : setQrOpen(true))} aria-label="Invite teammate" className={tabCls} style={{ color: t.text }}>
      <Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" extra="M19 8v6M22 11h-6" head />
      <span>Invite</span>
    </button>
  )
  const scores = (
    <button key="scores" type="button" onClick={() => (onScores ? onScores() : navigate(scoreboardPath))} aria-label="Scoreboard" className={tabCls} style={{ color: t.text }}>
      <Icon d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      <span>Scores</span>
    </button>
  )
  const byTab = { invite, board, scores }

  return (
    <>
      <nav aria-label="Board navigation"
        className="md:hidden fixed left-3 right-3 mx-auto max-w-[460px] h-16 z-40 rounded-[22px] backdrop-blur-xl border"
        style={{ bottom: 'calc(8px + env(safe-area-inset-bottom))', background: t.bar, borderColor: t.border }}>
        <div className={`grid h-full items-center ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {tabs.map(k => byTab[k])}
        </div>
      </nav>
      {inviteUrl && !onInvite && (
        <MyQrButton badge="Observer" hideTrigger open={qrOpen} onOpenChange={setQrOpen} value={inviteUrl} teamName={teamName}
          hint="Teammate scans this, types their name, and joins your team as an observer" />
      )}
    </>
  )
}

/** Keeps the end of the board page clear of the bar (phone only). */
export const BoardBarSpacer = () => (
  <div className="md:hidden" aria-hidden="true" style={{ height: `calc(${BAR_SPACER_PX}px + env(safe-area-inset-bottom))` }} />
)
