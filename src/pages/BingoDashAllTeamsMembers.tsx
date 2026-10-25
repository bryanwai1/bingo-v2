import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ParticleBackground } from '../components/ParticleBackground'
import type { BingoTeam, BingoMember, BingoSection } from '../types/database'


export function BingoDashAllTeamsMembers() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [members, setMembers] = useState<BingoMember[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Initial load
  useEffect(() => {
    if (!sectionSlug) { setNotFound(true); setLoading(false); return }
    let cancelled = false

    ;(async () => {
      const { data: s } = await supabase
        .from('bingo_sections').select('*').eq('slug', sectionSlug).maybeSingle()
      if (cancelled) return
      if (!s) { setNotFound(true); setLoading(false); return }
      setSection(s)

      const [{ data: t }, { data: m }] = await Promise.all([
        supabase.from('bingo_teams').select('*').eq('section_id', s.id).order('name'),
        supabase.from('bingo_members').select('*').eq('section_id', s.id).order('created_at'),
      ])
      if (cancelled) return
      if (t) setTeams(t)
      if (m) setMembers(m)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [sectionSlug])

  // Live updates
  useEffect(() => {
    if (!section) return
    const channel = supabase
      .channel(`bingo-all-teams-${section.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_members', filter: `section_id=eq.${section.id}` }, () => {
        supabase.from('bingo_members').select('*').eq('section_id', section.id).order('created_at')
          .then(({ data }) => { if (data) setMembers(data) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_teams', filter: `section_id=eq.${section.id}` }, () => {
        supabase.from('bingo_teams').select('*').eq('section_id', section.id).order('name')
          .then(({ data }) => { if (data) setTeams(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [section?.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  if (notFound || !section) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-black text-white mb-2">Section not found</h1>
          <p className="text-gray-500 text-sm">This link may have expired or the section was removed.</p>
        </div>
      </div>
    )
  }

  const sortedTeams = [...teams].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  )
  const totalPlayers = members.filter(m => m.role === 'player').length

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden px-4 py-8">
      <ParticleBackground />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <p className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-1">
            Bingo Dash
          </p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Live</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">{section.name}</h1>
          <p className="text-gray-500 text-sm mt-2">
            <span className="font-bold text-gray-300">{teams.length}</span> group{teams.length !== 1 ? 's' : ''}
            <span className="text-gray-600 mx-2">·</span>
            <span className="font-bold text-gray-300">{totalPlayers}</span> player{totalPlayers !== 1 ? 's' : ''} joined
          </p>
        </div>

        {sortedTeams.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">👥</div>
            <p className="text-gray-400 font-medium">No groups have been set up yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedTeams.map((team, i) => {
              const teamMembers = members.filter(m => m.team_id === team.id)
              const players = teamMembers.filter(m => m.role === 'player')
              const observers = teamMembers.filter(m => m.role === 'observer')
              const isFull = players.length >= (section?.max_team_players ?? 1)
              return (
                <div key={team.id}
                  className="bg-white rounded-2xl shadow-xl p-4 animate-bounce-in flex flex-col"
                  style={{ animationDelay: `${0.03 * i}s`, opacity: 0, animationFillMode: 'forwards' }}>
                  <div className="flex items-center gap-3 mb-3">
                    {team.photo_url ? (
                      <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-violet-300 flex-shrink-0">
                        <img src={team.photo_url} alt={`${team.name} photo`} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-black flex-shrink-0">
                        {team.name.trim().charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-black text-gray-900 truncate">{team.name}</h2>
                      <p className={`text-xs font-bold ${isFull ? 'text-red-500' : 'text-gray-400'}`}>
                        {players.length} / {section?.max_team_players ?? 1} player{players.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {players.length === 0 ? (
                    <div className="flex-1 py-4 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-gray-300 text-xs font-medium">Nobody yet</p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5 flex-1">
                      {players.map(m => (
                        <li key={m.id}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-black text-[11px] flex-shrink-0">
                            {m.name.trim().charAt(0).toUpperCase() || '?'}
                          </div>
                          <span className="font-bold text-gray-900 text-sm truncate">{m.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {observers.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                        👁 {observers.length} / {section?.max_team_observers ?? 9} observer{observers.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {observers.map(o => o.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-[11px] text-gray-600 mt-8 text-center">
          This page updates live as players join.
        </p>
      </div>
    </div>
  )
}
