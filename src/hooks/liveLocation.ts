import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { savedPlayerName } from '../lib/coopGames/registerMember'
import type { BingoTeam } from '../types/database'

// Live location rides on Realtime Broadcast: nothing is stored, a position is
// only a message on the board's channel. One channel per board.
export const locationChannel = (sectionId: string) => `bingo-gps-${sectionId}`
const SEND_MS = 10_000

export interface Loc { key: string; team_id: string; name: string; role: 'player' | 'observer'; lat: number; lng: number; t: number }

const COLORS = ['#e24b4a', '#378ADD', '#1D9E75', '#BA7517', '#7F77DD', '#D4537E', '#639922', '#D85A30', '#0F6E56', '#534AB7']

/** Team id -> colour and short label ("G1"). Shared by the map and the projector legend so they always agree. */
export function groupInfo(teams: BingoTeam[]) {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return new Map(sorted.map((t, i) => [t.id, { color: COLORS[i % COLORS.length], short: /^G\d+/i.exec(t.name)?.[0] ?? t.name, name: t.name }]))
}

/** A player's phone: while the board's switch is on and its timer has not run out, send position every 10 s. */
export function useLocationShare(id: { teamId: string; role: 'player' | 'observer'; key: string } | null) {
  useEffect(() => {
    if (!isSupabaseConfigured || !id || !navigator.geolocation) return
    let alive = true, sectionId: string | null = null
    let stop: (() => void) | null = null

    const start = (sid: string) => {
      const channel = supabase.channel(locationChannel(sid))
      channel.subscribe()
      let latest: GeolocationPosition | null = null
      const watch = navigator.geolocation.watchPosition(p => { latest = p }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
      // Send on a timer, not on movement: a player standing still must not look stale.
      const send = setInterval(() => {
        if (!latest) return
        const { latitude: lat, longitude: lng } = latest.coords
        void channel.send({ type: 'broadcast', event: 'pos', payload: { key: id.key, team_id: id.teamId, name: savedPlayerName(), role: id.role, lat, lng, t: Date.now() } })
      }, SEND_MS)
      stop = () => { navigator.geolocation.clearWatch(watch); clearInterval(send); void supabase.removeChannel(channel); stop = null }
    }

    const check = async () => {
      if (!sectionId) {
        const { data } = await supabase.from('bingo_teams').select('section_id').eq('id', id.teamId).maybeSingle()
        sectionId = data?.section_id ?? null
      }
      if (!sectionId || !alive) return
      const { data: s } = await supabase.from('bingo_sections').select('gps_enabled, gps_who, timer_end_at').eq('id', sectionId).maybeSingle()
      const on = !!s?.gps_enabled && (!s.gps_who || s.gps_who === 'both' || s.gps_who === id.role) && !(s.timer_end_at && Date.parse(s.timer_end_at) <= Date.now())
      if (!alive) return
      if (on && !stop) start(sectionId)
      else if (!on && stop) stop()
    }
    void check()
    const poll = setInterval(() => void check(), 30_000) // picks up the admin flipping the switch
    return () => { alive = false; clearInterval(poll); stop?.() }
  }, [id])
}

/** Latest position of everyone on a board, by member. */
export function useLiveLocations(sectionId: string | null | undefined, enabled: boolean): Map<string, Loc> {
  const [locs, setLocs] = useState<Map<string, Loc>>(new Map())
  useEffect(() => {
    if (!isSupabaseConfigured || !sectionId || !enabled) return
    const ch = supabase.channel(locationChannel(sectionId))
      .on('broadcast', { event: 'pos' }, ({ payload }) => setLocs(prev => new Map(prev).set((payload as Loc).key, payload as Loc)))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [sectionId, enabled])
  return locs
}
