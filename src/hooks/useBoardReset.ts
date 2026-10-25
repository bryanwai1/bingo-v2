import { useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

// Reset Game tells every open briefing deck, award show and award editor for
// the board to start over. Slide positions live only in each open tab, so
// without this a projector left on the 1st-place slide kept showing it after
// the board had been wiped for the next event.
const topic = (sectionId: string) => `board-reset-${sectionId}`

/** Run onReset whenever Reset Game is pressed for this board, on any device. */
export function useBoardReset(sectionId: string | null | undefined, onReset: () => void) {
  const ref = useRef(onReset)
  useEffect(() => { ref.current = onReset })

  useEffect(() => {
    if (!sectionId || !isSupabaseConfigured) return
    const channel = supabase
      .channel(topic(sectionId))
      .on('broadcast', { event: 'reset' }, () => ref.current())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [sectionId])
}

/** Tell every open deck and editor for this board that it was just reset. */
export async function announceBoardReset(sectionId: string) {
  if (!isSupabaseConfigured) return
  const channel = supabase.channel(topic(sectionId))
  const status = await new Promise<string>(resolve => channel.subscribe(resolve))
  if (status === 'SUBSCRIBED') await channel.send({ type: 'broadcast', event: 'reset', payload: {} })
  await supabase.removeChannel(channel)
}
