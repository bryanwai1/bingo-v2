import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PRESENCE_CHANNEL } from '../components/PresenceBeacon'
import type { Claim } from '../lib/prizeCard/logic'
import type { BingoBoardCard, BingoDuel, BingoPhotoSubmission, BingoScan, BingoSection, BingoTask, BingoTeam } from '../types/database'

export interface ProgressData {
  loaded: boolean
  sections: BingoSection[]
  tasks: BingoTask[]
  boardCards: BingoBoardCard[]
  teams: BingoTeam[]
  scans: BingoScan[]
  duels: BingoDuel[]
  claims: Claim[]
  pending: BingoPhotoSubmission[]
  /** team id -> how many players / observers have the app open right now. */
  online: Map<string, { players: number; observers: number }>
  /** team id -> when it dropped offline, for teams seen online since this page opened. */
  offlineSince: Map<string, number>
}

/**
 * Everything the Progress page shows, for one board: loaded once, then refetched a table at a time when it
 * changes. Presence (who has the app open) comes from the same channel the
 * phones announce themselves on.
 */
export function useProgressData(sectionId: string): ProgressData {
  const [loaded, setLoaded] = useState(false)
  const [sections, setSections] = useState<BingoSection[]>([])
  const [tasks, setTasks] = useState<BingoTask[]>([])
  const [boardCards, setBoardCards] = useState<BingoBoardCard[]>([])
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [duels, setDuels] = useState<BingoDuel[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [pending, setPending] = useState<BingoPhotoSubmission[]>([])
  const [online, setOnline] = useState<ProgressData['online']>(new Map())
  const [offlineSince, setOfflineSince] = useState<Map<string, number>>(new Map())
  const sectionIds = useRef<Set<string>>(new Set())

  const load = useCallback(async (what: string) => {
    const run = async <T,>(q: PromiseLike<{ data: T[] | null }>, set: (v: T[]) => void) => { const { data } = await q; if (data) set(data) }
    if (what === 'sections' || what === 'all') {
      const { data } = await supabase.from('bingo_sections').select('*').eq('id', sectionId)
      if (data) { sectionIds.current = new Set(data.map(s => s.id)); setSections(data) }
    }
    if (what === 'tasks' || what === 'all')   await run(supabase.from('bingo_tasks').select('*'), setTasks)
    if (what === 'cards' || what === 'all')   await run(supabase.from('bingo_board_cards').select('*').eq('section_id', sectionId).order('slot'), setBoardCards)
    if (what === 'teams' || what === 'all')   await run(supabase.from('bingo_teams').select('*').eq('section_id', sectionId).order('created_at'), setTeams)
    if (what === 'scans' || what === 'all')   await run(supabase.from('bingo_scans').select('*'), setScans)
    if (what === 'duels' || what === 'all')   await run(supabase.from('bingo_duels').select('*').eq('status', 'done'), setDuels)
    if (what === 'claims' || what === 'all')  await run(supabase.from('bingo_prize_claims').select('*'), setClaims as (v: Claim[]) => void)
    if (what === 'pending' || what === 'all') await run(supabase.from('bingo_photo_submissions').select('*').eq('status', 'pending'), setPending)
  }, [sectionId])

  useEffect(() => {
    let alive = true
    const first = setTimeout(() => { void load('all').then(() => { if (alive) setLoaded(true) }) }, 0)
    // A burst of changes (one approval touches scans and submissions) is one refetch.
    const queued = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const nudge = (what: string) => {
      queued.add(what)
      if (timer) return
      timer = setTimeout(() => { timer = null; const w = [...queued]; queued.clear(); w.forEach(x => void load(x)) }, 400)
    }
    const tables: [string, string][] = [
      ['bingo_scans', 'scans'], ['bingo_teams', 'teams'], ['bingo_tasks', 'tasks'], ['bingo_board_cards', 'cards'],
      ['bingo_sections', 'sections'], ['bingo_duels', 'duels'], ['bingo_prize_claims', 'claims'], ['bingo_photo_submissions', 'pending'],
    ]
    let ch = supabase.channel(`progress-${Math.random().toString(36).slice(2, 8)}`)
    for (const [table, what] of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => nudge(what))
    ch.subscribe()
    // Safety net: realtime can silently drop on a venue's wifi.
    const poll = setInterval(() => { void load('scans'); void load('pending'); void load('claims') }, 15000)

    const pres = supabase.channel(PRESENCE_CHANNEL)
    // A team that was online and is not any more has gone offline now. Presence
    // only says who is here, so the drop time is noticed here, as it happens.
    const everOnline = new Set<string>()
    const dropped = new Map<string, number>()
    const readPresence = () => {
      const next = new Map<string, { players: number; observers: number }>()
      const state = pres.presenceState() as Record<string, { team_id?: string; role?: string }[]>
      for (const metas of Object.values(state)) {
        const m = metas[0]
        if (!m?.team_id) continue
        const e = next.get(m.team_id) ?? { players: 0, observers: 0 }
        if (m.role === 'observer') e.observers++; else e.players++
        next.set(m.team_id, e)
      }
      for (const id of next.keys()) { everOnline.add(id); dropped.delete(id) }
      for (const id of everOnline) if (!next.has(id) && !dropped.has(id)) dropped.set(id, Date.now())
      if (alive) { setOnline(next); setOfflineSince(new Map(dropped)) }
    }
    pres.on('presence', { event: 'sync' }, readPresence).subscribe()

    return () => {
      alive = false
      clearTimeout(first)
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      void supabase.removeChannel(ch)
      void supabase.removeChannel(pres)
    }
  }, [load])

  return { loaded, sections, tasks, boardCards, teams, scans, duels, claims, pending, online, offlineSince }
}
