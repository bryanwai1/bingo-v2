import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { BingoTeam } from '../types/database'

const TEAM_ID_KEY   = 'bingo-dash-team-id'
const TEAM_DATA_KEY = 'bingo-dash-team-data'

export function useBingoDashTeam() {
  const [team, setTeam] = useState<BingoTeam | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }

    const teamId = localStorage.getItem(TEAM_ID_KEY)
    if (!teamId) { setLoading(false); return }

    // Use cached data immediately
    const cached = localStorage.getItem(TEAM_DATA_KEY)
    if (cached) {
      try { setTeam(JSON.parse(cached)); setLoading(false) } catch { /* ignore */ }
    }

    // Validate in background. IMPORTANT: only clear the saved session when the
    // server *confirms* the team is gone (query succeeded, zero rows). A network
    // blip / 5xx / RLS hiccup returns an error with null data — in that case keep
    // the cached session so a momentary failure doesn't kick a registered player
    // back to the join screen (which led to duplicate sign-ups).
    supabase
      .from('bingo_teams')
      .select('*')
      .eq('id', teamId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) {
          setTeam(data)
          localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(data))
        } else if (!error) {
          // Confirmed: the team no longer exists.
          localStorage.removeItem(TEAM_ID_KEY)
          localStorage.removeItem(TEAM_DATA_KEY)
          setTeam(null)
        }
        // else: transient error — keep the cached session untouched.
        if (!cached) setLoading(false)
      })
  }, [])

  /**
   * Join an existing team (created by admin) by teamId + password.
   * Admin creates teams in advance; participants pick from the list and enter the password.
   */
  const joinTeamById = async (teamId: string, password: string): Promise<BingoTeam> => {
    const trimmedPwd = password.trim()

    const { data: found, error } = await supabase
      .from('bingo_teams')
      .select('*')
      .eq('id', teamId)
      .single()
    if (error || !found) throw new Error('Group not found.')
    if (!found.password) throw new Error('This group has not been set up yet. Ask your facilitator.')
    if (found.password !== trimmedPwd) throw new Error('Wrong password for this group.')

    if (localStorage.getItem(TEAM_ID_KEY) !== found.id) {
      localStorage.removeItem('bingo-dash-member-id')
      localStorage.removeItem('bingo-dash-member-role')
    }
    localStorage.setItem(TEAM_ID_KEY, found.id)
    localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(found))
    setTeam(found)
    return found
  }

  const leaveTeam = () => {
    localStorage.removeItem('bingo-dash-member-id')
    localStorage.removeItem('bingo-dash-member-role')
    localStorage.removeItem(TEAM_ID_KEY)
    localStorage.removeItem(TEAM_DATA_KEY)
    setTeam(null)
  }

  return {
    team,
    loading,
    isRegistered: !!team,
    joinTeamById,
    leaveTeam,
  }
}
