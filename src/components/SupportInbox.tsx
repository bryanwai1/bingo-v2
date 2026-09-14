import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ============================================================================
   SupportInbox — the facilitator side.

   One list of teams that have written in, newest first, unread first. Picking
   a team opens the thread and marks it read.

   Deliberately not a modal: during an event this sits open on a second screen
   while you work, and a modal would block everything behind it.
   ========================================================================= */

type Msg = {
  id: string
  team_id: string
  sender: 'team' | 'admin'
  body: string
  created_at: string
  read_at: string | null
}

type Thread = {
  teamId: string
  teamName: string
  last: Msg
  unread: number
}

export function SupportInbox({ sectionId }: { sectionId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [teams, setTeams] = useState<Record<string, string>>({})
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from('bingo_messages')
        .select('id, team_id, sender, body, created_at, read_at')
        .eq('section_id', sectionId).order('created_at'),
      supabase.from('bingo_teams').select('id, name').eq('section_id', sectionId),
    ])
    setMsgs((m ?? []) as Msg[])
    setTeams(Object.fromEntries((t ?? []).map((x: { id: string; name: string }) => [x.id, x.name])))
  }, [sectionId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`inbox-${sectionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_messages', filter: `section_id=eq.${sectionId}` },
        () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [sectionId, load])

  // Group into threads: unread first, then most recent.
  const threads: Thread[] = Object.values(
    msgs.reduce((acc: Record<string, Thread>, m) => {
      const t = acc[m.team_id] ?? {
        teamId: m.team_id, teamName: teams[m.team_id] ?? 'Unknown team', last: m, unread: 0,
      }
      t.last = m
      if (m.sender === 'team' && !m.read_at) t.unread++
      t.teamName = teams[m.team_id] ?? t.teamName
      acc[m.team_id] = t
      return acc
    }, {}),
  ).sort((a, b) =>
    (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) ||
    +new Date(b.last.created_at) - +new Date(a.last.created_at))

  const totalUnread = threads.reduce((n, t) => n + t.unread, 0)
  const thread = openTeam ? msgs.filter(m => m.team_id === openTeam) : []

  const openThread = async (teamId: string) => {
    setOpenTeam(teamId)
    await supabase.from('bingo_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('team_id', teamId).eq('sender', 'team').is('read_at', null)
  }

  const reply = async () => {
    const body = draft.trim()
    if (!body || !openTeam || sending) return
    setSending(true); setDraft('')
    const { error } = await supabase.from('bingo_messages')
      .insert({ section_id: sectionId, team_id: openTeam, sender: 'admin', body })
    if (error) setDraft(body)
    setSending(false)
  }

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [thread.length])

  return (
    <section className="a-surface border a-border rounded-2xl overflow-hidden">
      <header className="px-5 py-4 flex items-center justify-between border-b a-border">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black a-text">Team messages</h2>
          {totalUnread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black">
              {totalUnread} new
            </span>
          )}
        </div>
        {openTeam && (
          <button onClick={() => setOpenTeam(null)}
                  className="text-xs font-bold a-text-3 hover:a-text">← All teams</button>
        )}
      </header>

      {!openTeam ? (
        <div className="divide-y a-border max-h-[420px] overflow-y-auto">
          {threads.length === 0 && (
            <p className="px-5 py-10 text-center a-text-3 text-sm">
              No messages yet. Teams can reach you from the help button on their screen.
            </p>
          )}
          {threads.map(t => (
            <button key={t.teamId} onClick={() => void openThread(t.teamId)}
                    className="w-full px-5 py-3 flex items-center gap-3 text-left hover:a-surface-2 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: t.unread ? '#ef4444' : 'transparent' }} />
              <span className="flex-1 min-w-0">
                <span className="block font-bold a-text text-sm">{t.teamName}</span>
                <span className="block a-text-3 text-xs truncate">
                  {t.last.sender === 'admin' ? 'You: ' : ''}{t.last.body}
                </span>
              </span>
              <span className="a-text-3 text-[11px] flex-shrink-0">
                {new Date(t.last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div ref={listRef} className="px-4 py-4 space-y-2 max-h-[360px] overflow-y-auto">
            <p className="text-center a-text-3 text-xs font-bold uppercase tracking-widest mb-2">
              {teams[openTeam] ?? 'Team'}
            </p>
            {thread.map(m => (
              <div key={m.id} className={m.sender === 'admin' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                  m.sender === 'admin'
                    ? 'bg-teal-600 text-white rounded-br-sm'
                    : 'a-surface-2 a-text rounded-bl-sm'}`}>
                  {m.body}
                  <span className={`block text-[10px] mt-1 ${
                    m.sender === 'admin' ? 'text-white/60' : 'a-text-3'}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 flex gap-2 border-t a-border">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void reply() }}
              placeholder="Reply to this team…"
              maxLength={500}
              className="flex-1 a-surface-2 a-text text-sm px-3 py-2 rounded-xl border a-border focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button onClick={() => void reply()} disabled={!draft.trim() || sending}
                    className="px-4 rounded-xl bg-teal-600 text-white font-black text-sm disabled:opacity-40">
              Send
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default SupportInbox
