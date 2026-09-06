import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// The admin header, grouped rather than a wall of buttons.
//
// At a live event the facilitator is standing in front of a room, often
// mid-sentence, looking for one control. Seven equal-weight buttons in a row
// means scanning all seven every time. So: the things touched constantly stay
// visible, and everything else lives behind a labelled menu that opens on
// click. Fewer things on screen, faster to find the one you want.

function Menu({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside and Escape both close it — a menu you cannot dismiss is
  // worse than no menu when you are being watched by a room.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
          ${open
            ? 'a-surface-2 a-text ring-1 ring-white/25'
            : 'a-text-2 hover:a-text hover:a-surface-2'}`}
      >
        <span className="text-base leading-none">{icon}</span>
        {label}
        <span className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full mt-2 z-50 min-w-[230px] rounded-2xl border a-border
                     a-bg/98 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden animate-menu"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, label, hint, to, href, onClick }: {
  icon: string; label: string; hint?: string
  to?: string; href?: string; onClick?: () => void
}) {
  const inner = (
    <span className="flex items-start gap-3 px-4 py-3 hover:a-surface-2 transition-colors w-full text-left">
      <span className="text-lg leading-none mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold a-text leading-tight">{label}</span>
        {hint && <span className="block text-[11px] a-text-3 leading-snug mt-0.5">{hint}</span>}
      </span>
    </span>
  )
  if (to)   return <Link to={to} className="block">{inner}</Link>
  if (href) return <a href={href} target="_blank" rel="noreferrer" className="block">{inner}</a>
  return <button onClick={onClick} className="block w-full">{inner}</button>
}

export function MenuDivider() {
  return <div className="h-px a-surface-2 mx-3 my-1" />
}

export { Menu }
