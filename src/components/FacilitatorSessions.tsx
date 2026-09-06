import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import type { BingoAccount, BingoFacilitatorSession } from '../types/database'

/**
 * Crew passes — create/share/end the `/bingo-dash/join-crew` links.
 *
 * Rendered on two surfaces: the owner's Accounts page (where the host picker
 * lets them issue a pass on any tenant's behalf) and a trainer lead's own Crew
 * page (where the only possible host is themselves). The difference is data,
 * not code: `create_facilitator_session` already refuses a host other than
 * `auth.uid()` unless the caller is the owner, and the table's RLS shows a sub
 * only their own passes — so the same component is correct for both.
 */

/** How long a crew pass stays open. Most events fit inside a working day. */
const SESSION_DURATIONS = [
  { label: '4 hours',  hours: 4 },
  { label: '8 hours',  hours: 8 },
  { label: '12 hours', hours: 12 },
  { label: '24 hours', hours: 24 },
  { label: '2 days',   hours: 48 },
]

const fmtExpiry = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

const crewUrl = (code: string) => `${window.location.origin}/bingo-dash/join-crew/${code}`

/** One paste into the crew's WhatsApp group — link and PIN travel together. */
const shareText = (s: BingoFacilitatorSession) =>
  `${s.label} — facilitator access\n${crewUrl(s.code)}\nPIN: ${s.pin}\n\nOpen the link, enter your name and the PIN. Access ends ${fmtExpiry(s.expires_at)}.`

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="px-3 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 a-text transition-colors flex-shrink-0">
      {copied ? '✓ Copied' : label}
    </button>
  )
}

