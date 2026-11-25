import { useState } from 'react'
import { MAX_CONTACTS, MAX_PIN, normalizeHelp, tidyHelp, type HelpContact, type HelpInfo } from '../lib/helpInfo'

const field = 'w-full px-3 py-2 rounded-lg border a-border a-bg a-text placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500'
const lbl = 'block text-xs font-bold a-text-2 uppercase tracking-wider mb-1'

/**
 * Admin block: emergency contacts and a pinned message for the help chat.
 * `onSave(help, allBoards)` writes the board (or every board of the tenant).
 */
export function HelpInfoEditor({ value, onSave, boardCount }: {
  value: unknown
  onSave: (help: HelpInfo | null, allBoards: boolean) => Promise<string | null>
  boardCount: number
}) {
  const saved = normalizeHelp(value)
  const [draft, setDraft] = useState<HelpInfo>(saved)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const setContact = (i: number, patch: Partial<HelpContact>) =>
    setDraft(d => ({ ...d, contacts: d.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const save = async (all: boolean) => {
    setBusy(true); setMsg('')
    // A changed pin gets a new time, so players see the "new" dot again.
    const next = { ...draft, pinAt: draft.pin !== saved.pin ? new Date().toISOString() : draft.pinAt }
    const err = await onSave(tidyHelp(next), all)
    setBusy(false)
    setMsg(err ?? (all ? `Saved to ${boardCount} boards` : 'Saved'))
  }

  return (
    <div className="p-4 rounded-lg border a-border a-surface/50 space-y-4">
      <label className="flex items-center gap-2 text-sm a-text">
        <input type="checkbox" checked={draft.show} onChange={e => setDraft(d => ({ ...d, show: e.target.checked }))} />
        Show on player boards
      </label>

      <div>
        <label className={lbl} htmlFor="help-pin">Pinned message</label>
        <textarea id="help-pin" rows={2} maxLength={MAX_PIN} className={`${field} resize-none`}
          placeholder="e.g. Regroup at the fountain at 3 pm"
          value={draft.pin} onChange={e => setDraft(d => ({ ...d, pin: e.target.value }))} />
        <p className="text-[11px] a-text-3 mt-1">{draft.pin.length}/{MAX_PIN}. Changing it shows teams a new-message dot on the chat button.</p>
      </div>

      <div className="space-y-2">
        <p className={lbl}>Emergency contacts</p>
        {draft.contacts.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto_auto] items-center">
            <input className={field} placeholder="Label" aria-label="Label" maxLength={30} value={c.label} onChange={e => setContact(i, { label: e.target.value })} />
            <input className={field} placeholder="Name" aria-label="Name" maxLength={60} value={c.name} onChange={e => setContact(i, { name: e.target.value })} />
            <input className={field} placeholder="012-345 6789" aria-label="Phone" inputMode="tel" maxLength={30} value={c.phone} onChange={e => setContact(i, { phone: e.target.value })} />
            <label className="flex items-center gap-1.5 text-xs a-text-2 whitespace-nowrap">
              <input type="checkbox" checked={c.whatsapp} onChange={e => setContact(i, { whatsapp: e.target.checked })} /> WhatsApp
            </label>
            <button type="button" aria-label="Remove contact" className="text-red-500 text-lg leading-none px-1"
              onClick={() => setDraft(d => ({ ...d, contacts: d.contacts.filter((_, j) => j !== i) }))}>×</button>
          </div>
        ))}
        {draft.contacts.length < MAX_CONTACTS && (
          <button type="button" className="text-sm font-bold text-teal-500 hover:underline"
            onClick={() => setDraft(d => ({ ...d, contacts: [...d.contacts, { label: d.contacts.length ? '' : 'Marshal', name: '', phone: '', whatsapp: true }] }))}>
            + Add contact
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save(false)}
          className="px-5 py-2 rounded-lg text-sm font-bold a-text bg-teal-500 hover:bg-teal-600 disabled:opacity-50">Save</button>
        {boardCount > 1 && (
          <button type="button" disabled={busy} onClick={() => void save(true)}
            className="px-4 py-2 rounded-lg text-sm font-bold a-text-2 border a-border hover:bg-white/5 disabled:opacity-50">Save to all {boardCount} boards</button>
        )}
        {msg && <span className="text-xs a-text-3">{msg}</span>}
      </div>
    </div>
  )
}
