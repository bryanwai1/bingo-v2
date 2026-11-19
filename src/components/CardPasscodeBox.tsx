import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Code = { id: string; label: string; passcode: string; sort_order: number }

/**
 * Admin box for the passcodes a card reveals after a correct answer (the box
 * codes on Crack the Passcode). Each team that answers correctly is handed a
 * code nobody else holds yet, so the codes are a pool: add, rename, change and
 * delete them here, and see which teams hold each one.
 *
 * Saved straight to bingo_task_passcodes, a table players cannot read; they
 * only get their code from get_card_passcode once their answer is right.
 * No codes = nothing is revealed. See supabase/core-tables/20261119_card_passcode_pool.sql.
 */
export function CardPasscodeBox({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<Code[]>([])
  const [holders, setHolders] = useState<Record<string, string[]>>({}) // code id -> team names
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [c, h] = await Promise.all([
      supabase.from('bingo_task_passcodes').select('id, label, passcode, sort_order').eq('task_id', taskId).order('sort_order').order('created_at'),
      supabase.from('bingo_passcode_claims').select('passcode_id, bingo_teams(name)').eq('task_id', taskId),
    ])
    if (c.error) { setMsg('Could not load the passcodes: ' + c.error.message); setLoading(false); return }
    const list = (c.data ?? []) as Code[]
    setCodes(list)
    setEnabled(e => e || list.length > 0)
    const map: Record<string, string[]> = {}
    for (const row of (h.data ?? []) as unknown as { passcode_id: string; bingo_teams: { name: string } | { name: string }[] | null }[]) {
      const t = Array.isArray(row.bingo_teams) ? row.bingo_teams[0] : row.bingo_teams
      ;(map[row.passcode_id] ??= []).push(t?.name ?? 'A team')
    }
    setHolders(map)
    setLoading(false)
  }, [taskId])

  useEffect(() => { void load() }, [load])

  const run = async (job: () => PromiseLike<{ error: { message: string } | null }>, ok = '') => {
    setBusy(true); setMsg('')
    const { error } = await job()
    setBusy(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setMsg(ok)
    await load()
  }

  const add = () => run(() => supabase.from('bingo_task_passcodes').insert({
    task_id: taskId, label: `Box ${codes.length + 1}`, passcode: '', sort_order: codes.length,
  }))
  const edit = (id: string, patch: Partial<Code>) => run(() => supabase.from('bingo_task_passcodes').update(patch).eq('id', id), 'Saved.')
  const remove = (c: Code) => {
    const n = holders[c.id]?.length ?? 0
    if (n > 0 && !window.confirm(`${n} team${n === 1 ? '' : 's'} already received "${c.passcode}". Delete it anyway? They will be given another code if they ask again.`)) return
    void run(() => supabase.from('bingo_task_passcodes').delete().eq('id', c.id), 'Deleted.')
  }
  const toggle = (on: boolean) => {
    if (on) { setEnabled(true); if (codes.length === 0) void add(); return }
    if (codes.length > 0 && !window.confirm('Turn off and delete all passcodes on this card?')) return
    void run(() => supabase.from('bingo_task_passcodes').delete().eq('task_id', taskId), 'Turned off.').then(() => setEnabled(false))
  }

  if (loading) return null
  const input = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={e => toggle(e.target.checked)} className="mt-1" />
        <span>
          <span className="block text-sm font-semibold text-gray-700">Show a passcode after a correct answer</span>
          <span className="block text-xs text-gray-400">
            For example the box code on Crack the Passcode. Each team that answers correctly gets a code no other team
            has; once all are taken they are handed out again.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2">
          {codes.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <input
                defaultValue={c.label} placeholder="Label" aria-label="Label" disabled={busy}
                onBlur={e => { const v = e.target.value.trim(); if (v !== c.label) void edit(c.id, { label: v }) }}
                className={`${input} w-28`}
              />
              <input
                defaultValue={c.passcode} placeholder="1234" aria-label="Passcode" disabled={busy}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.passcode) void edit(c.id, { passcode: v }) }}
                className={`${input} w-32 font-mono tracking-widest`}
              />
              <span className="flex-1 min-w-[8rem] text-xs text-gray-500">
                {holders[c.id]?.length ? `Held by ${holders[c.id].join(', ')}` : 'Not given out yet'}
              </span>
              <button type="button" onClick={() => remove(c)} disabled={busy}
                className="px-3 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">
                Delete
              </button>
            </div>
          ))}
          <button type="button" onClick={() => void add()} disabled={busy}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold disabled:opacity-40">
            + Add passcode
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-500">{msg}</p>}
    </div>
  )
}
