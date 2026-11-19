import { T } from './T'
import { peopleLabel, type Needs } from '../lib/cardNeeds'

/** Black or white, whichever reads on this card colour. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.4 ? '#0a1615' : '#ffffff'
}

const PeopleIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <circle cx="17.5" cy="9" r="2.6" /><path d="M17 14.2c2.7.2 4.5 2.2 4.5 5.3" />
  </svg>
)
const PinIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
)

/**
 * "How many people, and where" strip. Sits under the card's hero image and above
 * its instructions, in the card's own colour, so a team sees at a glance whether
 * it has enough people and where to go. Shows only what the card sets.
 */
export function CardNeeds({ task, hexCode, mapsHref }: { task: Needs; hexCode: string; mapsHref?: string | null }) {
  const people = peopleLabel(task)
  const place = task.play_location?.trim() || null
  if (!people && !place) return null
  const ink = inkOn(hexCode)
  const tile = 'flex items-center gap-3 rounded-2xl px-4 py-3 min-w-0 shadow-lg border-2'
  const style = { backgroundColor: hexCode, color: ink, borderColor: 'rgba(255,255,255,0.85)', boxShadow: `0 0 0 3px ${hexCode}55, 0 6px 18px rgba(0,0,0,0.35)` }
  const small = 'text-[11px] font-black uppercase tracking-wider opacity-80 leading-tight'
  const peopleCount = task.players_whole_team ? null : (task.players_max ?? task.players_min ?? 1)

  return (
    <div data-testid="card-needs" className={`mb-5 grid gap-3 ${people && place ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} animate-slide-up`}>
      {people && (
        <div className={tile} style={style}>
          <PeopleIcon />
          <div className="min-w-0">
            <p className={small}><T>{peopleCount === 1 ? 'Person needed' : 'People needed'}</T></p>
            <p className="text-2xl font-black leading-tight"><T>{people}</T></p>
          </div>
        </div>
      )}
      {place && (() => {
        const body = (
          <>
            <PinIcon />
            <div className="min-w-0">
              <p className={small}><T>Where to play</T>{mapsHref ? <span aria-hidden> ↗</span> : null}</p>
              <p className="text-xl font-black leading-tight [overflow-wrap:anywhere]"><T>{place}</T></p>
            </div>
          </>
        )
        return mapsHref
          ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={`${tile} active:scale-95 transition-transform`} style={style}>{body}</a>
          : <div className={tile} style={style}>{body}</div>
      })()}
    </div>
  )
}
