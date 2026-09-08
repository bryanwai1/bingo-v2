// The bank a card deals from, edited on the card's edit page.
//
// Colour Hunt, Escape the Mall and Route Master each promise the team something
// when they open the card. This is where that content lives and how many items
// each team is dealt.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_DRAW_BANKS, type DrawItem } from '../lib/cardDraw'
import type { BingoTask } from '../types/database'
import { PanelSaveBar } from './PanelSaveBar'

export function CardDrawAdminPanel({ task, onChange }: {
  task: BingoTask
  onChange?: (patch: Partial<BingoTask>) => void
}) {
  const [items, setItems] = useState<DrawItem[]>([])
  const [teamsDrawn, setTeamsDrawn] = useState(0)
  const [draft, setDraft] = useState<DrawItem[]>([])
  const [countDraft, setCountDraft] = useState(task.draw_count ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = task.draw_count ?? 0

  const key = (i: DrawItem) => `${i.label}|${i.hint ?? ''}|${i.detail ?? ''}|${i.hex ?? ''}`
  const dirty = countDraft !== count ||
    (draft.length === items.length && draft.some((d, n) => key(d) !== key(items[n])))

  const saveAll = async () => {
    setError(null)
    if (countDraft !== count) await save({ draw_count: Math.max(0, Math.min(12, countDraft)) })
    for (const d of draft.filter((d, n) => items[n] && key(d) !== key(items[n]))) {
      const { error: err } = await supabase.from('bingo_draw_items')
        .update({ label: d.label, hint: d.hint, detail: d.detail, hex: d.hex }).eq('id', d.id)
      if (err) { setError(err.message); return }
    }
    setItems(draft)
  }
  const preset = DEFAULT_DRAW_BANKS[task.title]

  const load = useCallback(async () => {
    const [bank, assigned] = await Promise.all([
      supabase.from('bingo_draw_items')
        .select('id, position, label, hint, detail, hex').eq('task_id', task.id).order('position'),
      supabase.from('bingo_draw_assignments').select('team_id').eq('task_id', task.id),
    ])
    if (bank.error) { setError(bank.error.message); return }
    setItems((bank.data ?? []) as DrawItem[])
    setTeamsDrawn(new Set((assigned.data ?? []).map(a => a.team_id)).size)
  }, [task.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setDraft(items) }, [items])
  useEffect(() => { setCountDraft(task.draw_count ?? 0) }, [task.draw_count])

  const save = async (patch: Partial<BingoTask>) => {
    const { error: err } = await supabase.from('bingo_tasks').update(patch).eq('id', task.id)
    if (err) { setError(err.message); return }
    onChange?.(patch)
  }

  const seed = async () => {
    if (!preset) return
    if (items.length > 0 && !confirm(`Replace the current ${items.length} items with the ${preset.items.length} defaults?`)) return
    setBusy(true); setError(null)
    try {
      await supabase.from('bingo_draw_items').delete().eq('task_id', task.id)
      const { error: err } = await supabase.from('bingo_draw_items').insert(
        preset.items.map((it, i) => ({
          task_id: task.id, position: i,
          label: it.label, hint: it.hint ?? null, detail: it.detail ?? null, hex: it.hex ?? null,
        })),
      )
      if (err) { setError(err.message); return }
      if (count !== preset.count) await save({ draw_count: preset.count })
      await load()
    } finally { setBusy(false) }
  }

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('bingo_draw_items').delete().eq('id', id)
  }

  const addItem = async () => {
    const position = items.reduce((m, i) => Math.max(m, i.position), -1) + 1
    const { data, error: err } = await supabase.from('bingo_draw_items')
      .insert({ task_id: task.id, position, label: 'New item' }).select().single()
    if (err) { setError(err.message); return }
    setItems(prev => [...prev, data as DrawItem])
  }

  const clearDraws = async () => {
    if (!confirm('Clear every team\'s draw on this card? They will each draw again next time they open it.')) return
    setBusy(true)
    try {
      await supabase.from('bingo_draw_assignments').delete().eq('task_id', task.id)
      await load()
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Team Draw</h2>
      <p className="text-xs text-gray-400 mb-4">
        What each team is dealt when they open this card. Items are spread across teams, so two
        teams rarely get the same set, and a team's draw is kept if they reopen the card.
        A <b>hint</b> is shown to the team on request; an <b>answer</b> is only ever visible here.
      </p>

      {error && (
        <p className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">{error}</p>
      )}

      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Deal</span>
          <input type="number" min={0} max={12} value={countDraft}
            onChange={e => setCountDraft(parseInt(e.target.value) || 0)}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <span className="text-xs text-gray-400">of {items.length} items per team</span>
        </label>
        <div className="flex-1" />
        {teamsDrawn > 0 && (
          <button onClick={() => void clearDraws()} disabled={busy}
            className="text-xs font-bold text-gray-400 hover:text-red-500">
            Clear {teamsDrawn} team draw{teamsDrawn === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {count === 0 && items.length > 0 && (
        <p className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
          Deal is 0, so nothing is shown to the team on this card.
        </p>
      )}

      {items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500 mb-1">This card deals nothing to teams.</p>
          <p className="text-xs text-gray-400 mb-3">
            Add items and set how many each team is dealt — they appear under the
            instructions when a team opens the card.
          </p>
          {preset ? (
            <button onClick={() => void seed()} disabled={busy}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
              Load the {preset.items.length} defaults
            </button>
          ) : (
            <button onClick={() => void addItem()} className="text-sm font-bold text-violet-600 hover:text-violet-800">
              + Add the first item
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {draft.map(it => (
              <div key={it.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
                <input type="color" value={it.hex ?? '#cccccc'}
                  onChange={e => setDraft(d => d.map(x => x.id === it.id ? { ...x, hex: e.target.value } : x))}
                  title="Optional swatch — used by Colour Hunt"
                  className="w-8 h-8 rounded cursor-pointer flex-shrink-0" />
                <input value={it.label}
                  onChange={e => setDraft(d => d.map(x => x.id === it.id ? { ...x, label: e.target.value } : x))}
                  className="flex-1 min-w-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <input value={it.hint ?? ''}
                  onChange={e => setDraft(d => d.map(x => x.id === it.id ? { ...x, hint: e.target.value || null } : x))}
                  placeholder="Hint — teams can see this"
                  title="Shown to the team when they tap Hint"
                  className="w-44 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <input value={it.detail ?? ''}
                  onChange={e => setDraft(d => d.map(x => x.id === it.id ? { ...x, detail: e.target.value || null } : x))}
                  placeholder="Answer — your eyes only"
                  title="Never shown to a team. For you, to settle an argument."
                  className="w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                <button onClick={() => void removeItem(it.id)}
                  className="text-xs font-bold text-gray-300 hover:text-red-500 px-1 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
          <PanelSaveBar dirty={dirty} onSave={saveAll} label="Save draw" />
          <div className="flex gap-4 mt-3">
            <button onClick={() => void addItem()} className="text-xs font-bold text-violet-600 hover:text-violet-800">
              + Add item
            </button>
            {preset && (
              <button onClick={() => void seed()} disabled={busy}
                className="text-xs font-bold text-gray-400 hover:text-red-500">
                Reset to the {preset.items.length} defaults
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
