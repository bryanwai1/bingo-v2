import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoTask } from '../types/database'

import { clampThreshold, cleanPrizeSecrets, isGridSlot, mapsUrlError, prizeFlagLocked } from '../lib/prizeCard/logic'

interface Spot { id: string; slot: number; section_name: string }

type Secrets = { message: string; marshal_name: string; location_text: string; maps_url: string; maps_label: string }
const EMPTY: Secrets = { message: '', marshal_name: '', location_text: '', maps_url: '', maps_label: '' }
interface ClaimRow { id: string; team_name: string; claimed_at: string; section_name: string }

const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
const label = 'block text-sm font-medium text-gray-600 mb-1'

/**
 * Admin box on the card editor for a prize card (PRD-008). Threshold and the
 * prize flag are card columns and go through the editor's own draft Save
 * (`stage`). The reveal text goes to bingo_prize_secrets (players cannot read
 * it), with its own Save. The hero image is the existing Hero photos control
 * above this box, unchanged. Winner, claim time and Reset claim are here too.
 */
export function PrizeCardAdmin({ task, stage }: {
  task: BingoTask
  stage: (patch: Partial<BingoTask>) => void
}) {
  const isPrize = !!task.is_prize
  const [secrets, setSecrets] = useState<Secrets>(EMPTY)
  const [saved, setSaved] = useState<Secrets>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [urlError, setUrlError] = useState('')
  const [claims, setClaims] = useState<ClaimRow[]>([])
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // Every board this card sits on (grid boxes and prize slots): the checkbox stays locked while any exist.
  const [spots, setSpots] = useState<Spot[]>([])
  const [spotsLoaded, setSpotsLoaded] = useState(false)
  const [confirmSpot, setConfirmSpot] = useState<string | null>(null)

  const loadClaims = useCallback(async () => {
    const { data: bcs } = await supabase.from('bingo_board_cards').select('id, section_id, slot').eq('task_id', task.id)
    const ids = (bcs ?? []).map(b => b.id as string)
    const { data: secs } = ids.length
      ? await supabase.from('bingo_sections').select('id, name').in('id', [...new Set((bcs ?? []).map(b => b.section_id as string))])
      : { data: [] as { id: string; name: string }[] }
    const name = new Map((secs ?? []).map(s => [s.id as string, s.name as string]))
    setSpots((bcs ?? []).map(b => ({ id: b.id as string, slot: b.slot as number, section_name: name.get(b.section_id as string) ?? 'Board' })))
    setSpotsLoaded(true)
    if (ids.length === 0) { setClaims([]); return }
    const { data: cl } = await supabase.from('bingo_prize_claims').select('id, team_name, claimed_at, section_id').in('board_card_id', ids)
    setClaims((cl ?? []).map(c => ({ id: c.id, team_name: c.team_name, claimed_at: c.claimed_at, section_name: name.get(c.section_id as string) ?? 'Board' })))
  }, [task.id])

  useEffect(() => { void loadClaims() }, [loadClaims])

  useEffect(() => {
    if (!isPrize) return
    let live = true
    supabase.from('bingo_prize_secrets').select('*').eq('task_id', task.id).maybeSingle().then(({ data }) => {
      if (!live || !data) return
      const s: Secrets = {
        message: data.message ?? '', marshal_name: data.marshal_name ?? '', location_text: data.location_text ?? '',
        maps_url: data.maps_url ?? '', maps_label: data.maps_label ?? '',
      }
      setSecrets(s); setSaved(s)
    })
    return () => { live = false }
  }, [isPrize, task.id])

  const dirty = JSON.stringify(secrets) !== JSON.stringify(saved)
  const set = (k: keyof Secrets) => (e: { target: { value: string } }) => { setSecrets(s => ({ ...s, [k]: e.target.value })); setMsg(''); if (k === 'maps_url') setUrlError('') }

  const save = async () => {
    const bad = mapsUrlError(secrets.maps_url)
    if (bad) { setUrlError(bad); return }
    setBusy(true); setMsg('')
    const clean = cleanPrizeSecrets(secrets)
    const { error } = await supabase.from('bingo_prize_secrets').upsert({ task_id: task.id, ...clean, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { setMsg('Could not save: ' + error.message); return }
    setSaved(secrets); setMsg('Saved.')
  }

  const reset = async (id: string) => {
    setBusy(true)
    const { error } = await supabase.from('bingo_prize_claims').delete().eq('id', id)
    setBusy(false); setConfirmId(null)
    if (error) { setMsg('Could not reset the claim: ' + error.message); return }
    setMsg('Claim reset. Every team is back to locked or CLAIM by its own count.')
    void loadClaims()
  }

  // Take this prize card off a board. Its claim goes with it (cascade), and the checkbox unlocks once no board has it.
  const removeSpot = async (id: string) => {
    setBusy(true)
    const { error } = await supabase.from('bingo_board_cards').delete().eq('id', id)
    setBusy(false); setConfirmSpot(null)
    if (error) { setMsg('Could not remove the card from the board: ' + error.message); return }
    setMsg('Removed from the board.')
    void loadClaims()
  }

  const locked = !spotsLoaded || prizeFlagLocked(spots.length)
  const prizeSpots = spots.filter(s => !isGridSlot(s.slot))

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {locked && <p className="text-xs text-gray-400">This card is on a board. Remove it from every board to change its type.</p>}

      {prizeSpots.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-700">On these boards</p>
          {prizeSpots.map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 [overflow-wrap:anywhere]">{s.section_name}</span>
              {confirmSpot === s.id ? (
                <>
                  <span className="text-xs text-gray-600">Remove it and its claim?</span>
                  <button type="button" disabled={busy} onClick={() => void removeSpot(s.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Yes, remove</button>
                  <button type="button" onClick={() => setConfirmSpot(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmSpot(s.id)} className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-bold hover:bg-red-50">Remove from board</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isPrize && (
        <div className="mt-4 grid gap-4 md:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3 min-w-0">
            <div>
              <label className={label} htmlFor="prize-threshold">Cards a group must complete</label>
              <input id="prize-threshold" type="number" min={1} step={1} className={`${input} w-32 text-center font-bold`}
                value={task.prize_threshold ?? 20}
                onChange={e => stage({ prize_threshold: clampThreshold(e.target.value) })} />
              <p className="text-xs text-gray-400 mt-1">Only completed grid cards count. The default is 20.</p>
            </div>
            <div>
              <label className={label} htmlFor="prize-hint">Reminder shown on the board</label>
              <input id="prize-hint" className={input} maxLength={120} placeholder={`Complete ${task.prize_threshold ?? 20} cards to unlock this prize`}
                value={task.completion_warning ?? ''}
                onChange={e => stage({ completion_warning: e.target.value || null })} />
              <p className="text-xs text-gray-400 mt-1">Every team sees this under the progress bar while the prize is locked. Leave empty for the default.</p>
            </div>
            <div>
              <label className={label} htmlFor="prize-message">Congratulation text</label>
              <textarea id="prize-message" rows={3} className={input} value={secrets.message} onChange={set('message')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="prize-marshal">Marshal name</label>
                <input id="prize-marshal" className={input} value={secrets.marshal_name} onChange={set('marshal_name')} />
              </div>
              <div>
                <label className={label} htmlFor="prize-location">Location</label>
                <input id="prize-location" className={input} value={secrets.location_text} onChange={set('location_text')} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="prize-maps">Google Maps link</label>
                <input id="prize-maps" className={`${input} ${urlError ? 'border-red-400' : ''}`} value={secrets.maps_url} onChange={set('maps_url')} />
                {urlError && <p className="text-xs text-red-600 mt-1">{urlError}</p>}
              </div>
              <div>
                <label className={label} htmlFor="prize-maps-label">Button label</label>
                <input id="prize-maps-label" className={input} placeholder="Open in Google Maps" value={secrets.maps_label} onChange={set('maps_label')} />
              </div>
            </div>
            <p className="text-xs text-gray-400">The hero image is the Hero photos above (several photos show as a carousel on the winner's page). Teams see this text only after they win.</p>
            <button type="button" onClick={() => void save()} disabled={busy || !dirty}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold disabled:opacity-40">
              {busy ? 'Saving…' : 'Save prize text'}
            </button>
            {msg && <p className="text-xs text-gray-500">{msg}</p>}
          </div>

          <div className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3 h-fit">
            <p className="text-sm font-semibold text-gray-700 mb-2">Claim</p>
            {claims.length === 0 && <p className="text-sm text-gray-500">No claim yet.</p>}
            {claims.map(c => (
              <div key={c.id} className="mb-3 last:mb-0">
                <p className="text-sm text-gray-700 [overflow-wrap:anywhere]"><span className="font-bold">{c.team_name}</span> on {c.section_name}</p>
                <p className="text-xs text-gray-400">{new Date(c.claimed_at).toLocaleString()}</p>
                {confirmId === c.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-600">Remove this claim?</span>
                    <button type="button" disabled={busy} onClick={() => void reset(c.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Yes, reset</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmId(c.id)} className="mt-2 px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-bold hover:bg-red-50">Reset claim</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => void loadClaims()} className="mt-3 text-xs text-violet-600 font-bold">Refresh</button>
          </div>
        </div>
      )}
    </div>
  )
}
