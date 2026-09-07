// Speed Edit Showdown — the target picture gallery.
//
// Shown on the standalone AI Team Building card so a team can browse the ten
// targets and open any one full-screen to work from. Images are served from
// public/aitb/reels/edit.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const SPEED_EDIT_TARGETS: { img: string; label: string }[] = [
  { img: '/aitb/reels/edit/edit1.jpg', label: '3D cartoon' },
  { img: '/aitb/reels/edit/edit2.jpg', label: 'Photorealistic' },
  { img: '/aitb/reels/edit/edit3.jpg', label: 'Pixel art' },
  { img: '/aitb/reels/edit/edit4.jpg', label: 'Watercolor' },
  { img: '/aitb/reels/edit/edit5.jpg', label: 'Claymation' },
  { img: '/aitb/reels/edit/edit6.jpg', label: 'Comic book' },
  { img: '/aitb/reels/edit/edit7.jpg', label: 'Paper cutout' },
  { img: '/aitb/reels/edit/edit8.jpg', label: 'Neon glow' },
  { img: '/aitb/reels/edit/edit9.jpg', label: 'Crayon drawing' },
  { img: '/aitb/reels/edit/edit10.jpg', label: 'Origami' },
]

export function SpeedEditTargets({ color }: { color: string }) {
  const [open, setOpen] = useState<number | null>(null)

  // Escape closes the enlarged view, and the page behind it must not scroll.
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const shown = open === null ? null : SPEED_EDIT_TARGETS[open]

  return (
    <div className="mb-5">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🖼️ The 10 target pictures
      </div>

      <div
        className="rounded-2xl p-3 mb-3"
        style={{ background: 'rgba(251,191,36,0.12)', border: '2px solid rgba(251,191,36,0.45)' }}
      >
        <p className="text-amber-200 font-bold text-sm leading-snug">
          ⚠️ You must REGENERATE the picture with AI — then show the marshal your picture AND the
          prompt you used. No prompt = no points!
        </p>
      </div>

      <p className="text-white/50 text-xs font-bold text-center mb-3">
        Tap a card to show it BIG
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {SPEED_EDIT_TARGETS.map((t, i) => (
          <button
            key={t.img}
            onClick={() => setOpen(i)}
            aria-label={`Show ${t.label} target picture larger`}
            className="rounded-xl overflow-hidden text-left transition-transform active:scale-95"
            style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${color}55` }}
          >
            <img
              src={t.img}
              alt={`Target ${i + 1}: ${t.label}`}
              loading="lazy"
              className="w-full aspect-square object-cover block"
            />
            <span className="block px-1.5 py-1 text-[10px] font-black text-white/70 truncate">
              {i + 1}. {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Rendered into <body>. The AITB card wraps its contents in
          .animate-slide-up, and a transformed ancestor becomes the containing
          block for position:fixed — which pinned this overlay inside the card
          instead of centring it on screen. */}
      {shown && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${shown.label} target picture`}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/25 backdrop-blur-md"
        >
          {/* Wraps the image tightly so the enlarged view is the picture — the
              caption and close sit on top of it rather than stacking below,
              which on a phone left a tall black band under a wide image. */}
          <div
            onClick={e => e.stopPropagation()}
            className="relative inline-block rounded-2xl overflow-hidden"
            style={{
              border: `3px solid ${color}`,
              lineHeight: 0,
              // Hug the picture at any size: full width on a phone, capped on a
              // wide screen so a 16:9 target is comfortable rather than full-bleed.
              maxWidth: 'min(880px, 100%)',
              maxHeight: '100%',
            }}
          >
            <img
              src={shown.img}
              alt={`Target ${open! + 1}: ${shown.label}`}
              className="block max-w-full max-h-[85vh] w-auto h-auto object-contain"
            />
            <p className="absolute left-0 right-0 bottom-0 px-3 py-2 font-black text-white text-sm bg-gradient-to-t from-black/80 to-transparent">
              {open! + 1}. {shown.label}
            </p>
            <button
              onClick={() => setOpen(null)}
              aria-label="Close the enlarged picture"
              className="absolute top-2 right-2 w-9 h-9 rounded-full grid place-items-center font-black text-black bg-white/90 active:scale-95 transition-transform"
            >
              ✕
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
