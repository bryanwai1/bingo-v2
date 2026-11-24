import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ViewerImage { src: string; alt?: string }

const MAX_SCALE = 5
const DOUBLE_TAP_MS = 300
const SWIPE_PX = 60
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Full-screen photo viewer. Pinch, wheel or double-tap to zoom, drag to pan
 * when zoomed, swipe or use the arrows to move between a card's photos.
 * Esc, the close button or a tap on the dark area closes it. Rendered in a
 * portal so no animated parent can trap it, and the page behind never scrolls.
 */
export function ImageViewer({ images, start = 0, onClose }: {
  images: ViewerImage[]
  start?: number
  /** Called with the photo the player ended on. */
  onClose: (lastIndex: number) => void
}) {
  const n = images.length
  const [idx, setIdx] = useState(clamp(start, 0, Math.max(0, n - 1)))
  const [z, setZ] = useState({ scale: 1, x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const moved = useRef(false)
  const lastTap = useRef(0)
  const idxRef = useRef(idx)
  useEffect(() => { idxRef.current = idx }, [idx])

  const close = useCallback(() => onClose(idxRef.current), [onClose])
  const go = useCallback((to: number) => {
    if (n < 2) return
    setIdx(((to % n) + n) % n)
    setZ({ scale: 1, x: 0, y: 0 })
  }, [n])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') go(idxRef.current - 1)
      else if (e.key === 'ArrowRight') go(idxRef.current + 1)
    }
    window.addEventListener('keydown', key)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key) }
  }, [close, go])

  const dist = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const down = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setBusy(true)
    moved.current = false
    if (pointers.current.size === 2) pinch.current = { dist: dist(), scale: z.scale }
    else drag.current = { x: e.clientX, y: e.clientY, tx: z.x, ty: z.y }
  }
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      moved.current = true
      const scale = clamp(pinch.current.scale * (dist() / pinch.current.dist), 1, MAX_SCALE)
      setZ(s => (scale === 1 ? { scale, x: 0, y: 0 } : { ...s, scale }))
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
      if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true
      if (z.scale > 1) setZ(s => ({ ...s, x: drag.current!.tx + dx, y: drag.current!.ty + dy }))
    }
  }
  const up = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    pinch.current = null
    if (pointers.current.size > 0) { drag.current = null; return }
    setBusy(false)
    const d = drag.current
    drag.current = null
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (z.scale <= 1.02 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) { go(idx + (dx < 0 ? 1 : -1)); return }
    if (!moved.current) {
      const now = Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0
        setZ(s => (s.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
      } else lastTap.current = now
    }
  }
  const wheel = (e: React.WheelEvent) => {
    const scale = clamp(z.scale * Math.exp(-e.deltaY * 0.0015), 1, MAX_SCALE)
    setZ(s => (scale === 1 ? { scale, x: 0, y: 0 } : { ...s, scale }))
  }

  const img = images[idx]
  if (!img) return null
  const btn = 'absolute w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center text-2xl font-bold backdrop-blur-sm active:scale-90 transition'

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-[200] bg-black/95 select-none"
      // React events bubble through portals: keep swipes here from turning pages behind the viewer.
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
        onClick={e => { if (e.target === e.currentTarget && !moved.current) close() }}
      >
        <img
          src={img.src} alt={img.alt ?? ''} draggable={false}
          className="max-w-[100vw] max-h-[100dvh] object-contain"
          style={{
            transform: `translate(${z.x}px, ${z.y}px) scale(${z.scale})`,
            transition: busy ? 'none' : 'transform 0.18s ease-out',
            cursor: z.scale > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>
      <button type="button" aria-label="Close photo viewer" onClick={close} className={`${btn} top-3 right-3 text-xl`}>✕</button>
      {n > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(idx - 1)} className={`${btn} left-3 top-1/2 -translate-y-1/2`}>‹</button>
          <button type="button" aria-label="Next photo" onClick={() => go(idx + 1)} className={`${btn} right-3 top-1/2 -translate-y-1/2`}>›</button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-black backdrop-blur-sm">{idx + 1} / {n}</div>
        </>
      )}
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold text-white/50 pointer-events-none">Pinch or double-tap to zoom</p>
    </div>,
    document.body,
  )
}
