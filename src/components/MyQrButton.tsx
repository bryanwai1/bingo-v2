import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'

// The team's own QR, on their own phone.
//
// Previously the only copy lived on the admin screen, so anyone who needed it
// had to find the host and ask — which at a 700-person event is a queue. Now
// every player carries it and can show it on demand.
//
// The overlay is portalled to document.body. It used to render in place, which
// meant `fixed inset-0` resolved against the nearest transformed ancestor
// instead of the viewport, and z-[100] was confined to that ancestor's local
// stacking context — so the board tiles painted straight over the QR.

export function MyQrButton({ value, teamName, label = 'My QR' }: {
  value: string
  teamName?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/15 active:scale-95 transition-all"
      >
        <span className="text-sm leading-none">▦</span>
        {label}
      </button>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{ zIndex: 2147483000 }}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-rise"
        >
          {/* Deliberately huge and on white: this gets scanned across a table
              in a dim function room, often by a camera that is struggling. */}
          <div
            className="bg-white p-5 rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <QRCodeSVG value={value} size={280} level="H" />
          </div>
          {teamName && (
            <p className="text-white font-black text-xl mt-5">{teamName}</p>
          )}
          <p className="text-white/50 text-sm mt-2">Show this to be scanned</p>
          <button
            onClick={() => setOpen(false)}
            className="mt-8 px-6 py-2.5 rounded-2xl border border-white/25 text-white/80 text-sm font-bold hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
