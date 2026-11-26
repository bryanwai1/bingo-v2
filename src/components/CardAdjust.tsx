import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtElapsed } from './CardBonusTimer'
import { boxPoints, resolveBonusWindow, scanElapsedMs } from '../lib/timeBonus'
import { formatScore, type BoardTask } from '../lib/teamScore'
import { KIND_LABEL, logAdjustment, type Adjustment, type AdjustmentKind } from '../lib/adjustments'
import type { BingoPhotoSubmission, BingoScan, BingoSection, BingoTeam } from '../types/database'

const clock = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const STEP = 5 // slider moves in 5-second steps

// Admin popup for one group's one card: its timeline, a slider to correct the
// time (points follow), restore the measured time, undo a decision, reset the
// card, and what has been changed on it before. Used from the Progress page
// (admin signed in) and from Admin > Teams > Cards & times.
export function CardAdjust({ team, section, card, scans, onClose }: {
  team: BingoTeam
  section: BingoSection
  card: BoardTask
  scans: BingoScan[]
  onClose: () => void
}) {
  const [subs, setSubs] = useState<BingoPhotoSubmission[]>([])
  const [history, setHistory] = useState<Adjustment[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const mine = scans.filter(s => s.team_id === team.id && (s.board_card_id === card.placement_id || (!s.board_card_id && s.task_id === card.id)))
  const done = mine.find(s => s.completed)
  const open = mine.find(s => !s.completed)
  const measured = done ? scanElapsedMs({ ...done, time_override_seconds: null }, section) : null
  const edited = done?.time_override_seconds != null
  const max = resolveBonusWindow(card, section).timer * 60
  const [secs, setSecs] = useState(() => Math.min(max, Math.round((done ? scanElapsedMs(done, section) ?? 0 : 0) / 1000)))

  const points = (s: number) => done ? boxPoints(card, mine.map(x => x.id === done.id ? { ...x, time_override_seconds: s } : x), section) : 0
  const approved = [...subs].reverse().find(s => s.status === 'approved')
  const rejected = !approved ? [...subs].reverse().find(s => s.status === 'rejected') : undefined

  const reload = useCallback(async () => {
    const [s, h] = await Promise.all([
      supabase.from('bingo_photo_submissions').select('*').eq('team_id', team.id).eq('task_id', card.id).order('created_at'),
      supabase.from('bingo_adjustments').select('*').eq('team_id', team.id).eq('task_id', card.id).order('created_at', { ascending: false }).limit(50),
    ])
    setSubs((s.data ?? []) as BingoPhotoSubmission[]); setHistory((h.data ?? []) as Adjustment[])
  }, [team.id, card.id])
  useEffect(() => { const t = setTimeout(() => void reload(), 0); return () => clearTimeout(t) }, [reload])

  const log = (kind: AdjustmentKind, detail: string) =>
    logAdjustment({ section_id: section.id, team_id: team.id, task_id: card.id, kind, detail, reason: reason.trim() || null })
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); await reload() } catch { alert('That did not save. Check your connection and try again.') } finally { setBusy(false) }
  }
  const ok = (r: { error: unknown }) => { if (r.error) throw r.error }

  const save = () => run(async () => {
    if (!done) return
    const was = scanElapsedMs(done, section)
    ok(await supabase.from('bingo_scans').update({ time_override_seconds: secs }).eq('id', done.id))
    await log('time_set', `${was === null ? '–' : fmtElapsed(was)} → ${fmtElapsed(secs * 1000)} (${formatScore(points(Math.round((was ?? 0) / 1000)))} → ${formatScore(points(secs))} pts)`)
  })
  const restore = () => run(async () => {
    if (!done) return
    ok(await supabase.from('bingo_scans').update({ time_override_seconds: null }).eq('id', done.id))
    setSecs(Math.min(max, Math.round((measured ?? 0) / 1000)))
    await log('time_reset', `Back to the measured time ${measured === null ? '–' : fmtElapsed(measured)}`)
  })
  const undo = (sub: BingoPhotoSubmission) => run(async () => {
    ok(await supabase.from('bingo_photo_submissions').update({ status: 'pending', review_note: null }).eq('id', sub.id))
    if (sub.status === 'approved' && sub.scan_id) {
      ok(await supabase.from('bingo_scans').update({ completed: false, completed_at: null, time_override_seconds: null }).eq('id', sub.scan_id))
    }
    await log(sub.status === 'approved' ? 'undo_approval' : 'undo_rejection', 'Back to pending review')
  })
  const reset = () => run(async () => {
    if (!confirm(`Reset "${card.title}" for ${team.name}?\n\nTheir time, points and ${subs.length} submission${subs.length === 1 ? '' : 's'} for this card are removed and they can start it again. You cannot undo this.`)) return
    if (subs.length) ok(await supabase.from('bingo_photo_submissions').delete().in('id', subs.map(s => s.id)))
    if (mine.length) ok(await supabase.from('bingo_scans').delete().in('id', mine.map(s => s.id)))
    await log('card_reset', `${team.name} can redo this card`)
  })

  const btn = 'min-h-[44px] px-3 rounded-lg text-xs font-bold border border-white/15 text-gray-200 disabled:opacity-40'
  const T = ({ k, v }: { k: string; v: string }) => <div><dt className="text-gray-500">{k}</dt><dd className="font-bold text-white tabular-nums">{v}</dd></div>
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-3" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black truncate">{card.title}</h3>
            <p className="text-xs text-gray-400 truncate">{team.name} · {done ? 'Done' : open ? 'In progress' : 'Not opened'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl min-w-[44px] min-h-[44px]" aria-label="Close">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-[11px]">
            <T k="Opened" v={clock((done ?? open)?.scanned_at)} />
            <T k="Sent" v={clock(subs[subs.length - 1]?.created_at)} />
            <T k="Completed" v={clock(done?.completed_at)} />
          </dl>

          {done && (
            <div className="rounded-xl bg-black/30 p-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] text-gray-400 font-bold">Time{edited && <span className="ml-1 text-amber-400">edited</span>}</p>
                  <p className="text-3xl font-black tabular-nums">{fmtElapsed(secs * 1000)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-400 font-bold">Points</p>
                  <p className="text-xl font-black tabular-nums">
                    <span className="text-gray-500">{formatScore(points(Math.round((scanElapsedMs(done, section) ?? 0) / 1000)))}</span> → {formatScore(points(secs))}
                  </p>
                </div>
              </div>
              <input type="range" min={0} max={max} step={STEP} value={secs} onChange={e => setSecs(Number(e.target.value))}
                className="w-full h-11 accent-teal-500" aria-label="Time" />
              <div className="flex justify-between text-[10px] text-gray-500 -mt-1"><span>0:00</span><span>{fmtElapsed(max * 1000)} (no bonus)</span></div>
              <p className="text-[11px] text-gray-500 mt-1">Measured time: {measured === null ? '–' : fmtElapsed(measured)}</p>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional, admins only)"
                className="mt-2 w-full min-h-[44px] rounded-lg bg-gray-800 border border-white/10 px-3 text-sm" />
              <div className="mt-2 flex gap-2">
                <button disabled={busy || secs === Math.round((scanElapsedMs(done, section) ?? 0) / 1000)} onClick={() => void save()}
                  className="flex-1 min-h-[44px] rounded-lg text-sm font-black bg-teal-600 disabled:opacity-40">Save time</button>
                <button disabled={busy || !edited} onClick={() => void restore()} className={btn}>Reset timer</button>
              </div>
            </div>
          )}
          {!done && <p className="text-sm text-gray-400">Nothing to edit until this card is finished.</p>}

          {subs.length > 0 && <p className="text-[11px] text-gray-500">{subs.map(s => `${clock(s.created_at)} ${s.status}`).join(' · ')}</p>}
          <div className="flex flex-wrap gap-2">
            {approved && <button disabled={busy} onClick={() => void undo(approved)} className={btn}>Undo approval</button>}
            {rejected && <button disabled={busy} onClick={() => void undo(rejected)} className={btn}>Undo rejection</button>}
            {mine.length > 0 && <button disabled={busy} onClick={() => void reset()} className={`${btn} text-red-400 border-red-500/40`}>Reset card</button>}
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 mb-1">History for this card</p>
            {history.length === 0 ? <p className="text-xs text-gray-500">No changes yet.</p> : history.map(h => (
              <div key={h.id} className="border-t border-white/10 py-2 text-xs">
                <div className="flex justify-between gap-2"><span className="font-bold">{KIND_LABEL[h.kind]}</span><span className="text-gray-500 shrink-0">{when(h.created_at)}</span></div>
                <p className="text-gray-300">{h.detail}</p>
                {h.reason && <p className="text-gray-500">Reason: {h.reason}</p>}
                {h.by_email && <p className="text-gray-600">by {h.by_email}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
