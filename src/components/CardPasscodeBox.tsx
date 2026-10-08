import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_PASSCODE = '1234'

/**
 * Admin box for the passcode a card reveals after a correct answer (the box
 * code on Crack the Passcode). Saved straight to bingo_task_secrets, a table
 * players cannot read; they only get the code from get_card_passcode once
 * their answer is right. Off = no row = nothing is revealed.
 */
export function CardPasscodeBox({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [saved, setSaved] = useState<string | null>(null) // null = no row
  const [value, setValue] = useState(DEFAULT_PASSCODE)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let live = true
    supabase.from('bingo_task_secrets').select('passcode').eq('task_id', taskId).maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        if (error) setMsg('Could not load the passcode: ' + error.message)
        if (data) { setEnabled(true); setSaved(data.passcode); setValue(data.passcode) }
        setLoading(false)
      })
    return () => { live = false }
  }, [taskId])

  const save = async () => {
    const code = value.trim()
    if (!code) { setMsg('Enter a passcode first.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.from('bingo_task_secrets')
      .upsert({ task_id: taskId, passcode: code, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setSaved(code); setValue(code); setMsg('Saved.')
  }

  const turnOff = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.from('bingo_task_secrets').delete().eq('task_id', taskId)
    setBusy(false)
    if (error) { setMsg('Could not turn off: ' + error.message); return }
    setEnabled(false); setSaved(null); setMsg('Turned off.')
  }

  const toggle = (on: boolean) => {
    if (on) { setEnabled(true); setValue(saved ?? DEFAULT_PASSCODE); setMsg('Press Save to switch it on.') }
    else if (saved != null) void turnOff()
    else { setEnabled(false); setMsg('') }
  }

  if (loading) return null
  const dirty = enabled && value.trim() !== (saved ?? '')

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={e => toggle(e.target.checked)} className="mt-1" />
        <span>
          <span className="block text-sm font-semibold text-gray-700">Show a passcode after a correct answer</span>
          <span className="block text-xs text-gray-400">
            For example the box code on Crack the Passcode. Teams only see it once their answer is right.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 flex gap-2 items-center">
          <input
            type="text" value={value} onChange={e => { setValue(e.target.value); setMsg('') }}
            placeholder={DEFAULT_PASSCODE}
            className="w-40 px-3 py-2 border border-gray-200 rounded-lg text-base font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button" onClick={() => void save()} disabled={busy || !dirty}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save passcode'}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-500">{msg}</p>}
    </div>
  )
}
