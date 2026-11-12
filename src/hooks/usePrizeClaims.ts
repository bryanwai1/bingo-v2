import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseClaimResult, type Claim } from '../lib/prizeCard/logic'

/**
 * PRD-008: the one seam for prize claims (player strip, projector band, admin
 * panel). Realtime on bingo_prize_claims for one board, refetched whenever the
 * channel (re)subscribes, plus a 5 s poll as a safety net (AC-5).
 */
export function usePrizeClaims(sectionId?: string | null) {
  const [claims, setClaims] = useState<Claim[]>([])
  /** True once the first fetch for this board has come back (the projector uses it to skip a popup for old claims). */
  const [loaded, setLoaded] = useState(false)
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (!sectionId) { setClaims([]); return }
    const { data } = await supabase.from('bingo_prize_claims').select('*').eq('section_id', sectionId)
    if (alive.current && data) { setClaims(data as Claim[]); setLoaded(true) }
  }, [sectionId])

  useEffect(() => {
    alive.current = true
    if (!sectionId) return
    void load()
    const poll = setInterval(() => { void load() }, 5000)
    const channel = supabase
      .channel(`prize-claims-${sectionId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_prize_claims', filter: `section_id=eq.${sectionId}` }, () => { void load() })
      .subscribe(status => { if (status === 'SUBSCRIBED') void load() })
    return () => { alive.current = false; clearInterval(poll); supabase.removeChannel(channel) }
  }, [sectionId, load])

  /** Ask the server to claim. Throws only when the server cannot be reached. */
  const claim = useCallback(async (memberId: string, boardCardId: string) => {
    const { data, error } = await supabase.rpc('claim_prize', { p_member: memberId, p_board_card: boardCardId })
    if (error) throw error
    const result = parseClaimResult(data)
    await load()
    return result
  }, [load])

  return { claims, loaded, claim, reload: load }
}
