import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveSavedMember } from '../lib/coopGames/memberIdentity'
import type { CoopRole } from '../lib/coopGames/session'

/** A shared browser can have a member from another board; never use it for this team. */
export function useCoopMember(teamId?: string, sectionId?: string) {
  const [member, setMember] = useState<{ teamId: string; id: string | null; role: CoopRole; loading: boolean; error: boolean } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!teamId || !sectionId) return
    let cancelled = false
    const resolve = async () => {
      try {
        const { data: section, error: sectionError } = await supabase.from('bingo_sections').select('slug').eq('id', sectionId).single()
        if (sectionError) throw sectionError
        const candidates = [...new Set([
          localStorage.getItem(`bingo-join-member-${section.slug}`),
          localStorage.getItem('bingo-dash-member-id'),
        ].filter((id): id is string => !!id))]
        const found = await resolveSavedMember(candidates, teamId, sectionId, async id => {
          const { data, error } = await supabase.from('bingo_members').select('id, role, team_id, section_id').eq('id', id).eq('team_id', teamId).eq('section_id', sectionId).maybeSingle()
          if (error) throw error
          return data
        })
        if (cancelled) return
        const role = found?.role === 'observer' ? 'observer' : 'player'
        if (found) {
          localStorage.setItem('bingo-dash-member-id', found.id)
          localStorage.setItem('bingo-dash-member-role', role)
        }
        setMember({ teamId, id: found?.id ?? null, role, loading: false, error: false })
      } catch {
        if (!cancelled) setMember({ teamId, id: null, role: 'player', loading: false, error: true })
      }
    }
    void resolve()
    return () => { cancelled = true }
  }, [teamId, sectionId, tick])
  const reload = () => setTick(t => t + 1)
  return member && member.teamId === teamId ? { ...member, reload } : { id: null, role: 'player' as CoopRole, loading: !!teamId, error: false, reload }
}
