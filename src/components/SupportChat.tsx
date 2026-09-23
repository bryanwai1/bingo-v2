import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

/* ============================================================================
   SupportChat — the floating bubble a team taps to reach the facilitator.

   Draggable because it sits over a live game board: on a phone it will
   inevitably cover the one tile someone needs. Position is remembered per
   device, and clamped to the viewport so it can never be dragged off screen
   and lost.

   A drag is distinguished from a tap by distance, not by timing — a 6px
   threshold. Timing-based versions feel broken on a phone, where a deliberate
   tap often lasts 200ms.
   ========================================================================= */

type Msg = {
  id: string
  sender: 'team' | 'admin'
  body: string
  created_at: string
  read_at: string | null
}

const POS_KEY = 'bingo-chat-pos-v2'
const DRAG_THRESHOLD = 6
// Bubble diameter used for clamping (the phone size; desktop is a touch
// bigger but the margin below absorbs it).
const BUBBLE = 56
const EDGE = 8
// Default spot: top-left, under the board header (title + progress line),
// where it covers no tile and no header control.
const DEFAULT = { x: EDGE, y: 96 }

/** Keep a point on screen with the bubble fully visible. */
function clamp(x: number, y: number) {
  const maxX = Math.max(EDGE, window.innerWidth - BUBBLE - EDGE)
  const maxY = Math.max(EDGE, window.innerHeight - BUBBLE - EDGE)
  return { x: Math.max(EDGE, Math.min(maxX, x)), y: Math.max(EDGE, Math.min(maxY, y)) }
}

