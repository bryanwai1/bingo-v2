import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AITB_POOLS, type AitbPoolKey } from '../lib/aitbActivities'
import type { AitbPoolItem } from '../types/database'

export type AitbPoolOption = { label: string; photoUrl: string | null }

/** Admin-editable word/photo pools for every interactive module, live from
 *  aitb_pool_items. Falls back to the hardcoded AITB_POOLS defaults while
 *  loading (or if a pool has no rows yet), so the module never renders empty. */
export function useAitbPools() {
  const [items, setItems] = useState<AitbPoolItem[] | null>(null)

  useEffect(() => {
    let active = true
    supabase.from('aitb_pool_items').select('*').order('pool_key').order('sort_order')
      .then(({ data }) => { if (active) setItems((data as AitbPoolItem[]) ?? []) })

    const channel = supabase
      .channel('aitb-pool-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aitb_pool_items' }, () => {
        supabase.from('aitb_pool_items').select('*').order('pool_key').order('sort_order')
          .then(({ data }) => { if (active) setItems((data as AitbPoolItem[]) ?? []) })
      })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  const pools: Record<AitbPoolKey, AitbPoolOption[]> = Object.fromEntries(
    (Object.keys(AITB_POOLS) as AitbPoolKey[]).map(key => {
      const rows = items?.filter(i => i.pool_key === key) ?? []
      const options = rows.length > 0
        ? rows.map(r => ({ label: r.label, photoUrl: r.photo_url }))
        : AITB_POOLS[key].map(label => ({ label, photoUrl: null }))
      return [key, options]
    })
  ) as Record<AitbPoolKey, AitbPoolOption[]>

  return { pools, loading: items === null }
}
