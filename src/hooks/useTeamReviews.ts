import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** What the board tile should say about a card's submissions:
 *  something is waiting on the admin, or the newest one was sent back. */
export type ReviewFlag = 'pending' | 'rejected'

/**
 * Per-card review state for one team, kept live.
 *
 * Before this a team that submitted saw nothing change on the board — the
 * tile only turned green once the admin approved — so they could not tell
 * whether it had gone through, or been rejected while they were walking.
 * A card with any pending row is 'pending'; otherwise, if its newest row is
 * a rejection, 'rejected'; approved-or-nothing cards are absent.
 */
export function useTeamReviews(teamId: string | null | undefined): Record<string, ReviewFlag> {
  const [flags, setFlags] = useState<Record<string, ReviewFlag>>({})

  useEffect(() => {
    if (!teamId) { setFlags({}); return }
    let live = true
    const read = () => {
      supabase.from('bingo_photo_submissions')
        .select('task_id, status, created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!live) return
          const next: Record<string, ReviewFlag> = {}
          const seen = new Set<string>()
          for (const row of data ?? []) {
            if (row.status === 'pending') { next[row.task_id] = 'pending'; seen.add(row.task_id); continue }
            if (seen.has(row.task_id)) continue
            seen.add(row.task_id)
            if (row.status === 'rejected') next[row.task_id] = 'rejected'
          }
          setFlags(next)
        })
    }
    read()
    const channel = supabase
      .channel(`team-reviews-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_photo_submissions', filter: `team_id=eq.${teamId}` }, read)
      .subscribe()
    return () => { live = false; supabase.removeChannel(channel) }
  }, [teamId])

  return flags
}
