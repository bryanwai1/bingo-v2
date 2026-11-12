// The winner's reveal page (DESIGN-008 Reveal). Presentational: the parent loads
// the secret text through get_prize_reveal and the hero photos.
import { useState } from 'react'
import { safeMapsUrl } from './logic.ts'
import { CaretLeftIcon, MapPinIcon, prizeVars, type PrizeTheme } from './shared.ts'

export interface RevealData { title: string; message: string | null; marshal_name: string | null; location_text: string | null; maps_url: string | null; maps_label: string | null }
export interface RevealPhoto { id: string; photo_url: string; caption: string | null; position_x: number | null; position_y: number | null }

interface Props {
  status: 'loading' | 'error' | 'ready'
  data: RevealData | null
  photos: RevealPhoto[]
  winner: string
  claimedAt: string
  eventEnded: boolean
  theme: PrizeTheme
  onBack: () => void
  onRetry: () => void
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'

function Hero({ photos }: { photos: RevealPhoto[] }) {
  const [idx, setIdx] = useState(0)
  if (photos.length === 0) return <div className="w-full aspect-[16/10] lg:aspect-auto lg:h-full" style={{ background: 'repeating-linear-gradient(115deg, rgba(255,255,255,.05) 0 2px, transparent 2px 22px), linear-gradient(135deg, #312e81, #1e1b4b)' }} />
  return (
    <div className="relative lg:h-full">
      <div
        className="flex overflow-x-auto snap-x snap-mandatory aspect-[16/10] lg:aspect-auto lg:h-full [scrollbar-width:none]"
        onScroll={e => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))) }}
      >
        {photos.map(p => (
          <img
            key={p.id} src={p.photo_url} alt={p.caption ?? ''}
            className="w-full h-full shrink-0 snap-center object-cover"
            style={{ objectPosition: `${p.position_x ?? 50}% ${p.position_y ?? 50}%` }}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute bottom-9 left-0 right-0 flex justify-center gap-1.5">
          {photos.map((p, i) => (
            <span key={p.id} data-dot className="w-2 h-2 rounded-full" style={{ background: i === idx ? 'var(--pz-accent)' : 'rgba(255,255,255,.55)' }} />
          ))}
        </div>
      )}
    </div>
  )
}

export function PrizeReveal({ status, data, photos, winner, claimedAt, eventEnded, theme, onBack, onRetry }: Props) {
  const back = (
    <button type="button" onClick={onBack} className="absolute top-3 left-3 z-20 h-11 px-3 rounded-full flex items-center gap-1 text-sm font-black"
      style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>
      <CaretLeftIcon size={18} />Board
    </button>
  )
  const root = 'min-h-[100dvh] relative overflow-x-hidden lg:grid lg:grid-cols-[1.1fr_1fr]'
  const rootStyle = { ...prizeVars(theme), background: theme === 'grab' ? '#06150d' : '#0b0f14', color: 'var(--pz-text)' }

  if (status !== 'ready' || !data) {
    return (
      <div className={root} style={rootStyle}>
        {back}
        <div className="col-span-2 flex flex-col items-center justify-center text-center gap-4 px-6 py-24" role="status">
          {status === 'loading' ? (
            <p className="text-lg font-bold animate-pulse">Opening your prize…</p>
          ) : (
            <>
              <p className="text-lg font-bold">We could not open the prize.</p>
              <button type="button" onClick={onRetry} className="h-[52px] px-8 rounded-xl text-base font-black" style={{ background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}>TRY AGAIN</button>
              <button type="button" onClick={onBack} className="text-sm font-bold underline">Back to board</button>
            </>
          )}
        </div>
      </div>
    )
  }

  const mapsUrl = safeMapsUrl(data.maps_url)
  return (
    <div className={root} style={rootStyle}>
      {back}
      <div className="relative lg:min-h-[100dvh]"><div className="w-full lg:absolute lg:inset-0"><Hero photos={photos} /></div></div>
      <div className="relative z-10 -mt-7 lg:mt-0 rounded-t-[28px] lg:rounded-none px-5 pt-7 pb-10 lg:flex lg:flex-col lg:justify-center lg:max-w-[520px] lg:mx-auto w-full"
        style={{ background: theme === 'grab' ? '#06150d' : '#0b0f14' }}>
        <div className="relative text-left">
          <div className="prz-halo absolute inset-x-0 -top-2 h-16 rounded-full pointer-events-none" aria-hidden="true" style={{ background: 'var(--pz-soft)', filter: 'blur(24px)' }} />
          <h1 className="relative font-black leading-tight [overflow-wrap:anywhere]" style={{ fontSize: 'clamp(2rem, 9vw, 3.5rem)' }}>Congratulations!</h1>
        </div>
        {data.message && <p className="mt-3 text-base whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: 'var(--pz-text2)' }}>{data.message}</p>}

        {(data.marshal_name || data.location_text) && (
          <div className="mt-5 rounded-2xl border p-4 flex items-center gap-3" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)' }}>
            <span className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-base font-black" style={{ background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}>{initials(data.marshal_name ?? data.location_text ?? '')}</span>
            <span className="min-w-0">
              {data.marshal_name && <span className="block text-base font-black [overflow-wrap:anywhere]">{data.marshal_name}</span>}
              {data.location_text && <span className="block text-sm [overflow-wrap:anywhere]" style={{ color: 'var(--pz-text2)' }}>{data.location_text}</span>}
            </span>
          </div>
        )}

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="mt-5 h-[60px] rounded-xl flex items-center justify-center gap-2 text-base font-black active:scale-[.98] transition-transform"
            style={{ background: 'var(--pz-accent)', color: 'var(--pz-ink)' }}>
            <MapPinIcon size={22} />{data.maps_label?.trim() || 'Open in Google Maps'}
          </a>
        )}

        <p className="mt-4 text-xs text-center lg:text-left" style={{ color: 'var(--pz-text2)' }}>
          Claimed {new Date(claimedAt).toLocaleString()} by {winner}
        </p>
        {eventEnded && <p className="mt-1 text-xs text-center lg:text-left" style={{ color: 'var(--pz-text2)' }}>The event has ended; your prize page stays open.</p>}
      </div>

      <div className="prz-confetti-layer pointer-events-none absolute inset-0 overflow-hidden z-[2]" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="prz-confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, background: i % 3 === 0 ? 'var(--pz-accent)' : i % 3 === 1 ? '#fff' : 'var(--pz-accent-text)' }} />
        ))}
      </div>
    </div>
  )
}