export function SupportChat({
  sectionId, teamId, teamName, inline = false, demo = false,
  open: openProp, onOpenChange,
}: {
  sectionId: string; teamId: string; teamName?: string
  /** Anchored in the page (the board header, under the team name) instead of
   *  floating and draggable. Same panel, same messages. */
  inline?: boolean
  /** Sample board: nothing is saved. Messages stay on this screen and a
   *  canned marshal reply arrives after a moment, so the room sees the flow. */
  demo?: boolean
  /**
   * Optional controlled mode. Left undefined the bubble owns its own state, as
   * every player-facing use does; the Sample demo passes it so a paired phone
   * can open and close the chat on the projector.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openSelf, setOpenSelf] = useState(false)
  const open = openProp ?? openSelf
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    if (openProp === undefined) setOpenSelf(value)
    onOpenChange?.(value)
  }
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)

  // Position is remembered as a FRACTION of the viewport, so a spot chosen
  // on a phone in portrait is still on screen after rotating, and a desktop
  // choice does not land off-screen on a phone.
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (raw) {
        const f = JSON.parse(raw) as { fx: number; fy: number }
        return clamp(f.fx * window.innerWidth, f.fy * window.innerHeight)
      }
    } catch { /* private mode */ }
    return clamp(DEFAULT.x, DEFAULT.y)
  })

  // Re-clamp when the viewport changes (rotation, keyboard, resize).
  useEffect(() => {
    const onResize = () => setPos(p => clamp(p.x, p.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Inline mode: the bubble lives inside the header's stacking context, so
  // the panel is portalled to <body> and placed from the bubble's rect —
  // otherwise the board tiles paint over it.
  const bubbleRef = useRef<HTMLButtonElement>(null)
  const [panelAt, setPanelAt] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!inline || !open) { setPanelAt(null); return }
    const place = () => {
      const r = bubbleRef.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.min(340, window.innerWidth - 32)
      setPanelAt({ left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)), top: r.bottom + 8 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [inline, open])

  /* ── load + live updates ───────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (demo) return
    const { data } = await supabase
      .from('bingo_messages')
      .select('id, sender, body, created_at, read_at')
      .eq('team_id', teamId)
      .order('created_at')
    const rows = (data ?? []) as Msg[]
    setMsgs(rows)
    setUnread(rows.filter(m => m.sender === 'admin' && !m.read_at).length)
  }, [teamId, demo])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (demo) return
    const ch = supabase
      .channel(`chat-${teamId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_messages', filter: `team_id=eq.${teamId}` },
        () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [teamId, load, demo])

  // Mark the facilitator's replies read once the panel is actually open —
  // opening is the only reliable signal that a human saw them.
  useEffect(() => {
    if (!open || unread === 0) return
    if (demo) { setUnread(0); return }
    void supabase.from('bingo_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('team_id', teamId).eq('sender', 'admin').is('read_at', null)
      .then(() => setUnread(0))
  }, [open, unread, teamId])

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, open])

  /* ── drag ──────────────────────────────────────────────────────────── */
  const onPointerDown = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const x = e.clientX - d.dx
    const y = e.clientY - d.dy
    if (!d.moved) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      if (Math.hypot(x - r.left, y - r.top) < DRAG_THRESHOLD) return
      d.moved = true
    }
    // Clamped, or the bubble can be flicked off screen and never recovered.
    setPos(clamp(x, y))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ fx: pos.x / window.innerWidth, fy: pos.y / window.innerHeight }))
      } catch { /* private mode */ }
    } else {
      setOpen(o => !o)                       // a tap, not a drag
    }
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  /* ── send ──────────────────────────────────────────────────────────── */
  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft('')
    if (demo) {
      const now = new Date().toISOString()
      setMsgs(m => [...m, { id: `d-${Date.now()}`, sender: 'team', body, created_at: now, read_at: now }])
      window.setTimeout(() => {
        setMsgs(m => [...m, { id: `a-${Date.now()}`, sender: 'admin',
          body: 'Marshal here - got your message. (Demo: in the real game a facilitator replies from the admin page.)',
          created_at: new Date().toISOString(), read_at: null }])
        setUnread(u => u + 1)
      }, 1500)
      setSending(false)
      return
    }
    const { error } = await supabase.from('bingo_messages')
      .insert({ section_id: sectionId, team_id: teamId, sender: 'team', body })
    if (error) setDraft(body)                // put it back rather than lose it
    setSending(false)
  }

  const anchor: React.CSSProperties = inline
    ? { position: 'relative', display: 'inline-block' }
    : { position: 'fixed', zIndex: 60, left: pos.x, top: pos.y }
  // Panel opens toward whichever side has room. From the default top-left
  // spot (and the inline header spot) that is rightward and downward.
  const openLeft = inline ? false : pos.x > window.innerWidth / 2
  const openUp   = inline ? false : pos.y > window.innerHeight / 2

  return (
    <>
      <div style={anchor} className={inline ? 'z-30' : undefined}>
        {open && (() => { const panel = (
          <div
            className="w-[min(340px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-2xl overflow-hidden shadow-2xl"
            style={inline
              ? { position: 'fixed', zIndex: 70, left: panelAt?.left ?? 16, top: panelAt?.top ?? 100,
                  background: '#111c1a', border: '1px solid rgba(45,212,191,0.28)', visibility: panelAt ? 'visible' : 'hidden' }
              : {
                  position: 'absolute', zIndex: 50,
                  background: '#111c1a',
                  border: '1px solid rgba(45,212,191,0.28)',
                  [openLeft ? 'right' : 'left']: 0,
                  [openUp ? 'bottom' : 'top']: 58,
                } as React.CSSProperties}
          >
            <div className="px-4 py-3 flex items-center justify-between"
                 style={{ background: 'rgba(45,212,191,0.12)' }}>
              <div>
                <p className="text-teal-300 text-sm font-black">Need help?</p>
                <p className="text-white/40 text-[11px]">
                  {teamName ? `${teamName} · ` : ''}a marshal will reply here
                </p>
              </div>
              <button onClick={() => setOpen(false)}
                      className="text-white/50 hover:text-white text-xl leading-none px-1">×</button>
            </div>

            <div ref={listRef} className="px-3 py-3 space-y-2 overflow-y-auto"
                 style={{ maxHeight: 'min(45vh, 320px)' }}>
              {msgs.length === 0 && (
                <p className="text-white/35 text-xs text-center py-6">
                  Stuck, lost, or something broken? Send a message.
                </p>
              )}
              {msgs.map(m => (
                <div key={m.id} className={m.sender === 'team' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                    m.sender === 'team'
                      ? 'bg-teal-500/90 text-gray-950 font-medium rounded-br-sm'
                      : 'bg-white/10 text-white/90 rounded-bl-sm'}`}>
                    {m.body}
                    <span className={`block text-[10px] mt-1 ${
                      m.sender === 'team' ? 'text-gray-900/60' : 'text-white/35'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void send() }}
                placeholder="Type a message…"
                maxLength={500}
                className="flex-1 bg-white/5 text-white text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-teal-400/60 placeholder:text-white/25"
              />
              <button onClick={() => void send()} disabled={!draft.trim() || sending}
                      className="px-4 rounded-xl bg-teal-500 text-gray-950 font-black text-sm disabled:opacity-35">
                Send
              </button>
            </div>
          </div>
        ); return inline ? createPortal(panel, document.body) : panel })()}

        <button
          ref={bubbleRef}
          onPointerDown={inline ? undefined : onPointerDown}
          onPointerMove={inline ? undefined : onPointerMove}
          onPointerUp={inline ? undefined : onPointerUp}
          onClick={inline ? () => setOpen(o => !o) : undefined}
          aria-label={open ? 'Close help' : 'Open help'}
          className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full grid place-items-center shadow-xl active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg,#2dd4bf,#0d9488)', touchAction: inline ? undefined : 'none', cursor: inline ? 'pointer' : 'grab' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#04211c" strokeWidth="2.4"
               strokeLinecap="round" strokeLinejoin="round">
            {open
              ? <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
              : <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />}
          </svg>
          {unread > 0 && !open && (
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-black grid place-items-center border-2 border-gray-950">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>
    </>
  )
}

export default SupportChat
