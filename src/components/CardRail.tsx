import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RAIL_ITEMS, type RailKey } from '../lib/cardRail'

type Dock = 'left' | 'right' | 'top' | 'bottom'
const DOCK_KEY = 'card-tools-dock'
const OPEN_KEY = 'card-tools-open'

function load<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(key); return (ok as readonly string[]).includes(v ?? '') ? (v as T) : fallback } catch { return fallback }
}
function save(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* private mode: fine */ } }

/**
 * Floating tool bar for a card's optional components, like the tool bar in a
 * design app. Closed it is one button; open it is a strip of icons (the name
 * shows on hover). Drag the grip to any screen edge and it snaps there, running
 * vertically on the left and right and horizontally on the top and bottom.
 * Clicking an icon opens that component under the instructions.
 */
export function CardRail({ inUse, open, onOpen }: {
  inUse: Partial<Record<RailKey, boolean>>
  open: RailKey | null
  onOpen: (k: RailKey | null) => void
}) {
  const [expanded, setExpanded] = useState(() => load(OPEN_KEY, ['1', '0'], '1') === '1')
  const [dock, setDock] = useState<Dock>(() => load<Dock>(DOCK_KEY, ['left', 'right', 'top', 'bottom'], 'right'))
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const grab = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => save(OPEN_KEY, expanded ? '1' : '0'), [expanded])
  useEffect(() => save(DOCK_KEY, dock), [dock])

  const vertical = dock === 'left' || dock === 'right'
  const btn = 'relative group w-11 h-11 rounded-xl border-2 flex items-center justify-center text-xl shadow-md transition-colors'
  // Which side the hover label opens on, so it never runs off the screen.
  const tip: Record<Dock, string> = {
    right: 'right-full mr-2 top-1/2 -translate-y-1/2',
    left: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'top-full mt-2 left-1/2 -translate-x-1/2',
    bottom: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  }
  const Tip = ({ children }: { children: ReactNode }) => (
    <span role="tooltip" className={`pointer-events-none absolute ${tip[dock]} z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-bold text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity`}>
      {children}
    </span>
  )

  const startDrag = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r) return
    grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ x: r.left, y: r.top })
    e.preventDefault()
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!grab.current) return
    setDrag({ x: e.clientX - grab.current.dx, y: e.clientY - grab.current.dy })
  }
  const endDrag = (e: React.PointerEvent) => {
    if (!grab.current) return
    grab.current = null
    // Snap to whichever screen edge the pointer ended nearest.
    const d = { left: e.clientX, right: window.innerWidth - e.clientX, top: e.clientY, bottom: window.innerHeight - e.clientY }
    setDock((Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]) as Dock)
    setDrag(null)
  }

  const place = drag
    ? { left: drag.x, top: drag.y }
    : dock === 'right' ? { right: 8, top: '33%' }
    : dock === 'left' ? { left: 8, top: '33%' }
    : dock === 'top' ? { top: 8, left: '50%', transform: 'translateX(-50%)' }
    : { bottom: 8, left: '50%', transform: 'translateX(-50%)' }

  return (
    <div
      ref={barRef} data-testid="card-rail" data-dock={dock}
      style={{ position: 'fixed', zIndex: 50, ...place }}
      className={`flex ${vertical ? 'flex-col' : 'flex-row'} items-center gap-2 ${drag ? 'cursor-grabbing select-none' : ''}`}
    >
      {!expanded ? (
        <button
          type="button" aria-label="Open card tools" aria-expanded={false} onClick={() => setExpanded(true)}
          className={`${btn} bg-violet-600 border-violet-600 text-white font-black`}
        >
          +<Tip>Card tools</Tip>
        </button>
      ) : (
        <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} items-center gap-2 rounded-2xl bg-white/95 border border-gray-200 shadow-xl p-1.5 backdrop-blur`}>
          <div
            role="button" aria-label="Drag to move the tool bar" title="Drag to a screen edge"
            onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            className={`${vertical ? 'w-11 h-5' : 'w-5 h-11'} flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-grab touch-none`}
          >
            <span aria-hidden className={`text-sm leading-none tracking-tighter ${vertical ? '' : 'rotate-90'}`}>⋮⋮</span>
          </div>
          {RAIL_ITEMS.map(item => {
            const active = open === item.key
            return (
              <button
                key={item.key} type="button" aria-label={item.label} aria-pressed={active}
                onClick={() => onOpen(active ? null : item.key)}
                className={`${btn} ${active ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-200 hover:border-violet-400'}`}
              >
                <span aria-hidden>{item.icon}</span>
                {inUse[item.key] && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />}
                <Tip>{item.label}{inUse[item.key] ? ' · in use' : ''}</Tip>
              </button>
            )
          })}
          <button
            type="button" aria-label="Close the tool bar" aria-expanded onClick={() => setExpanded(false)}
            className={`${btn} border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 text-base font-black`}
          >
            ×<Tip>Close the tool bar</Tip>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * One component's editor, shown full width under the card's instructions
 * (it used to slide in as a narrow side panel). Closing it never clears the
 * component's saved data.
 */
export function RailDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  // Opening one from the tool bar brings it into view.
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  return (
    <section ref={ref} aria-label={title} className="mt-6 scroll-mt-4 rounded-2xl border-2 border-violet-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-5 py-3">
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 text-xl">×</button>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}
