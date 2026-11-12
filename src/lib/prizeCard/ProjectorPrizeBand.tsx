// Projector prize messages (DESIGN-008 Projector). A normal-flow block that sits
// BELOW the scoreboard (the scoreboard's own area shrinks to make room), so it
// cannot overlap a row: a 5 s popup bar, then a persistent line per claim.
import { bandState, type Claim } from './logic.ts'
import { TrophyIcon, prizeVars, type PrizeTheme } from './shared.ts'

interface Props {
  claims: Claim[]
  /** When this screen first saw each claim; null = already there on load (no popup). */
  seenAt: Record<string, number | null>
  now: number
  theme: PrizeTheme
}

function Message({ name }: { name: string }) {
  // The name truncates with an ellipsis; "claimed the prize" never does.
  return (
    <>
      <span className="truncate min-w-0">{name}</span>
      <span className="shrink-0 whitespace-pre"> claimed the prize</span>
    </>
  )
}

export function ProjectorPrizeBand({ claims, seenAt, now, theme }: Props) {
  const { popup, lines } = bandState(claims, seenAt, now)
  if (!popup && lines.length === 0) return null
  return (
    <div className="relative z-10 shrink-0 px-3 sm:px-6 lg:px-10 pb-2 flex flex-col gap-1.5" style={prizeVars(theme)} aria-live="polite">
      <div className="w-full flex flex-col gap-1.5">
        {lines.map(c => (
          <div key={c.id} data-prize-line className="flex items-center gap-3 rounded-xl px-4 py-2 text-lg lg:text-2xl font-black border"
            style={{ background: 'var(--pz-soft)', borderColor: 'var(--pz-accent)', color: 'var(--pz-text)' }}>
            <span className="shrink-0" style={{ color: 'var(--pz-accent-text)' }}><TrophyIcon size={28} /></span>
            <Message name={c.team_name} />
          </div>
        ))}
        {popup && (
          <div data-prize-popup className="prz-drop flex items-center gap-4 rounded-2xl px-6 py-4 text-2xl lg:text-4xl font-black"
            style={{ background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}>
            <span className="shrink-0"><TrophyIcon size={44} /></span>
            <Message name={popup.team_name} />
          </div>
        )}
      </div>
    </div>
  )
}