export function FacilitatorSessions() {
  const { account: me } = useBingoAuth()
  const [sessions, setSessions] = useState<BingoFacilitatorSession[]>([])
  const [accounts, setAccounts] = useState<BingoAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newHost, setNewHost] = useState('')
  const [newHours, setNewHours] = useState(12)
  const [newSeats, setNewSeats] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    // RLS does the scoping for us: the owner reads every pass and every
    // account, a lead reads only their own passes and the crew sitting on them.
    const [sessionsRes, accountsRes] = await Promise.all([
      supabase.from('bingo_facilitator_sessions').select('*').order('created_at', { ascending: false }),
      supabase.from('bingo_accounts').select('*'),
    ])
    if (sessionsRes.data) setSessions(sessionsRes.data as BingoFacilitatorSession[])
    if (accountsRes.data) setAccounts(accountsRes.data as BingoAccount[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // The Accounts page used to refresh this panel through its own
    // bingo_accounts subscription; keep that live-roster behaviour now that the
    // panel owns its data, so a host watching the page sees crew arrive without
    // reaching for Refresh.
    const channel = supabase
      .channel('bingo-crew-passes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_accounts' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // Whose boards a pass can point at. For a lead this resolves to just
  // themselves, which hides the picker below.
  const hostOptions = accounts.filter(a =>
    a.role === 'owner' || (a.status === 'approved' && !a.facilitator_host))

  const createSession = async () => {
    setCreating(true)
    setNotice('')
    try {
      const seats = Number(newSeats)
      const { error } = await supabase.rpc('create_facilitator_session', {
        p_label: newLabel.trim() || 'Event session',
        p_host: newHost || me?.id,
        p_hours: newHours,
        p_max_uses: Number.isFinite(seats) && seats > 0 ? seats : null,
      })
      if (error) throw error
      setNewLabel(''); setNewSeats('')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? `Could not create session: ${err.message}` : 'Could not create session')
    } finally { setCreating(false) }
  }

  const endSession = async (s: BingoFacilitatorSession) => {
    setBusyId(s.id)
    setNotice('')
    try {
      const { error } = await supabase.rpc('end_facilitator_session', { p_id: s.id })
      if (error) throw error
      setNotice(`"${s.label}" closed — every facilitator on that pass has been signed out of your boards.`)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? `Could not end session: ${err.message}` : 'Could not end session')
    } finally { setBusyId(null) }
  }

  const deleteSession = async (s: BingoFacilitatorSession) => {
    setBusyId(s.id)
    try {
      await supabase.from('bingo_facilitator_sessions').delete().eq('id', s.id)
      await load()
    } finally { setBusyId(null) }
  }

  return (
    <section className="px-4 py-4 rounded-2xl bg-sky-400/5 border border-sky-400/20">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="a-text text-sm font-black uppercase tracking-widest">
          🎪 Facilitator sessions
        </h2>
        <button onClick={() => { setLoading(true); load() }}
          title="Check who has joined since this page loaded"
          className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider a-text-2 border border-white/15 hover:a-surface-2 transition-colors flex-shrink-0">
          Refresh
        </button>
      </div>
      <p className="text-gray-400 text-xs mb-4">
        For <b className="text-gray-300">your own crew</b>. Create a pass, send the link + PIN to the group,
        and everyone lands on <b className="text-gray-300">your</b> boards — same teams, same scoreboard.
        No sign-up, no approval, and access dies on its own when the pass expires.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={newLabel} onChange={e => setNewLabel(e.target.value)}
          placeholder="Event name (e.g. Nestlé KL — 15 Aug)"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-black/30 border-2 border-white/15 a-text text-sm placeholder-white/25 focus:border-sky-500 outline-none transition-colors"
        />
        <select value={newHours} onChange={e => setNewHours(Number(e.target.value))}
          className="px-3 py-2 rounded-xl bg-black/30 border-2 border-white/15 a-text text-sm focus:border-sky-500 outline-none transition-colors">
          {SESSION_DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
        </select>
        <input
          value={newSeats} onChange={e => setNewSeats(e.target.value.replace(/\D/g, ''))}
          placeholder="Seats" inputMode="numeric"
          title="Maximum facilitators — leave blank for unlimited"
          className="w-20 px-3 py-2 rounded-xl bg-black/30 border-2 border-white/15 a-text text-sm placeholder-white/25 focus:border-sky-500 outline-none transition-colors"
        />
        {hostOptions.length > 1 && (
          <select value={newHost || me?.id || ''} onChange={e => setNewHost(e.target.value)}
            title="Whose boards this crew works on"
            className="px-3 py-2 rounded-xl bg-black/30 border-2 border-white/15 a-text text-sm focus:border-sky-500 outline-none transition-colors">
            {hostOptions.map(h => (
              <option key={h.id} value={h.id}>
                {h.id === me?.id ? 'My boards' : h.email ?? h.id}
              </option>
            ))}
          </select>
        )}
        <button onClick={createSession} disabled={creating}
          className="px-4 py-2 rounded-xl text-xs font-black bg-sky-600 hover:bg-sky-500 a-text transition-colors disabled:opacity-50">
          {creating ? 'Creating…' : '+ New session'}
        </button>
      </div>

      {notice && <p className="text-amber-300 text-sm font-medium mb-3">{notice}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm animate-pulse">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions yet — create one before your next event.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map(s => {
            const crew = accounts.filter(a => a.facilitator_session_id === s.id)
            const dead = s.revoked || new Date(s.expires_at).getTime() <= Date.now()
            const hostName = accounts.find(a => a.id === s.host_id)
            return (
              <div key={s.id} className={`px-4 py-3 rounded-2xl border ${
                dead ? 'bg-white/[0.02] a-border opacity-60' : 'bg-black/20 border-sky-400/25'
              }`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="a-text font-bold text-sm">{s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {dead
                        ? <span className="text-red-300">{s.revoked ? 'Closed' : 'Expired'} · {fmtExpiry(s.expires_at)}</span>
                        : <>Ends {fmtExpiry(s.expires_at)}</>}
                      {' · '}{s.uses}{s.max_uses ? `/${s.max_uses}` : ''} joined
                      {hostOptions.length > 1 && s.host_id !== me?.id && <> · for {hostName?.email ?? 'another account'}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!dead && (
                      <>
                        <CopyButton text={shareText(s)} label="Copy invite" />
                        <button onClick={() => endSession(s)} disabled={busyId === s.id}
                          title="Close the pass and immediately sign out everyone who joined it"
                          className="px-3 py-2 rounded-xl text-xs font-black a-surface-2 hover:bg-red-500/80 a-text transition-colors disabled:opacity-50">
                          End session
                        </button>
                      </>
                    )}
                    {dead && (
                      <button onClick={() => deleteSession(s)} disabled={busyId === s.id}
                        className="px-3 py-2 rounded-xl text-xs font-bold a-text-2 border border-white/20 hover:a-surface-2 transition-colors disabled:opacity-50">
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {!dead && (
                  <div className="flex items-center gap-2 mt-3">
                    <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-xl bg-black/40 border a-border text-gray-300 text-xs">
                      {crewUrl(s.code)}
                    </code>
                    <div className="px-3 py-2 rounded-xl bg-amber-400/15 border border-amber-400/40 flex-shrink-0">
                      <span className="text-[10px] text-amber-200/70 font-black uppercase tracking-wider">PIN </span>
                      <span className="text-amber-200 font-black tracking-[0.2em] text-sm">{s.pin}</span>
                    </div>
                  </div>
                )}

                {crew.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t a-border">
                    <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mr-1">Crew:</span>
                    {crew.map(c => (
                      <span key={c.id} className="px-2 py-0.5 rounded-full text-[11px] font-bold a-surface-2 text-gray-300 border a-border">
                        {c.display_name || c.email || 'guest'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
