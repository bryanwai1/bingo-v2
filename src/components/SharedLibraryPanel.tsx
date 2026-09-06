import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Shared content packs, available to every tenant.
//
// Importing copies the pack's cards into THIS board as the caller's own
// editable rows (import_library_pack is SECURITY DEFINER and checks
// bingo_can_write). Nothing is shared after the copy — a renter editing an
// imported card never touches the source or another renter's version.
// Idempotent: pressing Import twice does not double the library.

type Pack = { id: string; name: string; description: string; emoji: string }
type Card = { id: string; title: string; category: string; points: number; is_contest: boolean }

export function SharedLibraryPanel({ sectionId, onImported }: {
  sectionId: string | null
  onImported?: () => void
}) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('bingo_library_packs').select('*').order('sort_order')
      .then(({ data }) => setPacks((data as Pack[]) ?? []))
  }, [])

  const openPack = useCallback(async (id: string) => {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    const { data } = await supabase.from('bingo_library_cards')
      .select('id, title, category, points, is_contest')
      .eq('pack_id', id).order('sort_order')
    setCards((data as Card[]) ?? [])
  }, [open])

  const importPack = async (packId: string) => {
    if (!sectionId) { setMsg('Pick a board first.'); return }
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('import_library_pack', {
      p_pack: packId, p_section: sectionId,
    })
    setBusy(false)
    if (error) {
      setMsg(error.message.includes('NOT_YOUR_BOARD') ? 'That board is not yours.' : error.message)
      return
    }
    const r = data as { created: number; skipped: number }
    setMsg(r.created === 0
      ? `All ${r.skipped} cards were already in this library.`
      : `Added ${r.created} card${r.created === 1 ? '' : 's'}.${r.skipped ? ` ${r.skipped} already existed.` : ''}`)
    onImported?.()
  }

  if (packs.length === 0) return null

  return (
    <div className="rounded-2xl border a-border a-surface-2 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black a-text uppercase tracking-wide">Shared packs</h3>
        <span className="text-[10px] a-text-3">Copied into your board — yours to edit</span>
      </div>

      <div className="flex flex-col gap-2">
        {packs.map(p => (
          <div key={p.id} className="rounded-xl border a-border bg-black/20 overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-xl">{p.emoji}</span>
              <button onClick={() => void openPack(p.id)} className="flex-1 text-left">
                <p className="a-text font-bold text-sm">{p.name}</p>
                <p className="a-text-3 text-[11px] leading-snug">{p.description}</p>
              </button>
              <button
                onClick={() => void importPack(p.id)}
                disabled={busy || !sectionId}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-400/50 text-violet-300 hover:bg-violet-500/15 disabled:opacity-40 transition-colors">
                {busy ? '…' : 'Import'}
              </button>
            </div>
            {open === p.id && (
              <div className="border-t a-border divide-y divide-transparent">
                {cards.map(c => (
                  <div key={c.id} className="px-3 py-2 flex items-center gap-2">
                    <span className="flex-1 a-text-2 text-xs">{c.title}</span>
                    {c.is_contest && (
                      <span className="text-[9px] font-black uppercase text-red-300 border border-red-400/40 rounded px-1.5 py-0.5">
                        Contest
                      </span>
                    )}
                    <span className="a-text-3 text-[11px]">{c.points} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {msg && <p className="text-center text-xs a-text-2 mt-3">{msg}</p>}
    </div>
  )
}
