import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoTask } from '../types/database'

import { clampThreshold, cleanPrizeSecrets, isGridSlot, mapsUrlError, prizeFlagLocked } from '../lib/prizeCard/logic'

interface Spot { id: string; slot: number; section_name: string }
interface Candidate { id: string; title: string; hex: string; section_name: string }

// <input type="datetime-local"> speaks local time without a zone; the column stores an instant.
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)
const wholeOrNull = (v: string, min: number) => (v.trim() === '' ? null : Math.max(min, Math.floor(Number(v) || min)))

type Secrets = { message: string; marshal_name: string; location_text: string; maps_url: string; maps_label: string }
const EMPTY: Secrets = { message: '', marshal_name: '', location_text: '', maps_url: '', maps_label: '' }
interface ClaimRow { id: string; team_name: string; claimed_at: string; section_name: string }

const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
const label = 'block text-xs font-semibold text-gray-500 mb-1'
const panel = 'rounded-xl border border-gray-200 bg-white p-4'

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
  // The grid cards on the boards this prize sits on: the ones it can require.
  const [candidates, setCandidates] = useState<Candidate[]>([])

  const loadClaims = useCallback(async () => {
    const { data: bcs } = await supabase.from('bingo_board_cards').select('id, section_id, slot').eq('task_id', task.id)
    const ids = (bcs ?? []).map(b => b.id as string)
    const { data: secs } = ids.length
      ? await supabase.from('bingo_sections').select('id, name').in('id', [...new Set((bcs ?? []).map(b => b.section_id as string))])
      : { data: [] as { id: string; name: string }[] }
    const name = new Map((secs ?? []).map(s => [s.id as string, s.name as string]))
    setSpots((bcs ?? []).map(b => ({ id: b.id as string, slot: b.slot as number, section_name: name.get(b.section_id as string) ?? 'Board' })))
    setSpotsLoaded(true)
    const sectionIds = [...new Set((bcs ?? []).map(b => b.section_id as string))]
    if (sectionIds.length) {
      const { data: grid } = await supabase.from('bingo_board_cards').select('task_id, section_id, slot').in('section_id', sectionIds).lt('slot', 200)
      const taskIds = [...new Set((grid ?? []).map(g => g.task_id as string))]
      const { data: ts } = taskIds.length
        ? await supabase.from('bingo_tasks').select('id, title, hex_code').in('id', taskIds)
        : { data: [] as { id: string; title: string; hex_code: string }[] }
      const tById = new Map((ts ?? []).map(t => [t.id as string, t]))
      const seen = new Set<string>()
      const list: Candidate[] = []
      for (const g of [...(grid ?? [])].sort((a, b) => (a.slot as number) - (b.slot as number))) {
        const t = tById.get(g.task_id as string)
        if (!t || seen.has(t.id as string)) continue
        seen.add(t.id as string)
        list.push({ id: t.id as string, title: t.title as string, hex: (t.hex_code as string) || '#64748b', section_name: name.get(g.section_id as string) ?? 'Board' })
      }
      setCandidates(list)
    } else setCandidates([])
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

  const reqIds = task.prize_required_task_ids ?? []
  const threshold = task.prize_threshold ?? 20
  const stock = task.prize_stock ?? null
  // One readable sentence instead of a paragraph of hints.
  const rule = [
    `${threshold} cards${reqIds.length ? `, ${reqIds.length} of them chosen` : ''}`,
    task.prize_min_points != null ? `${task.prize_min_points}+ points` : null,
    task.prize_min_lines != null ? `${task.prize_min_lines}+ bingo lines` : null,
    task.prize_open_at || task.prize_close_at ? 'inside a time window' : null,
  ].filter(Boolean).join(', ')
  const moreSet = task.prize_min_points != null || task.prize_min_lines != null
    || !!task.prize_open_at || !!task.prize_close_at || !!task.completion_warning

  return (
    <div className="mb-6 space-y-4">
      {isPrize && (
        <div className={`${panel} flex flex-wrap items-center justify-between gap-x-6 gap-y-3`}>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500">Unlock rule</p>
            <p className="text-base font-bold text-gray-900 [overflow-wrap:anywhere]">
              {rule}{stock != null ? `. ${stock} prize${stock > 1 ? 's' : ''}, ${task.prize_per_team ?? 1} per group` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {claims.length === 0 && <span className="text-gray-500">No winner yet</span>}
            {claims.map(c => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5">
                <span className="font-bold text-gray-800">{c.team_name}</span>
                <span className="text-xs text-gray-500">{c.section_name}, {new Date(c.claimed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                {confirmId === c.id ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void reset(c.id)} className="text-xs font-bold text-red-600">Reset?</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-xs font-bold text-gray-500">Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmId(c.id)} className="text-xs font-bold text-red-600 hover:underline">Reset</button>
                )}
              </span>
            ))}
            <button type="button" onClick={() => void loadClaims()} className="text-xs font-bold text-violet-600 hover:underline">Refresh</button>
          </div>
        </div>
      )}

      {prizeSpots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="text-xs font-semibold text-gray-500">On board</span>
          {prizeSpots.map(s => (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <span className="font-semibold text-gray-800 [overflow-wrap:anywhere]">{s.section_name}</span>
              {confirmSpot === s.id ? (
                <>
                  <button type="button" disabled={busy} onClick={() => void removeSpot(s.id)} className="text-xs font-bold text-red-600">Remove and its claim?</button>
                  <button type="button" onClick={() => setConfirmSpot(null)} className="text-xs font-bold text-gray-500">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmSpot(s.id)} className="text-xs font-bold text-red-600 hover:underline">Remove</button>
              )}
            </span>
          ))}
          {locked && <span className="text-xs text-gray-400">Card type is locked while it is on a board.</span>}
        </div>
      )}

      {isPrize && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
          {/* ── Unlock ─────────────────────────────────────────────── */}
          <section className={`${panel} space-y-5`} aria-label="Unlock">
            <h3 className="text-sm font-black text-gray-900">Unlock</h3>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label} htmlFor="prize-threshold">Cards to complete</label>
                <input id="prize-threshold" type="number" min={1} step={1} className={`${input} text-center font-bold`}
                  value={threshold} onChange={e => stage({ prize_threshold: clampThreshold(e.target.value) })} />
              </div>
              <div>
                <label className={label} htmlFor="prize-stock">Prizes</label>
                <input id="prize-stock" type="number" min={1} step={1} className={`${input} text-center font-bold`} placeholder="No limit"
                  value={task.prize_stock ?? ''} onChange={e => stage({ prize_stock: wholeOrNull(e.target.value, 1) })} />
              </div>
              <div>
                <label className={label} htmlFor="prize-per-team">Per group</label>
                <input id="prize-per-team" type="number" min={1} step={1} className={`${input} text-center font-bold`}
                  value={task.prize_per_team ?? 1} onChange={e => stage({ prize_per_team: wholeOrNull(e.target.value, 1) ?? 1 })} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">Required cards</p>
                <p className="text-xs text-gray-400">{reqIds.length > 0 ? `${reqIds.length} chosen` : 'Optional'}</p>
              </div>
              {candidates.length === 0
                ? <p className="text-sm text-gray-400">Add this card to a board to pick cards.</p>
                : (
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Required cards">
                    {candidates.filter(c => reqIds.includes(c.id)).map(c => (
                      <span key={c.id} title={c.title}
                        className="inline-flex items-center gap-2 max-w-[15rem] rounded-lg border border-violet-500 bg-violet-50 pl-2.5 pr-1 py-1 text-sm font-semibold text-violet-800">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.hex }} />
                        <span className="truncate">{c.title.replace(/\s*\((Melaka Hunt|Auto)\)\s*$/i, '')}</span>
                        <button type="button" aria-label={`Remove ${c.title}`}
                          onClick={() => stage({ prize_required_task_ids: reqIds.filter(x => x !== c.id) })}
                          className="w-5 h-5 rounded-md text-violet-600 hover:bg-violet-100 leading-none">×</button>
                      </span>
                    ))}
                    {candidates.some(c => !reqIds.includes(c.id)) && (
                      <select aria-label="Add a required card" value=""
                        onChange={e => { if (e.target.value) stage({ prize_required_task_ids: [...reqIds, e.target.value] }) }}
                        className="rounded-lg border border-dashed border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-500 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500">
                        <option value="">+ Add a card</option>
                        {candidates.filter(c => !reqIds.includes(c.id)).map(c => (
                          <option key={c.id} value={c.id}>{c.title.replace(/\s*\((Melaka Hunt|Auto)\)\s*$/i, '')}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
            </div>

            <details className="group rounded-lg border border-gray-200" open={moreSet}>
              <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700">
                More conditions
                <span className="text-xs font-normal text-gray-400">{moreSet ? 'In use' : 'Score, lines, time, message'}</span>
              </summary>
              <div className="grid gap-3 border-t border-gray-200 p-3 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="prize-min-points">Minimum score</label>
                  <input id="prize-min-points" type="number" min={0} step={1} className={input} placeholder="None"
                    value={task.prize_min_points ?? ''} onChange={e => stage({ prize_min_points: wholeOrNull(e.target.value, 0) })} />
                </div>
                <div>
                  <label className={label} htmlFor="prize-min-lines">Minimum bingo lines</label>
                  <input id="prize-min-lines" type="number" min={1} max={12} step={1} className={input} placeholder="None"
                    value={task.prize_min_lines ?? ''} onChange={e => stage({ prize_min_lines: wholeOrNull(e.target.value, 1) })} />
                </div>
                <div>
                  <label className={label} htmlFor="prize-open">Claimable from</label>
                  <input id="prize-open" type="datetime-local" className={input}
                    value={toLocalInput(task.prize_open_at)} onChange={e => stage({ prize_open_at: fromLocalInput(e.target.value) })} />
                </div>
                <div>
                  <label className={label} htmlFor="prize-close">Claimable until</label>
                  <input id="prize-close" type="datetime-local" className={input}
                    value={toLocalInput(task.prize_close_at)} onChange={e => stage({ prize_close_at: fromLocalInput(e.target.value) })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="prize-hint">Message on the board while locked</label>
                  <input id="prize-hint" className={input} maxLength={120} placeholder={`Complete ${threshold} cards to unlock this prize`}
                    value={task.completion_warning ?? ''} onChange={e => stage({ completion_warning: e.target.value || null })} />
                </div>
              </div>
            </details>
          </section>

          {/* ── Winner page ────────────────────────────────────────── */}
          <section className={`${panel} space-y-3`} aria-label="Winner page">
            <div>
              <h3 className="text-sm font-black text-gray-900">Winner page</h3>
              <p className="text-xs text-gray-400">Only the winning group sees this.</p>
            </div>
            <div>
              <label className={label} htmlFor="prize-message">Congratulation text</label>
              <textarea id="prize-message" rows={2} className={input} value={secrets.message} onChange={set('message')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="prize-marshal">Marshal</label>
                <input id="prize-marshal" className={input} value={secrets.marshal_name} onChange={set('marshal_name')} />
              </div>
              <div>
                <label className={label} htmlFor="prize-location">Location</label>
                <input id="prize-location" className={input} value={secrets.location_text} onChange={set('location_text')} />
              </div>
              <div>
                <label className={label} htmlFor="prize-maps">Google Maps link</label>
                <input id="prize-maps" className={`${input} ${urlError ? 'border-red-400' : ''}`} value={secrets.maps_url} onChange={set('maps_url')} />
                {urlError && <p className="text-xs text-red-600 mt-1">{urlError}</p>}
              </div>
              <div>
                <label className={label} htmlFor="prize-maps-label">Map button text</label>
                <input id="prize-maps-label" className={input} placeholder="Open in Google Maps" value={secrets.maps_label} onChange={set('maps_label')} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={() => void save()} disabled={busy || !dirty}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold disabled:opacity-40">
                {busy ? 'Saving…' : 'Save winner page'}
              </button>
              {msg && <p className="text-xs text-gray-500">{msg}</p>}
            </div>
            <p className="text-xs text-gray-400">The photo is the Hero photos above.</p>
          </section>
        </div>
      )}
    </div>
  )
}
