import { useEffect, useRef, useState } from 'react'
import { useCoopSession } from '../hooks/useCoopSession'
import { getPuzzle } from '../lib/coopGames/registry'
import { lobbyNeeds, lobbyMessage, playLabel, justCompleted, currentState, MAX_OBSERVERS, type CoopRole, type CoopStatus } from '../lib/coopGames/session'

// Play panel (card page) and, once opened, the lobby and the game in place of
// the instruction cards. Look follows the live card page (DESIGN-004).

const PANEL = { background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }
const GAME_PANEL = { background: 'rgba(0,0,0,0.30)', border: '2px solid rgba(255,255,255,0.15)' }

const RoleChip = ({ role }: { role: CoopRole }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-black ${role === 'player' ? 'bg-amber-300/20 text-amber-300' : 'bg-blue-300/20 text-blue-300'}`}>
    {role === 'player' ? '🎮 Player' : '👁 Observer'}
  </span>
)

const Banner = ({ tone, children }: { tone: 'err' | 'info' | 'ok'; children: React.ReactNode }) => (
  <div role={tone === 'err' ? 'alert' : 'status'}
    className={`rounded-2xl p-3 mb-3 text-sm font-bold ${tone === 'err' ? 'bg-red-400/10 border-2 border-red-300/40 text-red-300'
      : tone === 'ok' ? 'bg-emerald-400/10 border-2 border-emerald-300/40 text-emerald-300' : 'bg-blue-400/10 border-2 border-blue-300/40 text-blue-300'}`}>
    {children}
  </div>
)

interface Props {
  memberId: string | null
  scanId: string
  gameKey: string
  /** Role from localStorage; the server re-reads it from the member row. */
  role: CoopRole
  color: string
  /** The server has just completed the card: refresh the page's copy of the scan. */
  onSolved: () => void
  onOpenChange: (open: boolean) => void
}

export function CoopPlay({ memberId, scanId, gameKey, role: storedRole, color, onSolved, onOpenChange }: Props) {
  const c = useCoopSession(memberId, scanId)
  const [open, setOpen] = useState(false)
  const prevStatus = useRef<CoopStatus | undefined>(undefined)
  const puzzle = getPuzzle(gameKey)
  const snap = c.snap
  const me = snap?.members.find(m => m.member_id === memberId)
  const role: CoopRole = me?.role ?? storedRole

  useEffect(() => { onOpenChange(open && !!snap) }, [open, snap, onOpenChange])

  // coop_move already credited the card on the server; just refresh the page's copy,
  // once, on the change playing -> completed (never heal: Undo completion must stick).
  useEffect(() => {
    if (snap && justCompleted(prevStatus.current, snap)) onSolved()
    prevStatus.current = snap?.status
  }, [snap, onSolved])

  const play = async () => { if (await c.open(gameKey)) setOpen(true) }
  const refusal = c.error === 'PLAYER_TAKEN' ? (gameKey === 'icon-matching' ? 'Your team already has 2 players.' : 'Your team already has a player.')
    : c.error === 'OBSERVERS_FULL' ? 'The lobby is full.'
    : c.error === 'NOT_IN_SESSION' ? 'Another player took your seat. You can join again.'
    : c.error === 'NOT_ON_TEAM' ? 'This game belongs to another team.' : null

  const btn = 'w-full min-h-[60px] rounded-2xl font-black uppercase tracking-wide text-white active:scale-95 transition-transform shadow-[0_4px_0_rgba(0,0,0,0.35)]'

  if (!memberId) return null

  if (!open || !snap) {
    return (
      <div className="rounded-2xl p-4 mb-6" style={PANEL}>
        <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Play in the app</p>
        <p className="text-gray-300 text-sm mb-3">Play this challenge together with your team. The player acts, observers watch.</p>
        <div className="mb-3"><RoleChip role={storedRole} /></div>
        {c.peekState === 'error' && (
          <Banner tone="err">Could not check for a game.
            <button type="button" onClick={() => void c.retryPeek()} className="ml-2 min-h-[44px] underline">Try again</button>
          </Banner>
        )}
        {refusal && <Banner tone="err">{c.error === 'NOT_IN_SESSION' ? '' : 'You have not been added to the lobby. '}{refusal}</Banner>}
        <button type="button" onClick={() => void play()} disabled={c.busy || c.peekState === 'loading'}
          className={btn} style={{ background: color }}>
          {c.peekState === 'loading' ? 'Checking...' : playLabel(c.peeked)}
        </button>
      </div>
    )
  }

  const close = () => { setOpen(false); void c.retryPeek() }
  const needs = lobbyNeeds(snap.members, snap.game_key)
  const canAct = role === 'player' && snap.status === 'playing'

  return (
    <div className="rounded-3xl p-4 mb-6" style={GAME_PANEL}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-black uppercase tracking-widest text-gray-300">
          {snap.status === 'lobby' ? 'Lobby' : snap.status === 'playing' ? 'In play' : 'Completed'}
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-xs font-black ${c.live ? 'text-emerald-300' : 'text-red-300'}`}>{c.live ? '● Live' : '● Offline'}</span>
          <RoleChip role={role} />
        </span>
      </div>
      {!c.live && <Banner tone="err">Connection lost. Your game is saved and will catch up.</Banner>}
      {(c.error === 'PICK_LOCKED' || c.error === 'PICK_TAKEN') && <Banner tone="info">{c.error === 'PICK_TAKEN' ? 'The other player already picked that card.' : 'That pick was not accepted. Nothing changed.'}</Banner>}
      {c.error === 'NOT_PLAYER' && <Banner tone="info">Only the player can move. Nothing changed.</Banner>}

      {snap.status === 'lobby' ? (
        <>
          {!needs.canStart && (
            <Banner tone="info">
              Cannot start yet. {lobbyMessage(snap.members, snap.game_key)}
            </Banner>
          )}
          <ul className="text-sm text-gray-300 mb-3 space-y-1">
            <li>{needs.players === needs.need ? '✓' : '○'} Player{needs.need > 1 ? 's' : ''} {needs.players} of {needs.need} needed</li>
            <li>{needs.observers >= 1 && needs.observers <= MAX_OBSERVERS ? '✓' : '○'} Observers {needs.observers} (at least 1, up to {MAX_OBSERVERS})</li>
          </ul>
          {needs.need > 1 && needs.players < needs.need && (
            <p className="text-xs text-gray-400 mb-3">Both players must be on the same team. If the second player cannot join the team, ask the organiser to allow 2 players per team in this section.</p>
          )}
          <ul className="space-y-2 mb-4" aria-label="Who is in the lobby">
            {snap.members.map(m => (
              <li key={m.member_id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 min-h-[44px] bg-white/5">
                <span className="font-bold text-white truncate">{m.name}{m.member_id === memberId ? ' (you)' : ''}</span>
                <RoleChip role={m.role} />
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { if (needs.canStart) void c.start() }} aria-disabled={!needs.canStart || c.busy}
            className={`${btn} ${needs.canStart ? '' : 'opacity-50 border-2 border-dashed border-white/40'}`}
            style={{ background: needs.canStart ? color : 'transparent' }}>
            {c.busy ? 'Starting...' : needs.canStart ? 'Start game' : '🔒 Start game'}
          </button>
          <button type="button" onClick={() => { void c.leave(); setOpen(false) }}
            className="w-full min-h-[44px] mt-2 text-sm font-bold text-gray-300 underline">Leave lobby</button>
        </>
      ) : (
        <>
          {snap.status === 'completed' && (
            <Banner tone="ok">Solved. Locked: this game is completed. Your team was credited once.</Banner>
          )}
          <div className={c.live ? '' : 'opacity-50'}>
            <puzzle.View state={currentState(snap, puzzle)} canAct={canAct && c.live && !c.busy} isPlayer={role === 'player'} mySlot={me?.slot}
              dispatch={a => { void c.move(puzzle, a, role) }} />
          </div>
          <button type="button" onClick={close} className="w-full min-h-[44px] mt-4 text-sm font-bold text-gray-300 underline">
            Back to the card
          </button>
        </>
      )}
    </div>
  )
}
