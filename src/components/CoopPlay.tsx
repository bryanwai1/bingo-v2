import { useCallback, useEffect, useRef, useState } from 'react'
import { useCoopSession } from '../hooks/useCoopSession'
import { getPuzzle } from '../lib/coopGames/registry'
import { savedPlayerName } from '../lib/coopGames/registerMember'
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
  memberLoading?: boolean
  memberError?: boolean
  scanId: string
  gameKey: string
  /** Role from localStorage; the server re-reads it from the member row. */
  role: CoopRole
  color: string
  /** The server has just completed the card: refresh the page's copy of the scan. */
  onSolved: () => void
  /** Register this browser's person on the team; resolves to an error message, or null on success. */
  onJoinPlayer: (name: string) => Promise<string | null>
  onOpenChange: (open: boolean) => void
}

export function CoopPlay({ memberId, memberLoading = false, memberError = false, scanId, gameKey, role: storedRole, color, onSolved, onJoinPlayer, onOpenChange }: Props) {
  const c = useCoopSession(memberId, scanId)
  const [open, setOpen] = useState(false)
  const prevStatus = useRef<CoopStatus | undefined>(undefined)
  const puzzle = getPuzzle(gameKey)
  const snap = c.snap
  const me = snap?.members.find(m => m.member_id === memberId)
  const role: CoopRole = me?.role ?? storedRole

  useEffect(() => { onOpenChange(open && !!snap) }, [open, snap, onOpenChange])

  // A member who was already inside this game (page reload, back from the board) goes straight back in:
  // no second "Join lobby" tap. Remembered per member and card; "Back to the card" forgets it.
  const inKey = memberId && scanId ? `coop-in-${scanId}-${memberId}` : null
  const remember = useCallback((on: boolean) => {
    if (!inKey) return
    try { if (on) localStorage.setItem(inKey, '1'); else localStorage.removeItem(inKey) } catch { /* storage blocked: only the auto-return is lost */ }
  }, [inKey])
  // Join straight from the card: register (name only), then go into the lobby without leaving the page.
  const [name, setName] = useState(savedPlayerName)
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [wantOpen, setWantOpen] = useState(false)
  const register = async (n: string) => {
    if (!n.trim()) { setRegError('Enter your name.'); return }
    setRegistering(true); setRegError(null)
    const err = await onJoinPlayer(n)
    setRegistering(false)
    if (err) setRegError(err); else setWantOpen(true)
  }
  useEffect(() => {
    if (wantOpen && memberId && !open) { setWantOpen(false); void c.open(gameKey).then(r => { if (r) { remember(true); setOpen(true) } }) }
  }, [wantOpen, memberId, open, c, gameKey, remember])

  // coop_move already credited the card on the server; just refresh the page's copy,
  // once, on the change playing -> completed (never heal: Undo completion must stick).
  useEffect(() => {
    if (snap && justCompleted(prevStatus.current, snap)) onSolved()
    prevStatus.current = snap?.status
  }, [snap, onSolved])

  const returned = useRef(false)
  useEffect(() => {
    if (returned.current || open || !inKey || c.busy || (c.peeked !== 'lobby' && c.peeked !== 'playing')) return
    let was = false
    try { was = localStorage.getItem(inKey) === '1' } catch { /* ignore */ }
    if (!was) return
    returned.current = true
    void c.open(gameKey).then(r => { if (r) setOpen(true) })
  }, [open, inKey, c, gameKey])

  const play = async () => { if (await c.open(gameKey)) { remember(true); setOpen(true) } }
  const refusal = c.error === 'PLAYER_TAKEN' ? 'Your team already has a player.'
    : c.error === 'OBSERVERS_FULL' ? 'The lobby is full.'
    : c.error === 'NOT_IN_SESSION' ? 'Another player took your seat. You can join again.'
    : c.error === 'NOT_ON_TEAM' ? 'Your saved player registration does not match this team. Join this board again.' : null

  const btn = 'w-full min-h-[60px] rounded-2xl font-black uppercase tracking-wide text-white active:scale-95 transition-transform shadow-[0_4px_0_rgba(0,0,0,0.35)]'

  if (memberLoading || memberError) return (
    <div className="rounded-2xl p-4 mb-6" style={PANEL}>
      <p className="text-gray-300 text-sm">{memberLoading ? 'Checking your player registration…' : 'Could not check your registration. Reload to try again.'}</p>
    </div>
  )

  if (!memberId) return (
    <div className="rounded-2xl p-4 mb-6" style={PANEL}>
      <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Play in the app</p>
      <p className="text-gray-300 text-sm mb-3">Enter your name to join your team's lobby. You stay on this card.</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={40} aria-label="Your name"
        className="w-full min-h-[48px] rounded-xl px-3 mb-3 bg-white/10 border-2 border-white/20 text-white font-bold placeholder:text-white/40" />
      {regError && <Banner tone="err">{regError}</Banner>}
      <button type="button" className={btn} style={{ background: color }} disabled={registering}
        onClick={() => { void register(name) }}>
        {registering ? 'Joining...' : storedRole === 'observer' ? 'Join as observer' : 'Join as player'}
      </button>
    </div>
  )

  if (!open || !snap) {
    return (
      <div className="rounded-2xl p-4 mb-6" style={PANEL}>
        <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Play in the app</p>
        <p className="text-gray-300 text-sm mb-3">Play this challenge together with your team. The player acts, observers watch.</p>
        {gameKey === 'icon-matching' && <p className="text-gray-300 text-sm mb-3">Use 1 player and at least 1 observer (up to 9). The player taps two different cards, one at a time. Only observers see both icons after the second tap. Observers call out the positions and help the player remember pairs. Matches stay revealed; non-matches hide after 2.5 seconds. Match all 8 pairs to complete the card.</p>}
        <div className="mb-3"><RoleChip role={storedRole} /></div>
        {c.peekState === 'error' && (
          <Banner tone="err">Could not check for a game.
            <button type="button" onClick={() => void c.retryPeek()} className="ml-2 min-h-[44px] underline">Try again</button>
          </Banner>
        )}
        {refusal && <Banner tone="err">{c.error === 'NOT_IN_SESSION' ? '' : 'You have not been added to the lobby. '}{refusal}</Banner>}
        {regError && <Banner tone="err">{regError}</Banner>}
        <button type="button" onClick={() => { if (c.error === 'NOT_ON_TEAM') void register(savedPlayerName()); else void play() }} disabled={c.busy || c.peekState === 'loading'}
          className={btn} style={{ background: color }}>
          {c.peekState === 'loading' ? 'Checking...' : c.error === 'NOT_ON_TEAM' ? 'Join this board again' : playLabel(c.peeked)}
        </button>
      </div>
    )
  }

  const close = () => { remember(false); setOpen(false); void c.retryPeek() }
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
      {(c.error === 'PICK_LOCKED' || c.error === 'PICK_TAKEN') && <Banner tone="info">{c.error === 'PICK_TAKEN' ? 'You already picked that card.' : 'That pick was not accepted. Nothing changed.'}</Banner>}
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
          <button type="button" onClick={() => { remember(false); void c.leave(); setOpen(false) }}
            className="w-full min-h-[44px] mt-2 text-sm font-bold text-gray-300 underline">Leave lobby</button>
        </>
      ) : (
        <>
          {snap.status === 'completed' && (
            <Banner tone="ok">Solved. Locked: this game is completed. Your team was credited once.</Banner>
          )}
          <div className={c.live ? '' : 'opacity-50'}>
            <puzzle.View state={currentState(snap, puzzle)} canAct={canAct && c.live && (snap.game_key === 'icon-matching' || !c.busy)} isPlayer={role === 'player'} mySlot={me?.slot}
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
