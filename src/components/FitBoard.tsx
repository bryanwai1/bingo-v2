import { useLayoutEffect, useRef, useState } from 'react'

// Shared by the live projector scoreboard and the award ceremony's full
// scoreboard / lineup slides, so every team stays on one screen.

/**
 * Makes the board as large as it can be while every group stays on screen and
 * nothing scrolls.
 *
 * The scale magnifies the TEXT, not the column: rendered width is pinned to
 * the screen, so a bigger scale is met by a correspondingly NARROWER canvas
 * (canvas = available / k). The column keeps its place on screen and the type
 * inside it grows. A plain uniform scale would instead widen the whole row
 * until it ran off the side.
 *
 * k is capped by two things, and only these:
 *   - height: every row must fit, so k <= availableHeight / contentHeight
 *   - the row's own minimum width: k <= availableWidth / minCanvas
 * Both are hard limits, so `zoom` only ever scales DOWN from the fit.
 */
export function FitBoard({
  canvasMin, canvasMax, zoom, children,
}: {
  canvasMin: number
  canvasMax: number
  zoom: number
  children: React.ReactNode
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState({ w: canvasMin, h: 0 })
  const [fit, setFit] = useState(1)
  const [canvasWidth, setCanvasWidth] = useState(canvasMax)

  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current, i = inner.current
      if (!o || !i) return
      // offsetWidth/Height are the UNSCALED box - transforms do not affect
      // them, which is what makes measuring inside a scaled element work.
      const w = i.offsetWidth, h = i.offsetHeight
      if (!w || !h) return
      // Only write when something actually moved: these setters re-render,
      // and this effect runs after layout, so an unconditional write is an
      // infinite loop.
      setNat(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
      // Row height comes from the type, not the width, so contentHeight is
      // effectively independent of the canvas width being solved for here -
      // there is no circular dependency to converge.
      const next = Math.min(o.clientHeight / h, o.clientWidth / canvasMin)
      setFit(prev => (Math.abs(prev - next) < 0.001 ? prev : next))
      // Pin the rendered width to the screen, within the column's range.
      const want = Math.min(canvasMax, Math.max(canvasMin, o.clientWidth / (next * zoom)))
      setCanvasWidth(prev => (Math.abs(prev - want) < 1 ? prev : want))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [canvasWidth, canvasMin, canvasMax, zoom, children])

  const k = fit * zoom

  return (
    <div ref={outer} className="flex-1 min-h-0 overflow-hidden flex">
      {/* transform scales painting but not layout, so this box carries the
          scaled size - it is what centring and the parent's sizing see. */}
      <div style={{ width: nat.w * k, height: nat.h * k, margin: 'auto', flexShrink: 0 }}>
        <div
          ref={inner}
          style={{ width: canvasWidth, transform: `scale(${k})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
