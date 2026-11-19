import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'

// The board's public join link as a QR, openable at any time on a projector.
// Players pick their group, type a name and the group password. Observers pick
// the group they watch and type a name. Nothing about a team is in the link.
export type JoinRole = 'player' | 'observer'
export const joinLinkFor = (slug: string, role: JoinRole = 'player') =>
  `${window.location.origin}/bingo-dash/play/${slug}${role === 'observer' ? '?mode=observer' : ''}`

/** The board's join QR with a Players / Observers toggle, like the admin Join Links page: same two links. */
export function JoinLinkButton({ slug, boardName, className }: { slug?: string | null; boardName?: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<JoinRole>('player')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [open])
  if (!slug) return null
  const url = joinLinkFor(slug, role)
  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  const tab = (r: JoinRole, label: string, on: string) => (
    <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
      className={`flex-1 min-h-[44px] rounded-xl text-sm font-black transition-colors ${role === r ? on : 'text-white/60 hover:bg-white/10'}`}>
      {label}
    </button>
  )
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={className ?? "flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/15 active:scale-95 transition-all"}>
        <span className="leading-none">▦</span>
        Join Link
      </button>
      {open && createPortal(
        <div role="dialog" aria-modal="true" onClick={() => setOpen(false)} style={{ zIndex: 2147483000 }}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm overflow-y-auto animate-rise">
          <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-4 py-6">
            <div onClick={e => e.stopPropagation()} className="w-full max-w-[360px] flex flex-col items-center gap-4">
              <div className="text-center">
                <p className="text-white font-black text-xl">Join Links</p>
                {boardName && <p className="text-white/60 text-sm">For <span className="font-bold text-white/80">{boardName}</span></p>}
              </div>
              <div className="w-full flex gap-1 p-1 rounded-2xl bg-white/10 border border-white/15" role="group" aria-label="Who is joining">
                {tab('player', '🎯 Players', 'bg-amber-300 text-gray-950')}
                {tab('observer', '👁 Observers', 'bg-blue-400 text-gray-950')}
              </div>
              <div className="bg-white p-4 rounded-3xl shadow-2xl">
                <QRCodeSVG value={url} size={240} level="H" />
              </div>
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white/10 border border-white/15 text-xs font-mono text-white/70 break-all select-all">{url}</div>
                <button type="button" onClick={copy} className="min-h-[44px] px-3 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold flex-shrink-0">
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <button onClick={() => setOpen(false)}
              className="min-h-[44px] px-6 rounded-2xl border border-white/25 text-white/80 text-sm font-bold hover:bg-white/10 transition-colors">
              Close
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Full-screen Join QR driven from outside (the phone remote). Tap or Esc on the big screen closes it. */
export function JoinQrOverlay({ slug, boardName, role, onClose }: {
  slug: string; boardName?: string | null; role: JoinRole; onClose?: () => void
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const url = joinLinkFor(slug, role)
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ zIndex: 2147483000 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-rise">
      <p className={`mb-4 px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-widest ${role === 'observer' ? 'bg-blue-400/20 text-blue-300' : 'bg-amber-300/20 text-amber-300'}`}>
        {role === 'observer' ? '👁 Observer' : '🎮 Player'} join
      </p>
      <div className="bg-white p-5 rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <QRCodeSVG value={url} size={320} level="H" />
      </div>
      {boardName && <p className="text-white font-black text-xl mt-5">{boardName}</p>}
      <p className="text-white/50 text-sm mt-2">Scan to join · {url.replace(/^https?:\/\//, '')}</p>
    </div>,
    document.body,
  )
}
