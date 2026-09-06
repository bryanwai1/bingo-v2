import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStoredTheme, setStoredTheme, type ThemeMode } from '../lib/adminTheme'

// Fixed left navigation.
//
// The tab row it replaces put five destinations in one horizontal strip with
// settings scattered below them, so finding anything meant scanning and
// scrolling. A sidebar keeps every destination in the same place at every
// moment — which matters most for a trainer using this for the first time,
// mid-event, with a room watching.

export type AdminView = 'run' | 'board' | 'library' | 'teams' | 'submissions' | 'settings'

const NAV: { id: AdminView; icon: string; label: string; hint: string }[] = [
  { id: 'run',         icon: '▶',  label: 'Run Event',   hint: 'Start here' },
  { id: 'board',       icon: '🎲', label: 'Board',       hint: 'The 5×5 grid' },
  { id: 'library',     icon: '🃏', label: 'Cards',       hint: 'All challenges' },
  { id: 'teams',       icon: '👥', label: 'Teams',       hint: 'Rosters + scores' },
  { id: 'submissions', icon: '📸', label: 'Photos',      hint: 'Review evidence' },
  { id: 'settings',    icon: '⚙️',  label: 'Settings',    hint: 'Board options' },
]

export function AdminSidebar({ view, onView, email, isOwner, onSignOut, pending = 0 }: {
  view: AdminView
  onView: (v: AdminView) => void
  email?: string | null
  isOwner?: boolean
  onSignOut: () => void
  /** Unreviewed photo submissions — surfaced as a badge so they are not missed. */
  pending?: number
}) {
  const [mode, setMode] = useState<ThemeMode>('light')
  useEffect(() => { setMode(getStoredTheme()) }, [])
  const toggle = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    setMode(next); setStoredTheme(next)
  }

  return (
    <aside className="w-[236px] flex-shrink-0 h-screen sticky top-0 flex flex-col border-r a-border a-surface">
      <div className="px-5 py-5 border-b a-border">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="text-2xl">🎯</span>
          <span>
            <span className="block text-[15px] font-black a-text leading-tight">Bingo Dash</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] a-text-3">Admin</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(n => {
          const active = view === n.id
          return (
            <button
              key={n.id}
              onClick={() => onView(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                ${active
                  ? 'a-brand-bg a-text shadow-sm'
                  : 'a-text-2 hover:a-surface-2'}`}
              style={active ? undefined : {}}
            >
              <span className="text-lg leading-none w-5 text-center flex-shrink-0">{n.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-tight">{n.label}</span>
                <span className={`block text-[10px] leading-snug ${active ? 'a-text-2' : 'a-text-3'}`}>
                  {n.hint}
                </span>
              </span>
              {n.id === 'submissions' && pending > 0 && (
                <span className="a-live-bg a-text text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {pending}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="px-3 py-3 border-t a-border space-y-1">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl a-text-2 hover:a-surface-2 transition-colors"
        >
          <span className="text-lg w-5 text-center">{mode === 'dark' ? '☀️' : '🌙'}</span>
          <span className="text-sm font-bold">{mode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <div className="px-3 py-2.5 rounded-xl a-surface-2">
          <p className="text-[10px] uppercase tracking-widest a-text-3">Signed in</p>
          <p className="text-xs font-bold a-text truncate">{email}</p>
          {isOwner && (
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase"
                  style={{ background: 'var(--a-brand-soft)', color: 'var(--a-brand)' }}>
              Owner
            </span>
          )}
          <button onClick={onSignOut} className="mt-2 text-[11px] font-bold a-text-3 hover:a-text transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
