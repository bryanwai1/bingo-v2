import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { errText } from '../lib/errText'
import type { BingoSection } from '../types/database'

// Shared events — two or more renters running one training day together.
//
// Isolation is still the default. Joining an event grants READ ONLY sight of
// the other members' contributed boards, plus a combined scoreboard that totals
// every team across every tenant in the event. Nobody can edit anyone else's
// data here; for shared control the crew pass is the (deliberately riskier)
// tool.
//
// An event has no expiry, deliberately — unlike a crew pass, which self
// destructs. It runs until someone archives it, which is what Archive is for.

type EventRow = { id: string; name: string; code: string; created_by: string | null; archived: boolean }
type Score = {
  event_id: string; team_id: string; team_name: string
  section_id: string; section_name: string; tenant_id: string | null
  tile_points: number; duel_bonus: number; manual_bonus: number
  total_points: number; tiles_done: number
  // Surfaced by the view since the per-line scoring rewrite. Showing them is
  // the only way a partner can see WHY a total jumped.
  bingo_lines: number; line_bonus: number
}
type Member = {
  account_id: string
  status: string
  account: { id: string; email: string | null; display_name: string | null } | null
}

const fmtPts = (n: number) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1)
}

export function BingoDashEvents() {
  const { account } = useBingoAuth()
  const [events, setEvents] = useState<EventRow[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [myBoards, setMyBoards] = useState<BingoSection[]>([])
  const [contributed, setContributed] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [copied, setCopied] = useState(false)

  const say = (text: string, bad = false) => { setMsg(text); setIsError(bad) }

  // No `active` dependency: it was only here for the default-selection guard,
  // which made the callback identity change on every event switch and refetch
  // the whole list each time. The guard uses the functional form instead.
  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('bingo_events')
      .select('*').order('created_at', { ascending: false })
    if (error) { say(`Could not load events: ${errText(error)}`, true); return }
    const rows = (data as EventRow[]) ?? []
    setEvents(rows)
    setActive(prev => {
      if (prev && rows.some(r => r.id === prev)) return prev
      return rows.find(r => !r.archived)?.id ?? null
    })
  }, [])

  const loadBoards = useCallback(async () => {
    const { data, error } = await supabase.from('bingo_sections').select('*').order('sort_order')
    if (error) { say(`Could not load boards: ${errText(error)}`, true); return }
    setMyBoards((data as BingoSection[]) ?? [])
  }, [])

  const loadDetail = useCallback(async (eventId: string) => {
    const [{ data: sc }, { data: eb }, { data: mem }] = await Promise.all([
      supabase.from('event_scoreboard').select('*').eq('event_id', eventId),
      supabase.from('bingo_event_boards').select('section_id').eq('event_id', eventId),
      supabase.from('bingo_event_members')
        .select('account_id, status, account:bingo_accounts(id, email, display_name)')
        .eq('event_id', eventId),
    ])
    setScores(((sc as Score[]) ?? []).sort((a, b) => b.total_points - a.total_points))
    setContributed(new Set((eb ?? []).map(r => r.section_id as string)))
    setMembers((mem as unknown as Member[]) ?? [])
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await Promise.all([loadEvents(), loadBoards()])
      setLoading(false)
    })()
  }, [loadEvents, loadBoards])

  useEffect(() => { if (active) void loadDetail(active) }, [active, loadDetail])

  // A combined scoreboard is watched during a live day; without this it only
  // moved when the page was reloaded.
  useEffect(() => {
    if (!active) return
    const channel = supabase.channel(`event-${active}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_scans' }, () => { void loadDetail(active) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_event_boards' }, () => { void loadDetail(active) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_event_members' }, () => { void loadDetail(active) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [active, loadDetail])

  const create = async () => {
    setBusy(true); say('')
    const { data, error } = await supabase.rpc('create_event', { p_name: newName })
    setBusy(false)
    if (error) { say(`Could not create the event: ${errText(error)}`, true); return }
    setNewName(''); await loadEvents()
    if (data?.id) setActive(data.id)
    say('Event created — share the invite code with the other trainer.')
  }

  const join = async () => {
    setBusy(true); say('')
    const { error } = await supabase.rpc('join_event', { p_code: joinCode })
    setBusy(false)
    if (error) {
      const text = errText(error)
      say(
        text.includes('INVALID_CODE') ? 'No event with that code.'
        : text.includes('EVENT_ARCHIVED') ? 'That event has been archived by its organiser.'
        : text,
        true,
      )
      return
    }
    setJoinCode(''); say('Joined.'); await loadEvents()
  }

  const toggleBoard = async (sectionId: string) => {
    if (!active) return
    const { error } = contributed.has(sectionId)
      ? await supabase.from('bingo_event_boards').delete().eq('event_id', active).eq('section_id', sectionId)
      : await supabase.from('bingo_event_boards').insert({ event_id: active, section_id: sectionId, added_by: account?.id })
    if (error) { say(`Could not change the board: ${errText(error)}`, true); return }
    await loadDetail(active)
  }

  const renameEvent = async (e: EventRow) => {
    const next = window.prompt('Rename this event', e.name)
    if (next === null) return
    const name = next.trim()
    if (!name || name === e.name) return
    const { error } = await supabase.from('bingo_events').update({ name }).eq('id', e.id)
    if (error) { say(`Could not rename: ${errText(error)}`, true); return }
    await loadEvents()
  }

  /** Archiving is how an event ends — there is no automatic expiry. */
  const setArchived = async (e: EventRow, archived: boolean) => {
    if (archived && !window.confirm(
      `Archive "${e.name}"? It stops accepting new members and leaves the active list. Nothing is deleted.`
    )) return
    const { error } = await supabase.from('bingo_events').update({ archived }).eq('id', e.id)
    if (error) { say(`Could not ${archived ? 'archive' : 'restore'}: ${errText(error)}`, true); return }
    say(archived ? 'Event archived.' : 'Event restored.')
    await loadEvents()
  }

  /**
   * Permanently remove an event. Archive is the softer, reversible option and
   * stays the normal way to end a day; this is for the mistyped or abandoned
   * ones that would otherwise sit in the archive forever.
   *
   * Only the links go: bingo_event_boards and bingo_event_members cascade from
   * bingo_events, so no board, team, card or scan is touched — each tenant
   * keeps everything it contributed.
   *
   * The children are deleted explicitly first rather than relying on the
   * cascade. The documented schema says both cascade, but this database has
   * already been found to disagree with its own schema files twice, and a
   * silent foreign-key rejection would look like a dead button.
   */
  const deleteEvent = async (e: EventRow) => {
    if (!window.confirm(
      `Delete "${e.name}" for good?

` +
      'Your boards, teams and scores are NOT affected — only this event and its invite code go. ' +
      'Anyone who joined loses the shared scoreboard. This cannot be undone.'
    )) return
    const kids = await Promise.all([
      supabase.from('bingo_event_boards').delete().eq('event_id', e.id),
      supabase.from('bingo_event_members').delete().eq('event_id', e.id),
    ])
    const kidErr = kids.find(r => r.error)?.error
    if (kidErr) { say(`Could not unlink the event: ${errText(kidErr)}`, true); return }
    const { data, error } = await supabase.from('bingo_events').delete().eq('id', e.id).select('id')
    if (error) { say(`Could not delete: ${errText(error)}`, true); return }
    // Row-level security rejects a forbidden DELETE by matching zero rows
    // rather than raising, so success has to be checked, not assumed.
    if (!data || data.length === 0) {
      say('That event was not deleted — only the trainer who started it can remove it.', true)
      return
    }
    setActive(null)
    say(`Deleted "${e.name}".`)
    await loadEvents()
  }

  const leaveEvent = async (e: EventRow) => {
    if (!account) return
    if (!window.confirm(
      `Leave "${e.name}"? Your boards drop out of the combined scoreboard. You can rejoin with the code.`
    )) return
    const { error } = await supabase.from('bingo_event_members')
      .delete().eq('event_id', e.id).eq('account_id', account.id)
    if (error) { say(`Could not leave: ${errText(error)}`, true); return }
    say('Left the event.')
    await loadEvents()
  }

  const removeMember = async (m: Member) => {
    if (!active) return
    const who = m.account?.display_name || m.account?.email || 'this trainer'
    if (!window.confirm(`Remove ${who} from the event? Their boards leave the combined scoreboard.`)) return
    const { error } = await supabase.from('bingo_event_members')
      .delete().eq('event_id', active).eq('account_id', m.account_id)
    if (error) { say(`Could not remove ${who}: ${errText(error)}`, true); return }
    await loadDetail(active)
  }

  const activeEvent = events.find(e => e.id === active) ?? null
  const visible = events.filter(e => e.archived === showArchived)
  const archivedCount = events.filter(e => e.archived).length
  const mine = (t: string | null) => t === account?.id || (account?.role === 'owner' && t === null)
  const iCreated = !!activeEvent && activeEvent.created_by === account?.id
  const anyLineBonus = scores.some(r => Number(r.line_bonus) > 0)
  // The projector hides the facilitator's manual bonus unless "Total after
  // Bonus" is on, but this total always includes it. Without a column the two
  // screens look like they disagree — they do not.
  const anyManualBonus = scores.some(r => Number(r.manual_bonus) > 0)

  return (
    <div className="min-h-screen a-bg a-text px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--a-brand)' }}>Bingo Dash</p>
            <h1 className="text-3xl font-black">Shared events</h1>
            <p className="a-text-3 text-sm mt-1">
              Run one training day with another trainer. You see each other's boards and a combined
              scoreboard — nobody can edit anyone else's.
            </p>
          </div>
          <Link to="/bingo-dash/admin" className="px-4 py-2 rounded-xl border a-border text-sm font-bold hover:a-surface-2">
            ← Admin
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-3xl border-2 a-border a-surface-2 p-5">
            <h2 className="font-black mb-3">Start an event</h2>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) void create() }}
              placeholder="e.g. Nestlé KL — 15 Aug"
              className="w-full px-4 py-3 rounded-2xl border-2 a-border a-surface-2 placeholder:text-[color:var(--a-text-3)] focus:outline-none focus:border-[color:var(--a-brand)] mb-3" />
            <button onClick={() => void create()} disabled={busy || !newName.trim()}
              style={{ background: 'var(--a-brand)', color: '#fff' }}
              className="w-full py-3 rounded-2xl font-black uppercase tracking-wide disabled:opacity-40 active:scale-95 transition-transform">
              {busy ? 'Working…' : 'Create'}
            </button>
          </div>

          <div className="rounded-3xl border-2 a-border a-surface-2 p-5">
            <h2 className="font-black mb-3">Join with a code</h2>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && joinCode.length >= 4 && !busy) void join() }}
              placeholder="6-character code" maxLength={6}
              className="w-full px-4 py-3 rounded-2xl border-2 a-border a-surface-2 placeholder:text-[color:var(--a-text-3)] font-mono tracking-widest text-center focus:outline-none focus:border-[color:var(--a-brand)] mb-3" />
            <button onClick={() => void join()} disabled={busy || joinCode.length < 4}
              className="w-full py-3 rounded-2xl border-2 a-border a-text font-black uppercase tracking-wide disabled:opacity-40 hover:a-surface-2">
              Join
            </button>
          </div>
        </div>

        {msg && (
          <p className={`text-center text-sm mb-4 font-medium ${isError ? 'text-amber-300' : 'a-text-2'}`}>{msg}</p>
        )}

        {loading ? (
          <p className="a-text-3 text-sm animate-pulse">Loading events…</p>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap mb-5 items-center">
              {visible.map(e => (
                <button key={e.id} onClick={() => setActive(e.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    active === e.id ? 'text-white' : 'border a-border a-text-2 hover:a-surface-2'}`}
                  style={active === e.id ? { background: 'var(--a-brand)' } : undefined}>
                  {e.name}
                </button>
              ))}
              {visible.length === 0 && (
                <p className="a-text-3 text-sm">
                  {showArchived ? 'Nothing archived yet.' : 'No events yet — start one, or join with a code.'}
                </p>
              )}
              {/* Archived events were unreachable: the list filtered them out
                  and nothing could set the flag in the first place. */}
              {(archivedCount > 0 || showArchived) && (
                <button onClick={() => setShowArchived(v => !v)}
                  className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold a-text-3 border a-border hover:a-surface-2">
                  {showArchived ? '← Active events' : `Archived (${archivedCount})`}
                </button>
              )}
            </div>

            {activeEvent && (
              <>
                <div className="rounded-3xl border-2 a-border a-surface-2 p-5 mb-5">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-black">{activeEvent.name}</h2>
                      {activeEvent.archived && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider a-surface-2 a-text-3">
                          Archived
                        </span>
                      )}
                      {iCreated && <span className="text-[10px] font-black uppercase tracking-wider a-text-3">· you started this</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-4 py-1.5 rounded-xl font-mono font-black tracking-[0.3em]"
                        style={{
                          background: 'var(--a-brand-soft)',
                          color: 'var(--a-brand)',
                          border: '1px solid var(--a-brand)',
                        }}
                      >
                        {activeEvent.code}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${activeEvent.name} — join my Bingo Dash event\nCode: ${activeEvent.code}\n${window.location.origin}/bingo-dash/events`
                          )
                          setCopied(true); setTimeout(() => setCopied(false), 1500)
                        }}
                        style={{ background: 'var(--a-brand)', color: '#fff' }}
                        className="px-3 py-1.5 rounded-xl text-xs font-black transition-colors hover:opacity-90">
                        {copied ? '✓ Copied' : 'Copy invite'}
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] font-black uppercase tracking-widest a-text-3 mb-2">Your boards in this event</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {myBoards.length === 0 && <p className="a-text-3 text-sm">No boards yet.</p>}
                    {myBoards.map(b => (
                      <button key={b.id} onClick={() => void toggleBoard(b.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border"
                        style={contributed.has(b.id)
                          ? { background: 'var(--a-brand-soft)', color: 'var(--a-brand)', borderColor: 'var(--a-brand)' }
                          : { background: 'transparent', color: 'var(--a-text-2)', borderColor: 'var(--a-border)' }}>
                        {contributed.has(b.id) ? '✓ ' : '+ '}{b.name}
                      </button>
                    ))}
                  </div>

                  {/* Who else is in here. The scoreboard showed partner teams
                      while the roster itself was invisible. */}
                  <p className="text-[10px] font-black uppercase tracking-widest a-text-3 mb-2">Trainers in this event</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {members.length === 0 && <p className="a-text-3 text-sm">Just you so far.</p>}
                    {members.map(m => {
                      const isMe = m.account_id === account?.id
                      return (
                        <span key={m.account_id}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border a-border a-surface-2 a-text-2 inline-flex items-center gap-1.5">
                          {m.account?.display_name || m.account?.email || 'trainer'}
                          {isMe && <span className="a-text-3">(you)</span>}
                          {iCreated && !isMe && (
                            <button onClick={() => void removeMember(m)}
                              title="Remove from this event" aria-label="Remove from this event"
                              className="a-text-3 hover:text-red-300 transition-colors">&times;</button>
                          )}
                        </span>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t a-border">
                    {iCreated && (
                      <button onClick={() => void renameEvent(activeEvent)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2">
                        ✎ Rename
                      </button>
                    )}
                    {iCreated && (
                      <button onClick={() => void setArchived(activeEvent, !activeEvent.archived)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold a-text-2 border a-border hover:a-surface-2">
                        {activeEvent.archived ? '↺ Restore' : '📦 Archive'}
                      </button>
                    )}
                    {iCreated && (
                      <button onClick={() => void deleteEvent(activeEvent)}
                        title="Remove this event for good. Your boards and scores are not affected."
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border ml-auto"
                        style={{ color: 'var(--a-danger)', borderColor: 'var(--a-danger-border)' }}>
                        🗑 Delete
                      </button>
                    )}
                    {!iCreated && (
                      <button onClick={() => void leaveEvent(activeEvent)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold a-text-2 border a-border hover:bg-red-500/40">
                        Leave event
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border-2 a-border a-surface-2 overflow-hidden">
                  <div className="px-5 py-3 border-b a-border flex items-center justify-between">
                    <h2 className="font-black">Combined scoreboard</h2>
                    <span className="a-text-3 text-xs">
                      {scores.length} teams · all boards{anyManualBonus && ' · totals include bonus points'}
                    </span>
                  </div>
                  {scores.length === 0 ? (
                    <p className="px-5 py-8 text-center a-text-3 text-sm">
                      No boards contributed yet. Add one above, and ask the other trainer to do the same.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-widest a-text-3">
                            <th className="text-left px-5 py-2">#</th>
                            <th className="text-left py-2">Team</th>
                            <th className="text-left py-2">Board</th>
                            <th className="text-right py-2">Tiles</th>
                            <th className="text-right py-2">Lines</th>
                            {anyLineBonus && <th className="text-right py-2">From lines</th>}
                            <th className="text-right py-2">Duel</th>
                            {anyManualBonus && <th className="text-right py-2">Bonus</th>}
                            <th className="text-right px-5 py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scores.map((r, i) => (
                            <tr key={r.team_id} className={`border-t a-border ${mine(r.tenant_id) ? '' : 'a-surface-2'}`}>
                              <td className="px-5 py-2.5 font-black a-text-3">{i + 1}</td>
                              <td className="py-2.5 font-bold" translate="no">{r.team_name}</td>
                              <td className="py-2.5 a-text-3 text-xs">
                                {r.section_name}
                                {!mine(r.tenant_id) && <span className="ml-2" style={{ color: 'var(--a-brand)' }}>· partner</span>}
                              </td>
                              <td className="py-2.5 text-right a-text-2">{r.tiles_done}</td>
                              <td className="py-2.5 text-right a-text-2">{r.bingo_lines || '—'}</td>
                              {anyLineBonus && (
                                <td className="py-2.5 text-right" style={{ color: 'var(--a-brand)' }}>
                                  {Number(r.line_bonus) > 0 ? `+${fmtPts(r.line_bonus)}` : '—'}
                                </td>
                              )}
                              <td className="py-2.5 text-right" style={{ color: 'var(--a-live)' }}>{r.duel_bonus || '—'}</td>
                              {anyManualBonus && (
                                <td className="py-2.5 text-right" style={{ color: 'var(--a-live)' }}>
                                  {Number(r.manual_bonus) > 0 ? `+${fmtPts(r.manual_bonus)}` : '—'}
                                </td>
                              )}
                              <td className="px-5 py-2.5 text-right font-black">{fmtPts(r.total_points)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
