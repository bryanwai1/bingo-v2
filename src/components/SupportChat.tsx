import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { normalizeHelp, hasHelp, usableContacts, telHref, waHref, type HelpInfo } from '../lib/helpInfo'

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
const SEEN_KEY = 'bingo-help-pin-seen:'
// Sample board: shown when the demo board has no real contacts of its own.
const DEMO_HELP: HelpInfo = normalizeHelp({
  contacts: [{ label: 'Marshal', name: 'Ahmad', phone: '012-345 6789', whatsapp: true }],
  pin: 'Regroup at the fountain at 3:00 pm. Stay with your team.',
  pinAt: '2000-01-01T00:00:00Z',
})
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
  const [help, setHelp] = useState<HelpInfo>(() => normalizeHelp(null))
  const [seenPin, setSeenPin] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY + sectionId) ?? '' } catch { return '' }
  })
  const [copied, setCopied] = useState('')

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

  // Emergency contacts + pinned message live on the board (section) row.
  useEffect(() => {
    if (sectionId === 'demo') return
    let cancelled = false
    void supabase.from('bingo_sections').select('help_info').eq('id', sectionId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setHelp(normalizeHelp((data as { help_info?: unknown }).help_info)) })
    const ch = supabase.channel(`help-${sectionId}-${teamId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `id=eq.${sectionId}` },
        payload => setHelp(normalizeHelp((payload.new as { help_info?: unknown }).help_info)))
      .subscribe()
    return () => { cancelled = true; void supabase.removeChannel(ch) }
  }, [sectionId, teamId])

  const shownHelp = demo && !hasHelp(help) ? DEMO_HELP : help
  const showStrip = hasHelp(shownHelp)
  const pinIsNew = !!shownHelp.pin && !!shownHelp.pinAt && shownHelp.pinAt !== seenPin
  // Opening the chat is what counts as reading the pin.
  useEffect(() => {
    if (!open || !pinIsNew || !shownHelp.pinAt) return
    const at = shownHelp.pinAt
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the chat is the external event that marks the pin read
    setSeenPin(at)
    try { localStorage.setItem(SEEN_KEY + sectionId, at) } catch { /* private mode */ }
  }, [open, pinIsNew, shownHelp.pinAt, sectionId])
  const copyNumber = (phone: string) => {
    void navigator.clipboard?.writeText(phone).then(() => {
      setCopied(phone)
      window.setTimeout(() => setCopied(c => (c === phone ? '' : c)), 1500)
    }).catch(() => { /* clipboard blocked: the Call button still works */ })
  }

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

            {showStrip && (
              <div className="px-2.5 py-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: '32vh', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {shownHelp.pin && (
                  <div className="flex items-start gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>
                    <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Pinned">
                      <path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
                    </svg>
                    <p className="text-white/90 text-xs leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">{shownHelp.pin}</p>
                  </div>
                )}
                {usableContacts(shownHelp).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg pl-2.5 pr-1.5 py-1.5" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[13px] font-bold leading-tight truncate">
                        <span className="text-red-300 text-[10px] font-black uppercase tracking-wider mr-1.5">{c.label || 'Emergency'}</span>{c.name}
                      </p>
                      <button type="button" onClick={() => copyNumber(c.phone)}
                        className="text-white/60 text-[11px] tabular-nums underline decoration-dotted">
                        {copied === c.phone ? 'Copied' : c.phone}
                      </button>
                    </div>
                    <a href={telHref(c.phone)} aria-label={`Call ${c.name}`} title="Call"
                      className="w-9 h-9 shrink-0 rounded-full bg-red-500 grid place-items-center">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                      </svg>
                    </a>
                    {c.whatsapp && (
                      <a href={waHref(c.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name}`} title="WhatsApp"
                        className="w-9 h-9 shrink-0 rounded-full bg-[#25D366] grid place-items-center">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="#fff">
                          <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.4-.5c.1-.1.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-2.9-.4-4.1-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
                        </svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div ref={listRef} className="px-3 py-3 space-y-2 overflow-y-auto"
                 style={{ maxHeight: showStrip ? 'min(34vh, 240px)' : 'min(45vh, 320px)' }}>
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
          {unread === 0 && !open && pinIsNew && (
            <span aria-label="New pinned message" className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-gray-950" />
          )}
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
