import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LiveMap } from '../components/LiveMap'
import { useLiveLocations } from '../hooks/liveLocation'
import { useIsAdmin } from '../hooks/useIsAdmin'
import type { BingoSection, BingoTeam } from '../types/database'

// Full-screen live map for the projector. Opened from Admin > Open > Live location.
export function BingoDashLocation() {
  const { sectionId = '' } = useParams<{ sectionId?: string }>()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [s, t] = await Promise.all([
        supabase.from('bingo_sections').select('*').eq('id', sectionId).maybeSingle(),
        supabase.from('bingo_teams').select('*').eq('section_id', sectionId),
      ])
      if (!alive) return
      setSection(s.data as BingoSection | null); setTeams((t.data ?? []) as BingoTeam[]); setLoaded(true)
    }
    void load()
    const poll = setInterval(() => void load(), 60_000)
    return () => { alive = false; clearInterval(poll) }
  }, [sectionId])

  const isAdmin = useIsAdmin()
  const on = !!section?.gps_enabled
  const locs = useLiveLocations(sectionId, on)

  if (!loaded) return <div className="h-[100dvh] bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>
  if (!on) return (
    <div className="h-[100dvh] bg-gray-950 text-gray-300 flex items-center justify-center p-6 text-center">
      Live location is off for this board. Turn it on in Admin, Settings, Live Location.
    </div>
  )
  return (
    <div className="relative h-[100dvh] bg-gray-950">
      <div className="absolute inset-0"><LiveMap locs={locs} teams={teams} isAdmin={isAdmin} title={section?.name} className="h-full" /></div>
    </div>
  )
}
