import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// The option list belonging to one slot of one card (bingo_draw_items rows
// carrying that slot_id). The sibling AitbPoolEditor edits the shared house
// pools; this edits a list only this card draws from, so a venue-specific
// wheel needs no new pool key.
//
// Alongside the label, each option carries the two optional extras the draw
// system understands: a hint the team may ask for, and an answer only a
// facilitator ever sees — the participant payload never selects `detail`.

type ItemRow = {
  id: string
  position: number
  label: string
  hint: string | null
  detail: string | null
  hex: string | null
  photo_url: string | null
}

const BUCKET = 'media'
const MAX_FILE_BYTES = 5 * 1024 * 1024

async function uploadItemPhoto(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Image must be under 5MB')
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `aitb-media/cards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function CardSlotItemsEditor({ taskId, slotId, emoji, label }: {
  taskId: string
  slotId: string
  emoji: string
  label: string
}) {
  const [items, setItems] = useState<ItemRow[] | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    supabase.from('bingo_draw_items')
      .select('id, position, label, hint, detail, hex, photo_url')
      .eq('slot_id', slotId).order('position')
      .then(({ data }) => setItems((data as ItemRow[]) ?? []))
  }, [slotId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    const text = newLabel.trim()
    if (!text) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('bingo_draw_items').insert({
      task_id: taskId, slot_id: slotId, position: items?.length ?? 0, label: text,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setNewLabel('')
    load()
  }

  const patch = async (id: string, changes: Partial<ItemRow>) => {
    await supabase.from('bingo_draw_items').update(changes).eq('id', id)
    load()
  }

  const setPhoto = async (id: string, file: File) => {
    setError('')
    try {
      await patch(id, { photo_url: await uploadItemPhoto(file) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload photo')
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this option? Teams that already drew it keep it.')) return
    await supabase.from('bingo_draw_items').delete().eq('id', id)
    load()
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!items) return
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const a = items[index], b = items[j]
    // Park one row out of the way first — positions are unique per slot.
    await supabase.from('bingo_draw_items').update({ position: -1 }).eq('id', a.id)
    await supabase.from('bingo_draw_items').update({ position: a.position }).eq('id', b.id)
    await supabase.from('bingo_draw_items').update({ position: b.position }).eq('id', a.id)
    load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">{emoji} {label} options</h3>
      <p className="text-xs text-gray-400 mb-4">
        This card’s own list. The hint is shown to a team on request; the answer is never shown to participants.
      </p>

      {items === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 italic mb-4">No options yet — add the first one below.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {items.map((item, i) => (
            <div key={item.id} className="border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {item.photo_url
                    ? <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-gray-300 text-lg">🖼️</span>}
                </div>
                <input type="color" value={item.hex ?? '#cccccc'}
                  onChange={e => patch(item.id, { hex: e.target.value })}
                  title="Optional swatch"
                  className="w-8 h-8 rounded border border-gray-200 flex-shrink-0 cursor-pointer" />
                <input defaultValue={item.label}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== item.label) patch(item.id, { label: v }) }}
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <label className="text-xs font-bold text-violet-600 hover:text-violet-800 cursor-pointer flex-shrink-0">
                  {item.photo_url ? 'Replace photo' : 'Add photo'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(item.id, f) }} />
                </label>
                {item.photo_url && (
                  <button onClick={() => patch(item.id, { photo_url: null })}
                    className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Remove photo</button>
                )}
                <button onClick={() => remove(item.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">
                  Delete
                </button>
              </div>
              <div className="flex gap-2 mt-2 pl-11">
                <input defaultValue={item.hint ?? ''} placeholder="Hint (shown on request)"
                  onBlur={e => patch(item.id, { hint: e.target.value.trim() || null })}
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-100 bg-gray-50 rounded text-xs focus:outline-none" />
                <input defaultValue={item.detail ?? ''} placeholder="Answer (facilitator only)"
                  onBlur={e => patch(item.id, { detail: e.target.value.trim() || null })}
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-100 bg-gray-50 rounded text-xs focus:outline-none" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 font-bold mb-2">{error}</p>}

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder={`Add a new ${label.toLowerCase()} option…`}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <button onClick={add} disabled={busy || !newLabel.trim()}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors whitespace-nowrap">
          {busy ? 'Adding…' : '+ Add'}
        </button>
      </div>
    </div>
  )
}
