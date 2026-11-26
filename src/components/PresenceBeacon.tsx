import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useLocationShare } from '../hooks/liveLocation'

// Tells the Progress page this phone is open. Realtime Presence needs no table:
// the entry vanishes on its own when the tab closes, the phone locks or the
// connection drops, which is exactly "offline". Sends only the team id and the
// role, nothing about the person.
export const PRESENCE_CHANNEL = 'bingo-presence'

function currentIdentity(): { teamId: string; role: 'player' | 'observer'; key: string } | null {
  const path = window.location.pathname
  if (path.startsWith('/bingo-dash/admin') || path.startsWith('/bingo-dash/progress')) return null
  const teamId = localStorage.getItem('bingo-dash-team-id')
  if (!teamId) return null
  const role = localStorage.getItem('bingo-dash-member-role') === 'observer' ? 'observer' : 'player'
  return { teamId, role, key: localStorage.getItem('bingo-dash-member-id') ?? teamId }
}

export function PresenceBeacon() {
  // The player joins a team after the app has loaded, so look again every few seconds.
  const [id, setId] = useState(currentIdentity)
  useEffect(() => {
    const t = setInterval(() => {
      const next = currentIdentity()
      setId(prev => (prev?.teamId === next?.teamId && prev?.role === next?.role && prev?.key === next?.key ? prev : next))
    }, 4000)
    return () => clearInterval(t)
  }, [])

  useLocationShare(id)

  useEffect(() => {
    if (!isSupabaseConfigured || !id) return
    const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: id.key } } })
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') void channel.track({ team_id: id.teamId, role: id.role })
    })
    return () => { void supabase.removeChannel(channel) }
  }, [id])
  return null
}
