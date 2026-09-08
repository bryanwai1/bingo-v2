// A card's draw shape and its options, read from the database.
//
// Replaces the hardcoded module maps: slots, presentation style, spin cap and
// artwork are all rows now, so a new draw is an admin task rather than a deploy
// and any card can have one. Each slot resolves its own options — from the
// shared house pools or from the card's own bank — under a single key, so the
// presentation never has to know which store it came from.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AitbModuleSlot } from '../lib/aitbActivities'
import { slotKey, type DrawOption, type SlotRow } from '../lib/drawOptions'

export type DrawConfig = {
  slots: AitbModuleSlot[]
  mode: 'pick' | 'spin' | 'deal' | 'gamepick' | 'list'
  /** Re-draws allowed before the result locks. */
  spins: number
  /** Show the option artwork rather than plain text. */
  images: boolean
  /** Options for every slot, keyed by that slot's source key. */
  options: Record<string, DrawOption[]>
}

export function useCardDrawConfig(taskId: string | null | undefined) {
  const [config, setConfig] = useState<DrawConfig | null>(null)
  const [loading, setLoading] = useState(!!taskId)

  const load = useCallback(async () => {
    if (!taskId) { setConfig(null); setLoading(false); return }
    setLoading(true)

    const [slotRes, taskRes] = await Promise.all([
      supabase.from('bingo_draw_slots')
        .select('id, position, label, emoji, source, pool_key, deal_count, in_prompt')
        .eq('task_id', taskId).order('position'),
      supabase.from('bingo_tasks')
        .select('draw_style, draw_spins, draw_images').eq('id', taskId).maybeSingle(),
    ])

    const rows = (slotRes.data ?? []) as SlotRow[]
    const task = taskRes.data as
      { draw_style: string | null; draw_spins: number | null; draw_images: boolean | null } | null

    // draw_style is what says a card has a draw. Slots may be empty on purpose:
    // 'gamepick' tracks a fixed list and 'list' uses the card's flat bank.
    if (!task?.draw_style) { setConfig(null); setLoading(false); return }

    // Fetch each store once, however many slots read from it.
    const poolKeys = [...new Set(rows.filter(r => r.source === 'pool' && r.pool_key).map(r => r.pool_key!))]
    const cardSlotIds = rows.filter(r => r.source === 'card').map(r => r.id)

    const [poolRes, itemRes] = await Promise.all([
      poolKeys.length
        ? supabase.from('aitb_pool_items')
            .select('pool_key, label, photo_url').in('pool_key', poolKeys).order('sort_order')
        : Promise.resolve({ data: [] as { pool_key: string; label: string; photo_url: string | null }[] }),
      cardSlotIds.length
        ? supabase.from('bingo_draw_items')
            .select('slot_id, label, hint, hex, photo_url').in('slot_id', cardSlotIds).order('position')
        : Promise.resolve({ data: [] as { slot_id: string; label: string; hint: string | null; hex: string | null; photo_url: string | null }[] }),
    ])

    const options: Record<string, DrawOption[]> = {}
    for (const r of poolRes.data ?? []) {
      const key = `pool:${r.pool_key}`
      ;(options[key] ??= []).push({ label: r.label, photoUrl: r.photo_url })
    }
    for (const r of itemRes.data ?? []) {
      const key = `card:${r.slot_id}`
      ;(options[key] ??= []).push({ label: r.label, photoUrl: r.photo_url, hex: r.hex, hint: r.hint })
    }

    setConfig({
      slots: rows.map(r => ({
        emoji: r.emoji ?? '', label: r.label, pool: slotKey(r),
        count: r.deal_count ?? 1, inPrompt: r.in_prompt ?? false,
      })),
      mode: task.draw_style as DrawConfig['mode'],
      spins: task.draw_spins ?? 1,
      images: task.draw_images ?? false,
      options,
    })
    setLoading(false)
  }, [taskId])

  useEffect(() => { void load() }, [load])

  return { config, loading, reload: load }
}
