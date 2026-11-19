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

export function MyQrButton({
  value, teamName, label = 'My QR', hint = 'Show this to be scanned',
  open: openProp, onOpenChange, hideTrigger = false, badge,
}: {
  value: string
  teamName?: string
  label?: string
  /** Line under the QR — what the scanner should expect to happen. */
  hint?: string
  /**
   * Optional controlled mode. Left undefined the button owns its own state, as
   * every player-facing use does; the Sample demo passes it so a paired phone
   * can put the QR on the projector and take it away again.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Overlay only: another control (the phone bottom bar) opens it. */
  hideTrigger?: boolean
  /** Short word shown above the QR so the scanner knows what the code is for, e.g. "Observer". */
  badge?: string
}) {
  const [openSelf, setOpenSelf] = useState(false)
  const [copied, setCopied] = useState(false)
  const open = openProp ?? openSelf
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenSelf(next)
    onOpenChange?.(next)
  }

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

  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch {
      // Clipboard blocked (older phones, non-secure page): select the link so it can be copied by hand.
      const el = document.getElementById('my-qr-link')
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Same approach as the host's join-link download: draw the QR on white, 1024px, save as PNG.
  const download = () => {
    const svg = document.getElementById('my-qr-svg')
    if (!svg) return
    const data = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      const pad = 64, size = 1024
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2)
      const a = document.createElement('a')
      const slug = (teamName ?? 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team'
      a.download = `bingo-dash-${badge ? badge.toLowerCase() + '-' : ''}${slug}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)))
  }

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/15 active:scale-95 transition-all"
        >
          <span className="text-sm leading-none">▦</span>
          {label}
        </button>
      )}

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{ zIndex: 2147483000 }}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm overflow-y-auto animate-rise"
        >
          <div className="min-h-full flex flex-col items-center justify-center p-6">
            {badge && (
              <p className="mb-3 px-4 py-1.5 rounded-full bg-blue-400/20 border border-blue-300/40 text-blue-200 text-sm font-black uppercase tracking-widest">
                {badge === 'Observer' ? '👁 ' : ''}{badge}
              </p>
            )}
            {/* Deliberately huge and on white: this gets scanned across a table
                in a dim function room, often by a camera that is struggling. */}
            <div
              className="bg-white p-5 rounded-3xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <QRCodeSVG id="my-qr-svg" value={value} size={280} level="H" />
            </div>
            {teamName && (
              <p className="text-white font-black text-xl mt-5">{teamName}</p>
            )}
            <p className="text-white/50 text-sm mt-2 text-center max-w-[320px]">{hint}</p>
            <div className="mt-4 w-full max-w-[340px] flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div id="my-qr-link" className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white/10 border border-white/15 text-blue-200 text-xs font-mono break-all select-all">
                {value}
              </div>
              <button
                onClick={copy}
                className={`min-h-[44px] px-4 rounded-lg text-xs font-black flex-shrink-0 transition-colors ${copied ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-300/40' : 'bg-blue-500 text-white hover:bg-blue-400'}`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); download() }}
              className="mt-3 w-full max-w-[340px] min-h-[48px] rounded-xl bg-blue-500 text-white font-black text-sm hover:bg-blue-400 active:scale-95 transition-all"
            >
              Download {badge ? `${badge} ` : ''}QR as PNG
            </button>
            <button
              onClick={() => setOpen(false)}
              className="mt-5 px-6 py-2.5 rounded-2xl border border-white/25 text-white/80 text-sm font-bold hover:bg-white/10 transition-colors"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
