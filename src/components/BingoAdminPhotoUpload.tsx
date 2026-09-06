import { useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import type { TaskPhoto } from '../types/database'

interface BingoAdminPhotoUploadProps {
  taskId: string
}

export function BingoAdminPhotoUpload({ taskId }: BingoAdminPhotoUploadProps) {
  const { photos, loading, addPhoto, deletePhoto, updatePosition, updateCaption, reorderPhotos } = useBingoTaskPhotos(taskId)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<TaskPhoto | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (photos.length + files.length > 20) {
      alert('Max 20 photos. You can add ' + (20 - photos.length) + ' more.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB). Skipped.`); continue }
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('media').upload(`bingo-media/photos/${fileName}`, file)
        if (error) { alert(`Upload failed: ${error.message}`); continue }
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(`bingo-media/photos/${fileName}`)
        await addPhoto(taskId, urlData.publicUrl, photos.length + i)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const getPositionFromEvent = useCallback((e: MouseEvent | TouchEvent) => {
    if (!cropRef.current) return null
    const rect = cropRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)))
    return { x, y }
  }, [])

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!editing) return
    isDragging.current = true
    e.preventDefault()
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return
      const pos = getPositionFromEvent(ev)
      if (!pos) return
      setEditing(prev => prev ? { ...prev, position_x: pos.x, position_y: pos.y } : prev)
    }
    const onUp = async (ev: MouseEvent | TouchEvent) => {
      isDragging.current = false
      const pos = getPositionFromEvent(ev)
      if (pos && editing) {
        setEditing(prev => prev ? { ...prev, position_x: pos.x, position_y: pos.y } : prev)
        await updatePosition(editing.id, pos.x, pos.y)
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [editing, getPositionFromEvent, updatePosition])

  const moveUp = (index: number) => {
    if (index === 0) return
    const r = [...photos]; [r[index - 1], r[index]] = [r[index], r[index - 1]]; reorderPhotos(r)
  }
  const moveDown = (index: number) => {
    if (index === photos.length - 1) return
    const r = [...photos]; [r[index], r[index + 1]] = [r[index + 1], r[index]]; reorderPhotos(r)
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Loading photos...</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900">Photo Carousel</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Photos shown as carousel on participant view · Max 20 · Drag to set focal point
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{photos.length} / 20</span>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= 20}
            className="px-4 py-2 bg-violet-600 a-text rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {uploading ? 'Uploading...' : '+ Add Photo'}
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-3 cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-4xl">🖼️</div>
          <p className="text-sm text-gray-400 font-medium">Click to upload hero photo</p>
          <p className="text-xs text-gray-300">JPG or PNG · max 5 MB</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo: TaskPhoto, index: number) => (
            <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50" style={{ aspectRatio: '4/3' }}>
              <img
                src={photo.photo_url}
                alt={`Hero ${index + 1}`}
                className="w-full h-full object-cover"
                style={{ objectPosition: `${photo.position_x ?? 50}% ${photo.position_y ?? 50}%` }}
                draggable={false}
              />
              {index === 0 && (
                <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-violet-600 a-text text-xs font-black">Hero</div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                <button onClick={() => setEditing(photo)} className="px-3 py-1 bg-white text-gray-800 rounded-lg text-xs font-bold hover:bg-gray-100">✥ Adjust</button>
                <div className="flex gap-1">
                  <button onClick={() => moveUp(index)} disabled={index === 0} className="w-7 h-7 bg-white/90 text-gray-700 rounded-lg text-xs font-bold disabled:opacity-30">←</button>
                  <button onClick={() => moveDown(index)} disabled={index === photos.length - 1} className="w-7 h-7 bg-white/90 text-gray-700 rounded-lg text-xs font-bold disabled:opacity-30">→</button>
                </div>
                <button onClick={() => deletePhoto(photo.id)} className="px-3 py-1 bg-red-500 a-text rounded-lg text-xs font-bold hover:bg-red-600">Delete</button>
              </div>
            </div>
          ))}
          {photos.length < 20 && (
            <div
              className="rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-violet-300 hover:bg-violet-50 transition-colors"
              style={{ aspectRatio: '4/3' }}
              onClick={() => fileRef.current?.click()}
            >
              <span className="text-2xl text-gray-300">+</span>
              <span className="text-xs text-gray-300 font-medium">Add more</span>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-bold text-gray-900">Adjust Crop Position</h4>
                <p className="text-xs text-gray-400 mt-0.5">Drag to set the focal point</p>
              </div>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center font-bold">✕</button>
            </div>
            <div
              ref={cropRef}
              className="relative rounded-xl overflow-hidden cursor-crosshair select-none"
              style={{ aspectRatio: '4/3', touchAction: 'none' }}
              onMouseDown={startDrag}
              onTouchStart={startDrag}
            >
              <img
                src={editing.photo_url}
                alt="Editor"
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: `${editing.position_x}% ${editing.position_y}%` }}
                draggable={false}
              />
              <div
                className="absolute w-6 h-6 pointer-events-none"
                style={{ left: `${editing.position_x}%`, top: `${editing.position_y}%`, transform: 'translate(-50%,-50%)' }}
              >
                <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 a-surface-20 -translate-y-1/2" />
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 a-surface-20 -translate-x-1/2" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">{Math.round(editing.position_x)}% × {Math.round(editing.position_y)}%</span>
              <button
                onClick={async () => { await updatePosition(editing.id, 50, 50); setEditing(prev => prev ? { ...prev, position_x: 50, position_y: 50 } : prev) }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Reset to center
              </button>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Caption</label>
              <input
                type="text"
                placeholder="Optional caption..."
                value={editing.caption ?? ''}
                onChange={e => setEditing(prev => prev ? { ...prev, caption: e.target.value } : prev)}
                onBlur={async () => { if (editing) await updateCaption(editing.id, editing.caption ?? '') }}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
                maxLength={120}
              />
            </div>
            <button onClick={() => setEditing(null)} className="mt-3 w-full py-2.5 bg-violet-600 a-text rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
