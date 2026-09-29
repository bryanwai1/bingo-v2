import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type TaskSample = {
  id: string
  task_id: string
  sort_order: number
  media_url: string
  media_type: 'image' | 'video'
  caption: string | null
}

/** A card's admin-uploaded samples (bingo_task_samples), in display order. */
export function useTaskSamples(taskId: string | null | undefined) {
  const [samples, setSamples] = useState<TaskSample[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!taskId) { setLoading(false); return }
    const { data } = await supabase.from('bingo_task_samples').select('*').eq('task_id', taskId).order('sort_order')
    setSamples((data ?? []) as TaskSample[])
    setLoading(false)
  }, [taskId])

  useEffect(() => { load() }, [load])

  return { samples, loading, reload: load }
}
