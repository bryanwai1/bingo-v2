// Breakout Hunt — the puzzle bank editor, on the card's edit page.
//
// Each puzzle carries an image (the rebus you upload), the answer it points to,
// spellings that should also pass, and a hint. Only the answer is checked by
// the app; the photo a team takes is evidence and is never auto-verified.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_BREAKOUT_PUZZLES, type BreakoutPuzzle } from '../lib/breakoutHunt'
import { PanelSaveBar } from './PanelSaveBar'

export function BreakoutHuntAdminPanel({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<BreakoutPuzzle[]>([])
  const [draft, setDraft] = useState<BreakoutPuzzle[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edits are held here until Save, so a value typed and then navigated away
  // from is never silently dropped.
  const key = (p: BreakoutPuzzle) => `${p.answer}|${p.aliases.join(',')}|${p.hint ?? ''}|${p.prompt ?? ''}`
  const dirty = draft.length === items.length &&
    draft.some((d, i) => key(d) !== key(items[i]))

  const saveAll = async () => {
    setError(null)
    const changed = draft.filter((d, i) => items[i] && key(d) !== key(items[i]))
    for (const d of changed) {
      const { error: err } = await supabase.from('bingo_breakout_puzzles')
        .update({ answer: d.answer, aliases: d.aliases, hint: d.hint, prompt: d.prompt })
        .eq('id', d.id)
      if (err) { setError(err.message); return }
    }
    setItems(draft)
  }

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('bingo_breakout_puzzles')
      .select('id, position, image_url, prompt, answer, aliases, hint')
      .eq('task_id', taskId).order('position')
    if (err) { setError(err.message); return }
    setItems((data ?? []) as BreakoutPuzzle[])
  }, [taskId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setDraft(items) }, [items])

  const seed = async () => {
    if (items.length > 0 && !confirm('Replace the current puzzles with the 10 defaults?')) return
    setBusy(true); setError(null)
    try {
      await supabase.from('bingo_breakout_puzzles').delete().eq('task_id', taskId)
      const { error: err } = await supabase.from('bingo_breakout_puzzles').insert(
        DEFAULT_BREAKOUT_PUZZLES.map((p, i) => ({
          task_id: taskId, position: i,
          answer: p.answer, aliases: p.aliases, hint: p.hint,
        })),
      )
      if (err) { setError(err.message); return }
      await load()
    } finally { setBusy(false) }
  }

  const patch = async (id: string, fields: Partial<BreakoutPuzzle>) => {
    setItems(prev => prev.map(p => (p.id === id ? { ...p, ...fields } : p)))
    const { error: err } = await supabase.from('bingo_breakout_puzzles').update(fields).eq('id', id)
    if (err) setError(err.message)
  }

  const uploadImage = async (id: string, file: File) => {
    setBusy(true); setError(null)
    try {
      const path = `bingo-media/breakout-puzzles/${taskId}-${id}-${Date.now()}.${file.name.split('.').pop() || 'png'}`
      const up = await supabase.storage.from('media').upload(path, file, { contentType: file.type || 'image/png' })
      if (up.error) { setError(up.error.message); return }
      await patch(id, { image_url: supabase.storage.from('media').getPublicUrl(path).data.publicUrl })
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Breakout Hunt Puzzles</h2>
      <p className="text-xs text-gray-400 mb-4">
        Teams must decode a puzzle before the camera opens, so the answer is what the app checks.
        The photo they take afterwards is kept as evidence, not verified.
      </p>

      {error && (
        <p className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">{error}</p>
      )}

      {items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500 mb-3">No puzzles yet.</p>
          <button onClick={() => void seed()} disabled={busy}
            className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-50">
            Load the 10 default puzzles
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {draft.map(p => (
              <div key={p.id} className="border border-gray-200 rounded-lg p-3 flex gap-3">
                <div className="w-28 flex-shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt={`Puzzle ${p.position + 1}`}
                         className="w-full aspect-square object-contain rounded border border-gray-200 bg-gray-50" />
                  ) : (
                    <div className="w-full aspect-square grid place-items-center rounded border border-dashed border-gray-300 text-gray-300 text-2xl">
                      ?
                    </div>
                  )}
                  <label className="mt-1 block text-center text-[11px] font-bold text-violet-600 cursor-pointer hover:text-violet-800">
                    {p.image_url ? 'Replace' : 'Upload image'}
                    <input type="file" accept="image/*" className="hidden" disabled={busy}
                      onChange={e => {
                        const f = e.target.files?.[0]; e.target.value = ''
                        if (f) void uploadImage(p.id, f)
                      }} />
                  </label>
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-gray-400 w-6">{p.position + 1}.</span>
                    <input value={p.answer}
                      onChange={e => setDraft(d => d.map(x => x.id === p.id ? { ...x, answer: e.target.value } : x))}
                      placeholder="Answer, e.g. Clock"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <input value={p.aliases.join(', ')}
                    onChange={e => setDraft(d => d.map(x => x.id === p.id
                      ? { ...x, aliases: e.target.value.split(',').map(y => y.trim()).filter(Boolean) } : x))}
                    placeholder="Also accept (comma separated), e.g. watch, wall clock"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  <input value={p.hint ?? ''}
                    onChange={e => setDraft(d => d.map(x => x.id === p.id ? { ...x, hint: e.target.value || null } : x))}
                    placeholder="Hint, shown when a team taps 💡"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  <input value={p.prompt ?? ''}
                    onChange={e => setDraft(d => d.map(x => x.id === p.id ? { ...x, prompt: e.target.value || null } : x))}
                    placeholder="Optional text / emoji rebus, shown under the image"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              </div>
            ))}
          </div>
          <PanelSaveBar dirty={dirty} onSave={saveAll} label="Save puzzles" />
          <button onClick={() => void seed()} disabled={busy}
            className="mt-4 text-xs font-bold text-gray-400 hover:text-red-500">
            Reset to the 10 defaults
          </button>
        </>
      )}
    </div>
  )
}
