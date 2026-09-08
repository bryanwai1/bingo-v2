// Sign Splice Title — the card's admin settings.
//
// Lives on the card's edit page rather than on the tile in the Card Library:
// it is a tall block of per-card configuration, and the library tile is meant
// to stay scannable.
//
// Covers spec §6 for this card type — the Screen 4 fields, the title rules, the
// OCR bar, and unlocking a team whose title was locked by mistake.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoTask } from '../types/database'
import { PanelSaveBar } from './PanelSaveBar'

type FieldMode = 'hidden' | 'optional' | 'compulsory'
const MODES: FieldMode[] = ['hidden', 'optional', 'compulsory']

type TeamRow = { teamId: string; teamName: string; title: string; collected: number; total: number }

export function SignSpliceAdminPanel({ task, onChange }: {
  task: BingoTask
  /** Called with the patch after it has been written, so the page can restate. */
  onChange?: (patch: Partial<BingoTask>) => void
}) {
  const [rows, setRows] = useState<TeamRow[]>([])
  const [draft, setDraft] = useState({
    min: task.sign_splice_min_letters ?? 4,
    max: task.sign_splice_max_letters ?? 20,
    conf: Math.round((task.sign_splice_min_confidence ?? 0.7) * 100),
  })
  useEffect(() => {
    setDraft({
      min: task.sign_splice_min_letters ?? 4,
      max: task.sign_splice_max_letters ?? 20,
      conf: Math.round((task.sign_splice_min_confidence ?? 0.7) * 100),
    })
  }, [task.sign_splice_min_letters, task.sign_splice_max_letters, task.sign_splice_min_confidence])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: Partial<BingoTask>) => {
    setError(null)
    const { error: err } = await supabase.from('bingo_tasks').update(patch).eq('id', task.id)
    if (err) { setError(err.message); return }
    onChange?.(patch)
  }

  const loadTeams = useCallback(async () => {
    setBusy(true)
    try {
      const [titlesRes, lettersRes, teamsRes] = await Promise.all([
        supabase.from('bingo_sign_splice_titles').select('team_id, title').eq('task_id', task.id),
        supabase.from('bingo_sign_splice_letters').select('team_id, status').eq('task_id', task.id),
        supabase.from('bingo_teams').select('id, name'),
      ])
      const letters = lettersRes.data ?? []
      const names = new Map((teamsRes.data ?? []).map(t => [t.id as string, t.name as string]))
      setRows((titlesRes.data ?? []).map(t => {
        const mine = letters.filter(l => l.team_id === t.team_id)
        return {
          teamId: t.team_id as string,
          teamName: names.get(t.team_id as string) ?? String(t.team_id).slice(0, 8),
          title: t.title as string,
          collected: mine.filter(l => l.status === 'collected').length,
          total: mine.length,
        }
      }).sort((a, b) => a.teamName.localeCompare(b.teamName)))
      setLoaded(true)
    } finally {
      setBusy(false)
    }
  }, [task.id])

  useEffect(() => { void loadTeams() }, [loadTeams])

  // Clears the title, its letters and the photo log so the team picks again.
  // Collected letters go too — each is tied to a position in the old title, so
  // there is nothing meaningful to carry over.
  const unlock = async (r: TeamRow) => {
    if (!confirm(
      `Unlock ${r.teamName}'s title?\n\n"${r.title}" and the ${r.collected} letter(s) they have collected will be deleted, and they can choose a new title.`
    )) return
    setBusy(true)
    setError(null)
    try {
      await Promise.all([
        supabase.from('bingo_sign_splice_letters').delete().eq('task_id', task.id).eq('team_id', r.teamId),
        supabase.from('bingo_sign_splice_photos').delete().eq('task_id', task.id).eq('team_id', r.teamId),
      ])
      const { error: err } = await supabase.from('bingo_sign_splice_titles')
        .delete().eq('task_id', task.id).eq('team_id', r.teamId)
      if (err) { setError(err.message); return }
      await loadTeams()
    } finally {
      setBusy(false)
    }
  }

  const minLetters = task.sign_splice_min_letters ?? 4
  const maxLetters = task.sign_splice_max_letters ?? 20
  const confidencePct = Math.round((task.sign_splice_min_confidence ?? 0.7) * 100)
  const dirty = draft.min !== minLetters || draft.max !== maxLetters || draft.conf !== confidencePct

  const modeRow = (label: string, value: FieldMode, key: 'sign_splice_shop_input' | 'sign_splice_lot_input') => (
    <div className="mb-3">
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="flex rounded-lg overflow-hidden border border-gray-200">
        {MODES.map(m => (
          <button key={m} type="button" onClick={() => void save({ [key]: m } as Partial<BingoTask>)}
            className={`flex-1 py-2 text-sm font-bold capitalize transition-colors ${
              value === m ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            {m}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Sign Splice Settings</h2>
      <p className="text-xs text-gray-400 mb-4">
        How this letter hunt behaves for every team playing it.
      </p>

      {error && (
        <p className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
          {error}
        </p>
      )}

      <h3 className="text-sm font-bold text-gray-700 mb-2">Shop details screen</h3>
      {modeRow('Shop / sign name', task.sign_splice_shop_input ?? 'optional', 'sign_splice_shop_input')}
      {modeRow('Lot number', task.sign_splice_lot_input ?? 'optional', 'sign_splice_lot_input')}
      <p className="text-xs text-gray-400 mb-5 leading-snug">
        Hidden skips the screen entirely, and the shop is guessed from the sign instead — which is
        what stops the same shop being used twice, so guessing makes that rule less reliable.
      </p>

      <h3 className="text-sm font-bold text-gray-700 mb-2 pt-4 border-t border-gray-100">Title rules</h3>
      <div className="flex items-center gap-3 mb-3">
        {([['min', 'Min'], ['max', 'Max']] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">{label}</span>
            <input type="number" min={1} max={40} value={draft[key]}
              onChange={e => setDraft(d => ({ ...d, [key]: parseInt(e.target.value) || 0 }))}
              className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </label>
        ))}
        <span className="text-xs text-gray-400">letters</span>
      </div>
      <div className="flex gap-2 mb-2">
        {([['sign_splice_allow_spaces', 'Spaces', task.sign_splice_allow_spaces ?? false],
           ['sign_splice_allow_numbers', 'Numbers', task.sign_splice_allow_numbers ?? false]] as const).map(([key, label, on]) => (
          <button key={key} type="button" onClick={() => void save({ [key]: !on } as Partial<BingoTask>)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              on ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {label} {on ? 'allowed' : 'blocked'}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-5 leading-snug">
        Every letter needs its own shop, so a long title means a long hunt.
      </p>

      <h3 className="text-sm font-bold text-gray-700 mb-2 pt-4 border-t border-gray-100">OCR confidence</h3>
      <div className="flex items-center gap-2 mb-5">
        <input type="number" min={0} max={100} step={5} value={draft.conf}
          onChange={e => setDraft(d => ({ ...d, conf: parseInt(e.target.value) || 0 }))}
          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <span className="text-xs text-gray-400 leading-snug">
          % — below this the team is warned before accepting the letter, and the scan is logged for you to review later.
        </span>
      </div>

      <PanelSaveBar
        dirty={dirty}
        onSave={async () => {
          const min = Math.max(1, Math.min(40, draft.min || 4))
          const max = Math.max(min, Math.min(40, draft.max || 20))
          const conf = Math.max(0, Math.min(100, draft.conf)) / 100
          await save({
            sign_splice_min_letters: min,
            sign_splice_max_letters: max,
            sign_splice_min_confidence: conf,
          })
          setDraft({ min, max, conf: Math.round(conf * 100) })
        }}
      />

      <h3 className="text-sm font-bold text-gray-700 mb-2 pt-4 border-t border-gray-100 mt-6">Locked titles</h3>
      {!loaded && busy ? (
        <p className="text-xs text-gray-400 italic">Loading teams…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No team has locked a title yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map(r => (
            <div key={r.teamId} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.teamName}</p>
                <p className="text-xs text-gray-400 truncate">
                  {r.title} · {r.collected}/{r.total} letters collected
                </p>
              </div>
              <button onClick={() => void unlock(r)} disabled={busy}
                className="text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-40 flex-shrink-0">
                Unlock
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2 leading-snug">
        Unlocking deletes that team's title and every letter they collected, so they can start again.
      </p>
    </div>
  )
}
