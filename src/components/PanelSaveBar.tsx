// Save bar shared by the card edit page's settings panels.
//
// The panels used to write each field on blur, which quietly lost anything the
// admin typed and then navigated away from without clicking elsewhere first.
// Fields now hold a local draft and this bar commits them, so what you see is
// what will be stored — and it says so.

import { useEffect, useState } from 'react'

export function PanelSaveBar({ dirty, onSave, label = 'Save settings' }: {
  dirty: boolean
  onSave: () => Promise<void>
  label?: string
}) {
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!justSaved) return
    const t = window.setTimeout(() => setJustSaved(false), 2500)
    return () => window.clearTimeout(t)
  }, [justSaved])

  // Losing edits to a stray Back or refresh is exactly what this bar exists to
  // prevent, so the browser warns while anything is uncommitted.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
      <button
        onClick={async () => {
          setSaving(true)
          try { await onSave(); setJustSaved(true) } finally { setSaving(false) }
        }}
        disabled={!dirty || saving}
        className="px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : label}
      </button>
      <span className="text-xs font-bold">
        {saving ? <span className="text-gray-400">Saving…</span>
          : dirty ? <span className="text-amber-600">Unsaved changes</span>
          : justSaved ? <span className="text-green-600">✓ Saved</span>
          : <span className="text-gray-400">All changes saved</span>}
      </span>
    </div>
  )
}
