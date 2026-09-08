import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AITB_POOLS } from '../lib/aitbActivities'
import { DRAW_STYLES, styleUsesSlots, type DrawSource, type DrawStyle, type StoredDrawStyle } from '../lib/drawOptions'
import { AitbPoolEditor } from './AitbPoolEditor'
import { CardSlotItemsEditor } from './CardSlotItemsEditor'

// The whole draw configuration for one card, in one panel.
//
// This replaces the hardcoded per-module maps: any card can now carry a draw,
// the admin picks how it is presented (wheel, deal, cups, plain list), and each
// slot chooses whether it draws from the shared house vocabulary or from a list
// belonging to this card alone. Nothing here needs a deploy.

type SlotRow = {
  id: string
  position: number
  label: string
  emoji: string | null
  source: DrawSource
  pool_key: string | null
  deal_count: number
  in_prompt: boolean
}

const POOL_KEYS = Object.keys(AITB_POOLS)

export function CardDrawEditor({ taskId, style, spins, images, onTaskChange, onSlotsChange }: {
  taskId: string
  style: StoredDrawStyle | null
  spins: number
  images: boolean
  /** Persists the card-level columns and lifts the new values to the page. */
  onTaskChange: (changes: { draw_style?: DrawStyle | null; draw_spins?: number; draw_images?: boolean }) => void
  /** Lets the page re-read the draw config after slots change. */
  onSlotsChange: () => void
}) {
  const [slots, setSlots] = useState<SlotRow[] | null>(null)

  const load = () => {
    supabase.from('bingo_draw_slots')
      .select('id, position, label, emoji, source, pool_key, deal_count, in_prompt')
      .eq('task_id', taskId).order('position')
      .then(({ data }) => setSlots((data as SlotRow[]) ?? []))
  }
  useEffect(load, [taskId])

  const refresh = () => { load(); onSlotsChange() }

  const addSlot = async () => {
    await supabase.from('bingo_draw_slots').insert({
      task_id: taskId,
      position: slots?.length ?? 0,
      label: `Slot ${(slots?.length ?? 0) + 1}`,
      emoji: '🎲',
      source: 'card',
      pool_key: null,
      deal_count: 1,
      in_prompt: false,
    })
    refresh()
  }

  const patchSlot = async (id: string, changes: Partial<SlotRow>) => {
    await supabase.from('bingo_draw_slots').update(changes).eq('id', id)
    refresh()
  }

  const removeSlot = async (id: string) => {
    if (!confirm('Remove this slot? Its own option list is deleted with it.')) return
    await supabase.from('bingo_draw_slots').delete().eq('id', id)
    refresh()
  }

  const usesSlots = styleUsesSlots(style)

  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold text-gray-900">🎲 Draw</h2>
      <p className="text-xs text-gray-400 mt-1">
        Give this card something the team draws — colours, a riddle, prompt words, checkpoints.
        Pick how it looks, then set up what each slot can land on.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Draw design</label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onTaskChange({ draw_style: null })}
            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
              !style ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            No draw
          </button>
          {DRAW_STYLES.map(s => (
            <button key={s.value} title={s.hint}
              onClick={() => onTaskChange({ draw_style: s.value })}
              className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                style === s.value ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {style && (
          <p className="text-xs text-gray-400 mt-2">{DRAW_STYLES.find(s => s.value === style)?.hint}</p>
        )}

        {style && usesSlots && (
          <div className="flex flex-wrap items-center gap-6 mt-5 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Re-draws allowed
              <input type="number" min={1} max={10} value={spins}
                onChange={e => onTaskChange({ draw_spins: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                className="w-16 px-2 py-1 border border-gray-200 rounded text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={images} onChange={e => onTaskChange({ draw_images: e.target.checked })} />
              Show option artwork instead of plain text
            </label>
          </div>
        )}
      </div>

      {style && usesSlots && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-gray-900">Slots</h3>
            <button onClick={addSlot}
              className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 transition-colors">
              + Add slot
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            One wheel / card each, drawn in this order. <b>Deal</b> is how many items that
            slot hands the team — set it to 4 for something like “your team’s 4 colours”.
            <b>With prompt</b> chains what it draws into a sentence the team can copy into an AI tool;
            <b>Without prompt</b> just shows what they drew.
          </p>

          {slots === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No slots yet — add the first one.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {slots.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <input defaultValue={s.emoji ?? ''} maxLength={4} placeholder="🎲"
                    onBlur={e => patchSlot(s.id, { emoji: e.target.value || null })}
                    className="w-12 px-2 py-1 border border-gray-200 rounded text-center text-sm" />
                  <input defaultValue={s.label}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) patchSlot(s.id, { label: v }) }}
                    className="flex-1 min-w-[8rem] px-2 py-1 border border-gray-200 rounded text-sm font-medium" />
                  <select value={s.source === 'card' ? 'card' : (s.pool_key ?? POOL_KEYS[0])}
                    onChange={e => {
                      const v = e.target.value
                      patchSlot(s.id, v === 'card'
                        ? { source: 'card' as DrawSource, pool_key: null }
                        : { source: 'pool' as DrawSource, pool_key: v })
                    }}
                    title="Where this slot's options come from"
                    className="px-2 py-1 border border-gray-200 rounded text-sm">
                    <option value="card">This card’s own list</option>
                    {POOL_KEYS.map(k => <option key={k} value={k}>Shared pool · {k}</option>)}
                  </select>
                  <select value={s.in_prompt ? 'yes' : 'no'}
                    onChange={e => patchSlot(s.id, { in_prompt: e.target.value === 'yes' })}
                    title="Whether what this slot draws is chained into an AI prompt the team can copy"
                    className="px-2 py-1 border border-gray-200 rounded text-sm">
                    <option value="yes">With prompt</option>
                    <option value="no">Without prompt</option>
                  </select>
                  {style !== 'spin' && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                    Deal
                    <input type="number" min={1} max={12} defaultValue={s.deal_count ?? 1}
                      onBlur={e => {
                        const v = Math.min(12, Math.max(1, Number(e.target.value) || 1))
                        e.target.value = String(v)
                        if (v !== (s.deal_count ?? 1)) patchSlot(s.id, { deal_count: v })
                      }}
                      className="w-14 px-2 py-1 border border-gray-200 rounded text-sm text-center font-bold" />
                    <span className="text-gray-400">per team</span>
                  </label>
                  )}
                  <button onClick={() => removeSlot(s.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Each slot's options, edited in whichever store it reads from. */}
      {style && usesSlots && (slots ?? []).map(s => (
        s.source === 'pool'
          ? s.pool_key && <AitbPoolEditor key={s.id} poolKey={s.pool_key} emoji={s.emoji ?? '🎲'} label={s.label} />
          : <CardSlotItemsEditor key={s.id} taskId={taskId} slotId={s.id} emoji={s.emoji ?? '🎲'} label={s.label} />
      ))}
    </div>
  )
}
