// The "?" strip under the 5x5 grid (DESIGN-008 Board). Presentational: the
// parent decides the state (logic.ts stripState) and owns the claim call.
import { claimedByText, type PrizeSlot, type StripState } from './logic.ts'
import { LockIcon, TrophyIcon, prizeVars, type PrizeTheme } from './shared.ts'

interface Props {
  state: StripState
  theme: PrizeTheme
  busy: boolean
  /** "Too late, <Group> got it first" or a retry message; null for none. */
  message: string | null
  /** True when `message` is a failure to reach the server (shows TRY AGAIN). */
  failed?: boolean
  title?: string
  /** Admin's reminder text for the locked state; empty = default. */
  hint?: string | null
  onClaim: () => void
  onOpen: () => void
  /** Copies of the required cards: grey until the team completes each. */
  slots?: PrizeSlot[]
  /** Extra condition lines (score, lines, window, prizes left). */
  notes?: { text: string; ok: boolean }[]
  /** Draws one slot's icon (the real card's icon). Kept a prop so this file stays free of the app's icon set. */
  slotIcon?: (slot: PrizeSlot) => React.ReactNode
}

const box = 'rounded-2xl border px-3 py-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 items-center min-h-[104px] text-left w-full'
const boxStyle = (accent: boolean) => accent ? {
  background: 'linear-gradient(135deg, var(--pz-soft), rgba(8,10,16,.55))',
  borderColor: 'var(--pz-accent)',
  borderWidth: 2,
  boxShadow: '0 0 18px var(--pz-soft), inset 0 0 12px var(--pz-soft)',
  color: 'var(--pz-text)',
} : {
  background: 'var(--pz-surface)',
  borderColor: 'var(--pz-border)',
  color: 'var(--pz-text)',
}

function Medal({ filled, children }: { filled: boolean; children: React.ReactNode }) {
  return (
    <span
      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black"
      style={filled
        ? { background: 'radial-gradient(circle at 30% 25%, #fff3b0, var(--pz-accent) 60%)', color: 'var(--pz-ink)', boxShadow: '0 0 16px var(--pz-accent)' }
        : { border: '2px solid var(--pz-border)', color: 'var(--pz-text2)' }}
    >{children}</span>
  )
}

