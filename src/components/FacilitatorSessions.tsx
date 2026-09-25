import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { errText } from '../lib/errText'
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
      style={{ background: 'var(--a-brand)', color: '#fff' }} className="px-3 py-2 rounded-xl text-xs font-black transition-opacity hover:opacity-90 flex-shrink-0">
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
      setNotice(`Could not create session: ${errText(err)}`)
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
      setNotice(`Could not end session: ${errText(err)}`)
    } finally { setBusyId(null) }
  }

  /**
   * Edit a live pass in place. The table's single `for all` policy already
   * lets a host update their own rows, so these are plain writes — no RPC.
   *
   * Without them a pass was write-once: the only way to add a seat, fix a
   * typo in the label or buy another hour was to issue a NEW pass, which
   * means a new link and a new PIN for a crew already mid-event. The
   * "all seats taken" screen even tells facilitators to ask the organiser
   * for more seats, which the organiser had no way to grant.
   */
  const patchSession = async (s: BingoFacilitatorSession, patch: Partial<BingoFacilitatorSession>, what: string) => {
    setBusyId(s.id)
    setNotice('')
    try {
      const { error } = await supabase.from('bingo_facilitator_sessions')
        .update(patch).eq('id', s.id)
      if (error) { setNotice(`Could not ${what}: ${errText(error)}`); return }
      await load()
    } finally { setBusyId(null) }
  }

  const renameSession = async (s: BingoFacilitatorSession) => {
    const next = window.prompt('Rename this pass', s.label ?? '')
    if (next === null) return
    const label = next.trim()
    if (!label || label === s.label) return
    await patchSession(s, { label }, 'rename the pass')
  }

  /** Extend from whichever is later — now, or the current expiry. */
  const extendSession = async (s: BingoFacilitatorSession, hours: number) => {
    const base = Math.max(Date.now(), new Date(s.expires_at).getTime())
    const expires_at = new Date(base + hours * 3600_000).toISOString()
    await patchSession(s, { expires_at }, 'extend the pass')
  }

  const setSeats = async (s: BingoFacilitatorSession) => {
    const current = s.max_uses == null ? '' : String(s.max_uses)
    const next = window.prompt('How many people may use this pass? Leave blank for unlimited.', current)
    if (next === null) return
    const trimmed = next.trim()
    const n = trimmed === '' ? null : Math.max(1, Math.round(Number(trimmed)))
    if (trimmed !== '' && !Number.isFinite(n as number)) {
      setNotice('Seats must be a whole number, or blank for unlimited.')
      return
    }
    if (n !== null && n < s.uses) {
      setNotice(`${s.uses} people have already joined — seats cannot go below that.`)
      return
    }
    await patchSession(s, { max_uses: n }, 'change the seats')
  }

  /**
   * Drop ONE facilitator without closing the pass for everyone else.
   * Mirrors the owner's "End access now" on the Accounts page; expiry is
   * enforced by bingo_can_write() comparing now() to access_expires_at.
   */
  const removeCrewMember = async (a: BingoAccount) => {
    const who = a.display_name || a.email || 'this person'
    if (!window.confirm(`Remove ${who} from this pass? They lose access immediately.`)) return
    setBusyId(a.id)
    setNotice('')
    try {
      const { error } = await supabase.from('bingo_accounts')
        .update({ access_expires_at: new Date().toISOString() }).eq('id', a.id)
      if (error) { setNotice(`Could not remove ${who}: ${errText(error)}`); return }
      await load()
    } finally { setBusyId(null) }
  }

  const deleteSession = async (s: BingoFacilitatorSession) => {
    const dead = s.revoked || new Date(s.expires_at).getTime() <= Date.now()
    if (!dead && !window.confirm(
      `Delete "${s.label}"? It is still live — anyone using it right now loses access immediately.`
    )) return
    setBusyId(s.id)
    try {
      const { error } = await supabase.from('bingo_facilitator_sessions').delete().eq('id', s.id)
      if (error) { setNotice(`Could not delete pass: ${errText(error)}`); return }
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
          className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider a-text-2 border a-border hover:a-surface-2 transition-colors flex-shrink-0">
          Refresh
        </button>
      </div>
      <p className="a-text-3 text-xs mb-4">
        For <b className="a-text">your own crew</b>. Create a pass, send the link + PIN to the group,
        and everyone lands on <b className="a-text">your</b> boards — same teams, same scoreboard.
        No sign-up, no approval, and access dies on its own when the pass expires.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={newLabel} onChange={e => setNewLabel(e.target.value)}
          placeholder="Event name (e.g. Nestlé KL — 15 Aug)"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl a-surface border-2 a-border a-text text-sm placeholder:text-[color:var(--a-text-3)] focus:border-[color:var(--a-brand)] outline-none transition-colors"
        />
        <select value={newHours} onChange={e => setNewHours(Number(e.target.value))}
          className="px-3 py-2 rounded-xl a-surface border-2 a-border a-text text-sm focus:border-[color:var(--a-brand)] outline-none transition-colors">
          {SESSION_DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
        </select>
        <input
          value={newSeats} onChange={e => setNewSeats(e.target.value.replace(/\D/g, ''))}
          placeholder="Seats" inputMode="numeric"
          title="Maximum facilitators — leave blank for unlimited"
          className="w-20 px-3 py-2 rounded-xl a-surface border-2 a-border a-text text-sm placeholder:text-[color:var(--a-text-3)] focus:border-[color:var(--a-brand)] outline-none transition-colors"
        />
        {hostOptions.length > 1 && (
          <select value={newHost || me?.id || ''} onChange={e => setNewHost(e.target.value)}
            title="Whose boards this crew works on"
            className="px-3 py-2 rounded-xl a-surface border-2 a-border a-text text-sm focus:border-[color:var(--a-brand)] outline-none transition-colors">
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

      {notice && <p className="text-sm font-medium mb-3" style={{ color: 'var(--a-danger)' }}>{notice}</p>}

      {loading ? (
        <p className="a-text-3 text-sm animate-pulse">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="a-text-3 text-sm">No sessions yet — create one before your next event.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map(s => {
            const crew = accounts.filter(a => a.facilitator_session_id === s.id)
            const dead = s.revoked || new Date(s.expires_at).getTime() <= Date.now()
            const hostName = accounts.find(a => a.id === s.host_id)
            return (
              <div key={s.id} className={`px-4 py-3 rounded-2xl border ${
                dead ? 'a-surface-2 a-border opacity-70' : 'a-surface a-border'
              }`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="a-text font-bold text-sm">{s.label}</p>
                    <p className="text-xs a-text-3 mt-0.5">
                      {dead
                        ? <span style={{ color: 'var(--a-danger)' }}>{s.revoked ? 'Closed' : 'Expired'} · {fmtExpiry(s.expires_at)}</span>
                        : <>Ends {fmtExpiry(s.expires_at)}</>}
                      {' · '}{s.uses}{s.max_uses ? `/${s.max_uses}` : ''} joined
                      {hostOptions.length > 1 && s.host_id !== me?.id && <> · for {hostName?.email ?? 'another account'}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                    {!dead && (
                      <>
                        <CopyButton text={shareText(s)} label="Copy invite" />
                        <button onClick={() => renameSession(s)} disabled={busyId === s.id}
                          title="Rename this pass"
                          className="px-2.5 py-2 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2 transition-colors disabled:opacity-50">
                          ✎ Rename
                        </button>
                        <button onClick={() => extendSession(s, 4)} disabled={busyId === s.id}
                          title="Push the end time four hours later"
                          className="px-2.5 py-2 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2 transition-colors disabled:opacity-50">
                          +4h
                        </button>
                        <button onClick={() => extendSession(s, 24)} disabled={busyId === s.id}
                          title="Push the end time a day later"
                          className="px-2.5 py-2 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2 transition-colors disabled:opacity-50">
                          +24h
                        </button>
                        <button onClick={() => setSeats(s)} disabled={busyId === s.id}
                          title="Change how many people may use this pass"
                          className="px-2.5 py-2 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2 transition-colors disabled:opacity-50">
                          🎫 Seats
                        </button>
                        <button onClick={() => endSession(s)} disabled={busyId === s.id}
                          title="Close the pass and immediately sign out everyone who joined it"
                          className="px-3 py-2 rounded-xl text-xs font-black a-surface-2 hover:bg-red-500/80 a-text transition-colors disabled:opacity-50">
                          End session
                        </button>
                      </>
                    )}
                    {/* Deleting a LIVE pass is allowed now, behind a confirm.
                        Previously Delete only appeared once the pass was dead,
                        so a mistyped pass could only be ended, never removed. */}
                    <button onClick={() => deleteSession(s)} disabled={busyId === s.id}
                      className="px-3 py-2 rounded-xl text-xs font-bold a-text-2 border a-border hover:bg-red-500/60 transition-colors disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                </div>

                {!dead && (
                  <div className="flex items-center gap-2 mt-3">
                    <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-xl a-surface-2 border a-border a-text-2 text-xs">
                      {crewUrl(s.code)}
                    </code>
                    <div className="px-3 py-2 rounded-xl flex-shrink-0"
                      style={{ background: 'var(--a-live-soft)', border: '1px solid var(--a-live)' }}>
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-80" style={{ color: 'var(--a-live)' }}>PIN </span>
                      <span className="font-black tracking-[0.2em] text-sm" style={{ color: 'var(--a-live)' }}>{s.pin}</span>
                    </div>
                  </div>
                )}

                {crew.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t a-border">
                    <span className="text-[11px] a-text-3 font-bold uppercase tracking-widest mr-1">Crew:</span>
                    {crew.map(c => {
                      const gone = !!c.access_expires_at && new Date(c.access_expires_at).getTime() <= Date.now()
                      return (
                        <span key={c.id}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border a-border inline-flex items-center gap-1 ${
                            gone ? 'a-surface-2 a-text-3 line-through' : 'a-surface-2 a-text-2'
                          }`}>
                          {c.display_name || c.email || 'guest'}
                          {/* Drop one person without closing the pass for the
                              rest of the crew — previously all-or-nothing. */}
                          {!gone && !dead && (
                            <button onClick={() => removeCrewMember(c)} disabled={busyId === c.id}
                              title={`Remove ${c.display_name || c.email || 'this person'} from this pass`}
                              aria-label="Remove from pass"
                              className="a-text-3 hover:opacity-70 transition-opacity disabled:opacity-40">
                              &times;
                            </button>
                          )}
                        </span>
                      )
                    })}
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
