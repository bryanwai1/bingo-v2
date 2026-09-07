import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AitbPoolItem } from '../types/database'
import type { AitbPoolKey } from '../lib/aitbActivities'

// CRUD for one interactive-module draw pool (e.g. Nerf Prompt Cups' Character
// pool, Roulette's Genre pool) — admin can add/edit/delete/reorder options and
// attach a photo, live from aitb_pool_items. Every mission page reads the same
// table (useAitbPools), so a change here shows up for players immediately —
// no code deploy, no re-seed.

const BUCKET = 'media'
const MAX_FILE_BYTES = 5 * 1024 * 1024

async function uploadPoolPhoto(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Image must be under 5MB')
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `aitb-media/pools/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function AitbPoolEditor({ poolKey, emoji, label }: { poolKey: AitbPoolKey; emoji: string; label: string }) {
  const [items, setItems] = useState<AitbPoolItem[] | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = () => {
    supabase.from('aitb_pool_items').select('*').eq('pool_key', poolKey).order('sort_order')
      .then(({ data }) => setItems((data as AitbPoolItem[]) ?? []))
  }
  useEffect(load, [poolKey])

  const addItem = async () => {
    const text = newLabel.trim()
    if (!text) return
    setAdding(true); setError('')
    try {
      const photo_url = newFile ? await uploadPoolPhoto(newFile) : null
      const sort_order = (items?.length ?? 0)
      const { error: insertError } = await supabase.from('aitb_pool_items')
        .insert({ pool_key: poolKey, label: text, photo_url, sort_order })
      if (insertError) throw insertError
      setNewLabel(''); setNewFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Remove this option? Teams mid-draw won’t be affected, but it can no longer be drawn.')) return
    await supabase.from('aitb_pool_items').delete().eq('id', id)
    load()
  }

  const saveEdit = async (id: string) => {
    const text = editLabel.trim()
    if (!text) return
    await supabase.from('aitb_pool_items').update({ label: text }).eq('id', id)
    setEditingId(null)
    load()
  }

  const replacePhoto = async (id: string, file: File) => {
    setError('')
    try {
      const photo_url = await uploadPoolPhoto(file)
      await supabase.from('aitb_pool_items').update({ photo_url }).eq('id', id)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload photo')
    }
  }

  const removePhoto = async (id: string) => {
    await supabase.from('aitb_pool_items').update({ photo_url: null }).eq('id', id)
    load()
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!items) return
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const a = items[index], b = items[j]
    await Promise.all([
      supabase.from('aitb_pool_items').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('aitb_pool_items').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">{emoji} {label} options</h3>
      <p className="text-xs text-gray-400 mb-4">
        What a team can draw for {label}. Add, edit, remove, or attach a photo — changes apply immediately.
      </p>

      {items === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 italic mb-4">No options yet — add the first one below.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
              </div>

              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                {item.photo_url
                  ? <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-gray-300 text-xl">🖼️</span>}
              </div>

              {editingId === item.id ? (
                <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => saveEdit(item.id)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                  className="flex-1 min-w-0 px-2 py-1 border border-violet-300 rounded text-sm focus:outline-none" />
              ) : (
                <button onClick={() => { setEditingId(item.id); setEditLabel(item.label) }}
                  className="flex-1 min-w-0 text-left text-sm font-medium text-gray-800 hover:text-violet-600 truncate">
                  {item.label}
                </button>
              )}

              <label className="text-xs font-bold text-violet-600 hover:text-violet-800 cursor-pointer flex-shrink-0">
                {item.photo_url ? 'Replace' : 'Add photo'}
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) replacePhoto(item.id, f) }} />
              </label>
              {item.photo_url && (
                <button onClick={() => removePhoto(item.id)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                  Remove photo
                </button>
              )}
              <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 font-bold mb-2">{error}</p>}

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem() }}
          placeholder={`Add a new ${label.toLowerCase()} option…`}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <label className="text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer px-2 whitespace-nowrap">
          {newFile ? `📎 ${newFile.name.slice(0, 16)}` : '📎 Photo (optional)'}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => setNewFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={addItem} disabled={adding || !newLabel.trim()}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors whitespace-nowrap">
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </div>
    </div>
  )
}
