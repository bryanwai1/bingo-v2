import { useRef, useState } from 'react'
import { ImageViewer } from './ImageViewer'

export interface HeroPhoto { photo_url: string; caption?: string | null }

const CENTRE = 64 // % of the width the current photo takes
const GAP = 2     // % between photos
const STEP = CENTRE + GAP
const SIDE = (100 - CENTRE) / 2

/**
 * Hero photos for a card. With one photo it is just that photo. With several,
 * the current one sits in the middle in a glowing frame and the previous and
 * next peek in from the sides, smaller and dimmer, so players can see at a
 * glance that there is more. The row slides along as the photo changes; tapping
 * a side photo, the arrows, the dots or a swipe all call onGo (which also stops
 * auto-play). Every photo is shown whole: a soft blurred copy fills any gap, so
 * portrait and landscape both fit without cropping.
 */
export function HeroCarousel({ photos, index, onGo, hexCode, title }: {
  photos: HeroPhoto[]
  index: number
  onGo: (i: number) => void
  hexCode: string
  title: string
}) {
  const touchX = useRef<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const n = photos.length
  if (n === 0) return null
  const viewer = open !== null && (
    <ImageViewer
      images={photos.map((p, i) => ({ src: p.photo_url, alt: `${title} ${i + 1}` }))}
      start={open}
      onClose={last => { setOpen(null); if (n > 1) onGo(last) }}
    />
  )
  const expandHint = (
    <span aria-hidden className="pointer-events-none absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
    </span>
  )

  if (n === 1) {
    return (
      <div className="rounded-2xl overflow-hidden mb-6 shadow-xl animate-slide-up bg-black/20">
        <button type="button" aria-label={`Enlarge ${title} photo`} onClick={() => setOpen(0)} className="relative block w-full cursor-zoom-in">
          <img src={photos[0].photo_url} alt={`${title} 1`} className="w-full max-h-[min(46vh,520px)] object-contain" />
          {expandHint}
        </button>
        {photos[0].caption && (
          <div className="px-4 py-2 text-xs text-white/70 font-medium" style={{ backgroundColor: `${hexCode}cc` }}>{photos[0].caption}</div>
        )}
        {viewer}
      </div>
    )
  }

  const go = (i: number) => onGo(((i % n) + n) % n)
  const caption = photos[index]?.caption

  return (
    <div className="mb-6 animate-slide-up" data-testid="hero-carousel">
      <div
        className="relative overflow-hidden py-3"
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
        }}
      >
        <div
          className="flex items-center transition-transform duration-500 ease-out"
          style={{ gap: `${GAP}%`, transform: `translateX(${SIDE - index * STEP}%)` }}
        >
          {photos.map((p, i) => {
            const active = i === index
            return (
              <button
                key={i} type="button" tabIndex={active ? -1 : 0}
                aria-label={active ? `Enlarge photo ${i + 1} of ${n}` : `Show photo ${i + 1} of ${n}`}
                aria-current={active}
                onClick={() => { if (!active) go(i); else { onGo(i); setOpen(i) } }}
                className={`relative flex-none overflow-hidden rounded-2xl bg-black/40 transition-all duration-500 ease-out ${active ? 'cursor-zoom-in' : 'cursor-pointer'}`}
                style={{
                  width: `${CENTRE}%`, aspectRatio: '4 / 3', maxHeight: 'min(46vh, 520px)',
                  transform: `scale(${active ? 1 : 0.88})`,
                  opacity: active ? 1 : 0.5,
                  filter: active ? 'none' : 'brightness(0.7)',
                  boxShadow: active ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 26px ${hexCode}cc, 0 10px 28px rgba(0,0,0,0.45)` : 'none',
                }}
              >
                <img src={p.photo_url} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60" />
                <img src={p.photo_url} alt={`${title} ${i + 1}`} draggable={false} className="relative w-full h-full object-contain" />
                {active && expandHint}
              </button>
            )
          })}
        </div>
        <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)}
          className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center text-xl font-bold backdrop-blur-sm active:scale-90 transition-transform">‹</button>
        <button type="button" aria-label="Next photo" onClick={() => go(index + 1)}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center text-xl font-bold backdrop-blur-sm active:scale-90 transition-transform">›</button>
      </div>
      <div className="mt-1 flex justify-center gap-2">
        {photos.map((_, i) => (
          <button key={i} type="button" aria-label={`Photo ${i + 1}`} onClick={() => go(i)}
            className={`h-2 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-white' : 'w-2 bg-white/45'}`} />
        ))}
      </div>
      {caption && <p className="mt-2 text-center text-xs text-white/70 font-medium">{caption}</p>}
      {viewer}
    </div>
  )
}