/** A row of the required cards. Undone ones are grey; a done one takes the real card's colour and icon. */
function SlotRow({ slots, icon }: { slots: PrizeSlot[]; icon?: (slot: PrizeSlot) => React.ReactNode }) {
  if (slots.length === 0) return null
  return (
    <span className="col-span-2 flex flex-wrap gap-1.5" data-prize-slots>
      {slots.map(sl => (
        <span key={sl.key} title={`${sl.title}${sl.done ? ' (done)' : ''}`}
          className="w-9 h-9 rounded-lg flex items-center justify-center border transition-colors duration-500"
          style={sl.done
            ? { background: sl.hex, borderColor: 'rgba(255,255,255,.55)', color: '#fff', boxShadow: `0 0 8px ${sl.hex}` }
            : { background: 'rgba(120,125,135,.35)', borderColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.35)' }}>
          {icon?.(sl)}
        </span>
      ))}
    </span>
  )
}

function NoteRow({ notes }: { notes: { text: string; ok: boolean }[] }) {
  if (notes.length === 0) return null
  return (
    <span className="col-span-2 flex flex-wrap gap-1.5" data-prize-notes>
      {notes.map(n => (
        <span key={n.text} className="text-xs font-bold rounded-full px-2 py-0.5"
          style={{ background: n.ok ? 'rgba(74,222,128,.18)' : 'rgba(0,0,0,.35)', color: n.ok ? '#86efac' : 'var(--pz-text2)' }}>
          {n.ok ? '✓ ' : ''}{n.text}
        </span>
      ))}
    </span>
  )
}

export function PrizeStrip({ state, theme, busy, message, failed, title, hint, onClaim, onOpen, slots = [], notes = [], slotIcon }: Props) {
  const name = title?.trim() || 'Prize card'
  const root = { ...prizeVars(theme) }

  if (state.kind === 'won') {
    return (
      <>
      <button type="button" onClick={onOpen} className={`${box} prz-won active:scale-[.98] transition-transform`} style={{ ...root, ...boxStyle(true), boxShadow: '0 0 24px var(--pz-accent)' }}>
        <Medal filled><TrophyIcon size={26} /></Medal>
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--pz-accent-text)' }}>{name}</span>
          <span className="block text-base font-black [overflow-wrap:anywhere]">You won it! Tap to open</span>
        </span>
      </button>
      {state.more && (
        <button type="button" onClick={onClaim} disabled={busy}
          className="mt-2 w-full h-11 rounded-xl text-sm font-black uppercase tracking-wider disabled:opacity-60"
          style={{ ...root, background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}>{busy ? 'Claiming…' : 'CLAIM ANOTHER'}</button>
      )}
      </>
    )
  }

  if (state.kind === 'lost') {
    return (
      <div className={box} style={{ ...root, ...boxStyle(false), borderStyle: 'dashed' }} aria-live="polite">
        <Medal filled={false}>?</Medal>
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--pz-text2)' }}>{name}</span>
          <span className="block text-base font-bold [overflow-wrap:anywhere]">{state.text ?? claimedByText(state.winner)}</span>
        </span>
      </div>
    )
  }

  if (state.kind === 'unavailable') {
    return (
      <div className={box} style={{ ...root, ...boxStyle(false), borderStyle: 'dashed' }} aria-live="polite">
        <Medal filled={false}>?</Medal>
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--pz-text2)' }}>{name}</span>
          <span className="block text-base font-bold [overflow-wrap:anywhere]">{state.text}</span>
        </span>
      </div>
    )
  }

  if (state.kind === 'locked') {
    const pct = state.threshold > 0 ? Math.min(100, (state.count / state.threshold) * 100) : 0
    return (
      <div className={box} style={{ ...root, ...boxStyle(true) }} aria-live="polite">
        <Medal filled>?</Medal>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest" style={{ color: 'var(--pz-accent-text)' }}><LockIcon size={14} />{name}</span>
          <span className="block text-base font-bold">{state.count} / {state.threshold} cards</span>
          <span className="block text-sm font-semibold" style={{ color: 'var(--pz-accent-text)' }}>
            {hint?.trim() || (slots.length > 0
              ? `Complete the ${slots.length} card${slots.length > 1 ? 's' : ''} below${state.threshold > slots.length ? ` and ${state.threshold - slots.length} more` : ''} to unlock this prize`
              : `Complete ${state.threshold} cards to unlock this prize${state.threshold > state.count ? ` · ${state.threshold - state.count} to go` : ''}`)}
          </span>
          <span className="mt-1.5 block h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,.35)' }} role="progressbar" aria-valuemin={0} aria-valuemax={state.threshold} aria-valuenow={state.count}>
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--pz-accent), #fff3b0)', boxShadow: '0 0 8px var(--pz-accent)' }} />
          </span>
          {message && <span role="status" className="mt-1.5 block text-sm font-bold [overflow-wrap:anywhere]">{message}</span>}
        </span>
        <SlotRow slots={slots} icon={slotIcon} />
        <NoteRow notes={notes} />
      </div>
    )
  }

  // claimable
  return (
    <div className={box} style={{ ...root, ...boxStyle(true) }} aria-live="polite">
      <Medal filled>?</Medal>
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase tracking-widest" style={{ color: 'var(--pz-accent-text)' }}>{name}</span>
        <span className="block text-base font-bold">{state.canClaim ? 'You reached the target' : 'Your group can claim this card'}</span>
      </span>
      <SlotRow slots={slots} icon={slotIcon} />
      <NoteRow notes={notes} />
      {state.canClaim ? (
        <button
          type="button" onClick={onClaim} disabled={busy} aria-busy={busy}
          className="prz-claim col-span-2 w-full h-[52px] rounded-xl text-base font-black uppercase tracking-wider active:scale-[.98] transition-transform disabled:opacity-60"
          style={{ background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}
        >{busy ? 'Claiming…' : failed ? 'TRY AGAIN' : 'CLAIM'}</button>
      ) : (
        <span className="col-span-2 text-sm font-bold" style={{ color: 'var(--pz-text2)' }}>View only: a player in your group can claim it.</span>
      )}
      {message && (
        <p role="status" className="col-span-2 text-sm font-bold [overflow-wrap:anywhere]" style={{ color: failed ? '#fca5a5' : 'var(--pz-text)' }}>{message}</p>
      )}
    </div>
  )
}
