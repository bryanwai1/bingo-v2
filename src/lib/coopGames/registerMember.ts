import { supabase } from '../supabase'
import type { CoopRole } from './session.ts'

const NAME_KEY = 'bingo-player-name'
export const savedPlayerName = () => { try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } }

/**
 * Register the person already sitting on a team (team and role are known from this browser)
 * as a named member, without sending them back to the join page. Same record and saved keys
 * as BingoDashJoin.joinGroup, so the rest of the app sees an ordinary join.
 */
export async function registerCoopMember(teamId: string, rawName: string, role: CoopRole): Promise<string> {
  const name = rawName.trim()
  if (!name) throw new Error('Enter your name.')
  const { data: team, error: teamErr } = await supabase.from('bingo_teams').select('*').eq('id', teamId).single()
  if (teamErr || !team) throw new Error('Group not found.')
  const { data: section, error: secErr } = await supabase.from('bingo_sections').select('*').eq('id', team.section_id).single()
  if (secErr || !section) throw new Error('Board not found.')
  const password: string = role === 'observer' ? '' : team.password ?? ''
  if (role !== 'observer' && !password) throw new Error('This group has not been set up yet. Ask your facilitator.')

  const { data: rows } = await supabase.from('bingo_members').select('*').eq('section_id', section.id)
    .ilike('name', name.replace(/[\\%_]/g, c => '\\' + c)).order('created_at', { ascending: true }).limit(1)
  const existing = rows?.[0] ?? null

  const cap = role === 'observer' ? section.max_team_observers ?? 9 : section.max_team_players ?? 1
  if (!(existing?.team_id === teamId && existing.role === role)) {
    const { count } = await supabase.from('bingo_members').select('id', { count: 'exact', head: true })
      .eq('team_id', teamId).eq('role', role)
    if ((count ?? 0) >= cap) throw new Error(`This team is full (${cap} ${role}${cap === 1 ? '' : 's'}).`)
  }

  let member = existing
  if (existing) {
    if (existing.team_id !== teamId || existing.password !== password || existing.role !== role) {
      const { error: upErr } = await supabase.from('bingo_members').update({ team_id: teamId, password, role }).eq('id', existing.id)
      if (upErr) throw new Error(upErr.message?.includes('TEAM_FULL') ? `This team is full (${cap} ${role}${cap === 1 ? '' : 's'}).` : 'Could not register you. Try again.')
    }
    member = { ...existing, team_id: teamId, password, role }
  } else {
    const { data: created, error } = await supabase.from('bingo_members')
      .insert({ name, password, team_id: teamId, section_id: section.id, role }).select().single()
    if (error?.message?.includes('TEAM_FULL')) throw new Error(`This team is full (${cap} ${role}${cap === 1 ? '' : 's'}).`)
    if (error || !created) throw new Error('Could not register you. Try again.')
    member = created
  }

  try {
    const json = JSON.stringify(team)
    localStorage.setItem(NAME_KEY, name)
    localStorage.setItem(`bingo-join-member-${section.slug}`, member.id)
    localStorage.setItem(`bingo-join-member-data-${section.slug}`, JSON.stringify(member))
    localStorage.setItem(`bingo-join-team-${section.slug}`, team.id)
    localStorage.setItem(`bingo-join-data-${section.slug}`, json)
    localStorage.setItem(`bingo-join-role-${section.slug}`, role)
    localStorage.setItem('bingo-dash-member-id', member.id)
    localStorage.setItem('bingo-dash-team-id', team.id)
    localStorage.setItem('bingo-dash-team-data', json)
    localStorage.setItem('bingo-dash-member-role', role)
  } catch { /* storage blocked: the member row still exists */ }
  return member.id as string
}
