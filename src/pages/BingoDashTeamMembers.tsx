import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { ParticleBackground } from '../components/ParticleBackground'
import type { BingoTeam, BingoMember, BingoSection } from '../types/database'


export function BingoDashTeamMembers() {
  const { teamId } = useParams<{ teamId: string }>()
  const [team, setTeam] = useState<BingoTeam | null>(null)
  const [section, setSection] = useState<BingoSection | null>(null)
  const [members, setMembers] = useState<BingoMember[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // This page is a public, view-only link, so the kick buttons only appear for
  // a signed-in, approved Bingo Dash admin (the same browser they run the game in).
  const isAdmin = useIsAdmin()

  // Everyone removed since this page opened, newest first, so a slip can be undone.
  const [removed, setRemoved] = useState<BingoMember[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)
  const restore = async (m: BingoMember) => {
    setRestoring(m.id)
    // The same row goes back with the same id, so the player's own device still recognises it.
    const { error } = await supabase.from('bingo_members').insert(m)
    setRestoring(null)
    if (error) {
      alert(error.message?.includes('TEAM_FULL') ? 'That seat has been taken since, so they cannot be put back.' : `Could not undo: ${error.message}`)
      return
    }
    setRemoved(prev => prev.filter(x => x.id !== m.id))
    const { data } = await supabase.from('bingo_members').select('*').eq('team_id', teamId!).order('created_at')
    if (data) setMembers(data)
  }

  const kick = async (m: BingoMember) => {
    if (!confirm(`Take "${m.name}" out of ${team?.name ?? 'the team'}?

Their scans stay with the team.`)) return
    setMembers(prev => prev.filter(x => x.id !== m.id))
    const { error } = await supabase.from('bingo_members').delete().eq('id', m.id)
    if (!error) setRemoved(prev => [m, ...prev.filter(x => x.id !== m.id)])
    if (error) {
      alert('Failed to remove')
      const { data } = await supabase.from('bingo_members').select('*').eq('team_id', teamId!).order('created_at')
      if (data) setMembers(data)
    }
  }

  // Initial load
  useEffect(() => {
    if (!teamId) { setNotFound(true); setLoading(false); return }
    let cancelled = false

    ;(async () => {
      const { data: t } = await supabase
        .from('bingo_teams').select('*').eq('id', teamId).maybeSingle()
      if (cancelled) return
      if (!t) { setNotFound(true); setLoading(false); return }
      setTeam(t)

      const [{ data: s }, { data: m }] = await Promise.all([
        supabase.from('bingo_sections').select('*').eq('id', t.section_id).maybeSingle(),
        supabase.from('bingo_members').select('*').eq('team_id', teamId).order('created_at'),
      ])
      if (cancelled) return
      if (s) setSection(s)
      if (m) setMembers(m)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [teamId])

  // Live updates: members join, leave, or get moved between teams
  useEffect(() => {
    if (!teamId) return
    const channel = supabase
      .channel(`bingo-team-members-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_members' }, () => {
        supabase.from('bingo_members').select('*').eq('team_id', teamId).order('created_at')
          .then(({ data }) => { if (data) setMembers(data) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_teams', filter: `id=eq.${teamId}` }, ({ new: updated }) => {
        setTeam(prev => prev ? { ...prev, ...updated } as BingoTeam : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [teamId])

  const players = members.filter(m => m.role === 'player')
  const maxPlayers = section?.max_team_players ?? 1
  const observers = members.filter(m => m.role === 'observer')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  if (notFound || !team) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-black text-white mb-2">Group not found</h1>
          <p className="text-gray-500 text-sm">This link may have expired or the group was removed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden px-4 py-10">
      <ParticleBackground />

      <div className="relative z-10 max-w-md mx-auto flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-6 animate-slide-up">
          <p className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-1">
            {section?.name ?? 'Bingo Dash'}
          </p>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Live</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">{team.name}</h1>
        </div>

        {/* Team photo */}
        {team.photo_url && (
          <div className="mb-6 w-28 h-28 rounded-full overflow-hidden border-4 border-violet-500/40 shadow-2xl shadow-violet-900/40">
            <img src={team.photo_url} alt={`${team.name} photo`} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Players card */}
        <div className="w-full bg-white rounded-3xl shadow-2xl p-6 animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-gray-900">Players</h2>
            <span className={`text-sm font-bold ${players.length >= maxPlayers ? 'text-red-500' : 'text-gray-400'}`}>
              {players.length} / {maxPlayers}
            </span>
          </div>

          {players.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-gray-400 text-sm font-medium">Nobody has joined yet.</p>
              <p className="text-gray-300 text-xs mt-1">Players will appear here in real time.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {players.map((m, i) => (
                <li key={m.id}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100 animate-slide-up"
                  style={{ animationDelay: `${0.05 + i * 0.04}s`, opacity: 0, animationFillMode: 'forwards' }}>
                  <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-black text-base flex-shrink-0">
                    {m.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <span className="font-bold text-gray-900 truncate flex-1">{m.name}</span>
                  {isAdmin && (
                    <button onClick={() => void kick(m)} title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500 transition-colors flex-shrink-0 text-lg leading-none">
                      &times;
                    </button>
                  )}
                </li>
              ))}
              {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
                <li key={`empty-${i}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50/60 border border-dashed border-gray-200">
                  <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-300 flex items-center justify-center font-black text-base flex-shrink-0">
                    ?
                  </div>
                  <span className="font-medium text-gray-300 text-sm">Empty seat</span>
                </li>
              ))}
            </ul>
          )}

          {observers.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Observers</h3>
                <span className="text-xs font-bold text-gray-400">{observers.length} / {section?.max_team_observers ?? 9}</span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {observers.map(m => (
                  <li key={m.id}
                    className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold flex items-center gap-1">
                    <span>👁</span>
                    <span className="truncate max-w-[120px]">{m.name}</span>
                    {isAdmin && (
                      <button onClick={() => void kick(m)} title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`}
                        className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center text-blue-400 hover:text-white hover:bg-red-500 transition-colors text-sm leading-none">
                        &times;
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {isAdmin && removed.length > 0 && (
          <div className="w-full mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
            <p className="text-[11px] font-black text-amber-300 uppercase tracking-widest mb-2">Recently removed</p>
            <ul className="flex flex-col gap-2">
              {removed.map(m => (
                <li key={m.id} className="flex items-center gap-3 text-sm text-white">
                  <span className="flex-1 truncate font-bold">{m.name} <span className="text-white/40 font-medium">· {m.role}</span></span>
                  <button onClick={() => void restore(m)} disabled={restoring === m.id}
                    className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-black disabled:opacity-50">
                    {restoring === m.id ? 'Restoring…' : '↩ Undo'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-gray-600 mt-5 text-center">
          This page updates live as players join.
        </p>
      </div>
    </div>
  )
}
