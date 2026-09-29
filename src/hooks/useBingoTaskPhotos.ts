import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { removeMediaIfUnused } from '../lib/mediaCleanup'
import type { TaskPhoto } from '../types/database'

export function useBingoTaskPhotos(taskId?: string) {
  const [photos, setPhotos] = useState<TaskPhoto[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!taskId) { setLoading(false); return }
    const { data } = await supabase
      .from('bingo_task_photos')
      .select('*')
      .eq('task_id', taskId)
      .order('photo_order', { ascending: true })
    setPhotos(data || [])
    setLoading(false)
  }, [taskId])

  useEffect(() => { load() }, [load])

  const addPhoto = useCallback(async (taskIdArg: string, photoUrl: string, currentCount: number) => {
    const { data, error } = await supabase
      .from('bingo_task_photos')
      .insert({ task_id: taskIdArg, photo_url: photoUrl, photo_order: currentCount })
      .select()
      .single()
    if (error) {
      alert(`Failed to save photo: ${error.message}`)
      return null
    }
    if (data) setPhotos(prev => [...prev, data])
    return data
  }, [])

  const deletePhoto = useCallback(async (id: string) => {
    const url = photos.find(p => p.id === id)?.photo_url
    await supabase.from('bingo_task_photos').delete().eq('id', id)
    setPhotos(prev => prev.filter(p => p.id !== id))
    await removeMediaIfUnused(url)
  }, [photos])

  const updatePosition = useCallback(async (id: string, x: number, y: number) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, position_x: x, position_y: y } : p))
    await supabase.from('bingo_task_photos').update({ position_x: x, position_y: y }).eq('id', id)
  }, [])

  const updateCaption = useCallback(async (id: string, caption: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p))
    await supabase.from('bingo_task_photos').update({ caption }).eq('id', id)
  }, [])

  const reorderPhotos = useCallback(async (reordered: TaskPhoto[]) => {
    const updated = reordered.map((p, i) => ({ ...p, photo_order: i }))
    setPhotos(updated)
    await Promise.all(
      updated.map(p => supabase.from('bingo_task_photos').update({ photo_order: p.photo_order }).eq('id', p.id))
    )
  }, [])

  return { photos, loading, addPhoto, deletePhoto, updatePosition, updateCaption, reorderPhotos, reload: load }
}
