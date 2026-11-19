import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// A single glowing blue line hugging the screen edge plus an "Observer" badge, drawn over every
// screen a team observer sees, so a glance at someone's phone tells you they
// are watching rather than playing.
//
// It is a single overlay mounted once at the router, not something each page
// remembers to render, so a new screen cannot forget it. It never takes
// touches (pointer-events: none) and sits above every popup, including the QR
// dialog (z 2147483000).
//
// Who counts as an observer: the join screen records the role in localStorage
// under this key once someone joins (BingoDashJoin.tsx); the join link itself
// (?mode=observer) covers the screen before that. Admin, crew and slide pages
// never show it, even on a phone that once joined as an observer.

const ROLE_KEY = 'bingo-dash-member-role'

function storedRole(): string | null {
  try { return localStorage.getItem(ROLE_KEY) } catch { return null }
}

function hasTeam(): boolean {
  try { return !!localStorage.getItem('bingo-dash-team-id') } catch { return false }
}

/** Screens a participant uses. The scoreboard only counts as theirs in ?view=player. */
function isParticipantScreen(path: string, search: string): boolean {
  if (path === '/bingo-dash' || path === '/bingo-dash/') return true
  if (path.startsWith('/bingo-dash/play/')) return true
  if (path.startsWith('/bingo-dash/task/')) return true
  if (path.startsWith('/bingo-dash/projector')) return new URLSearchParams(search).get('view') === 'player'
  return false
}

export function ObserverFrame() {
  const { pathname, search } = useLocation()
  // A saved "observer" role alone is not enough: it outlives leaving the team and
  // is easily left behind on a browser that once scanned an observer link (an
  // admin's, say). Only someone who is on a team right now is an observer.
  const [isObserver, setIsObserver] = useState(() => storedRole() === 'observer' && hasTeam())
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The role and team are written at join time with no route change, so look again now and then.
    const tick = () => setIsObserver(storedRole() === 'observer' && hasTeam())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [pathname, search])

  const viaLink = new URLSearchParams(search).get('mode') === 'observer' && pathname.startsWith('/bingo-dash/play/')
  const show = viaLink || (isObserver && isParticipantScreen(pathname, search))
  useEffect(() => {
    document.documentElement.classList.toggle('observer-on', show)
    return () => document.documentElement.classList.remove('observer-on')
  }, [show])

  // Pinch-zoom changes the visual viewport (what is on screen) without moving
  // the layout viewport a fixed element is attached to, and fires no window
  // resize. So the frame is sized and placed from the visual viewport and
  // counter-scaled: it always hugs the edge of the screen at the same thickness.
  useEffect(() => {
    if (!show) return
    const vv = window.visualViewport
    const place = () => {
      const el = box.current
      if (!el) return
      const s = vv?.scale ?? 1
      const w = (vv?.width ?? window.innerWidth) * s
      const h = (vv?.height ?? window.innerHeight) * s
      el.style.width = w + 'px'
      el.style.height = h + 'px'
      el.style.transform = 'translate(' + (vv?.offsetLeft ?? 0) + 'px,' + (vv?.offsetTop ?? 0) + 'px) scale(' + 1 / s + ')'
    }
    place()
    vv?.addEventListener('resize', place)
    vv?.addEventListener('scroll', place)
    window.addEventListener('resize', place)
    return () => {
      vv?.removeEventListener('resize', place)
      vv?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  }, [show])
  if (!show) return null

  return (
    <div
      ref={box} aria-hidden="true"
      style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100dvh', transformOrigin: '0 0', zIndex: 2147483600, pointerEvents: 'none' }}
    >
      {/* One blue line on the very edge, rounded like the phone's own corners. */}
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 44, boxSizing: 'border-box',
          border: '2px solid #4da3ff',
          boxShadow: '0 0 8px 1px rgba(77,163,255,0.8), inset 0 0 10px 1px rgba(77,163,255,0.65)',
        }}
      />
      <div
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 22 }}
        className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-blue-300/60 text-blue-100 text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_14px_rgba(96,165,250,0.7)]"
      >
        👁 Observer
      </div>
    </div>
  )
}
