import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// A glowing blue-to-purple frame plus an "Observer" badge, drawn over every
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
  const [role, setRole] = useState<string | null>(storedRole)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    // The role is written at join time with no route change, so look again now and then.
    const tick = () => setRole(storedRole())
    tick()
    const id = window.setInterval(tick, 1000)
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => { window.clearInterval(id); window.removeEventListener('resize', onResize) }
  }, [pathname, search])

  const viaLink = new URLSearchParams(search).get('mode') === 'observer' && pathname.startsWith('/bingo-dash/play/')
  const show = viaLink || (role === 'observer' && isParticipantScreen(pathname, search))
  useEffect(() => {
    document.documentElement.classList.toggle('observer-on', show)
    return () => document.documentElement.classList.remove('observer-on')
  }, [show])
  if (!show) return null

  const { w, h } = size
  const i = 5      // distance from the screen edge
  const c = Math.min(22, w / 8)   // cut-corner size
  const pts = (d: number) => {
    const a = i + d, b = w - i - d, t = i + d, u = h - i - d, k = c
    return `${a + k},${t} ${b - k},${t} ${b},${t + k} ${b},${u - k} ${b - k},${u} ${a + k},${u} ${a},${u - k} ${a},${t + k}`
  }

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 2147483600, pointerEvents: 'none' }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="obs-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="0.5" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
          <filter id="obs-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <polygon points={pts(0)} fill="none" stroke="url(#obs-grad)" strokeWidth="2" opacity="0.45" />
        <polygon points={pts(5)} fill="none" stroke="url(#obs-grad)" strokeWidth="2.5" filter="url(#obs-glow)" strokeLinejoin="round" />
      </svg>
      <div
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 22 }}
        className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-blue-300/60 text-blue-100 text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_14px_rgba(96,165,250,0.7)]"
      >
        👁 Observer
      </div>
    </div>
  )
}
