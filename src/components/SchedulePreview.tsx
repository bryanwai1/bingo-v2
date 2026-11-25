import { useEffect, useState } from 'react'
import { hasSchedule, ruleWallTime, scheduleStatus, type ScheduleClock } from '../lib/cardSchedule'
import type { BingoSection, BingoTask } from '../types/database'

const when = (ms: number | null, fallback: string) =>
  ms == null ? fallback : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Admin: when each card on this board opens and closes, with a live status.
 * Relative rules show a clock time once the game has started; before that they
 * show the rule itself. Read only: edit a card's Schedule tool to change it.
 */
export function SchedulePreview({ tasks, board, onOverride }: {
  tasks: (BingoTask & { sort_order: number })[]
  board: BingoSection | null
  /** Set (or clear, with null) a card's facilitator override. */
  onOverride: (task: BingoTask, override: 'open' | 'locked' | null) => Promise<void> | void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const press = async (t: BingoTask, o: 'open' | 'locked' | null) => {
    setBusyId(t.id)
    try { await onOverride(t, o) } finally { setBusyId(null) }
  }
  const scheduled = tasks.filter(t => hasSchedule(t.schedule)).sort((a, b) => a.sort_order - b.sort_order)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (scheduled.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [scheduled.length])

  const base = {
    gameStarted: !!board?.game_started,
    gameStartAt: board?.game_start_at ? Date.parse(board.game_start_at) : null,
    pauses: board?.card_pauses ?? null,
    timerEndAt: board?.timer_end_at ? Date.parse(board.timer_end_at) : null,
  }
  const clock: ScheduleClock = { now, ...base }

  const rule = (r: BingoTask['schedule'] extends infer S ? (S extends { open?: infer R } ? R : never) : never) => {
    if (!r) return '—'
    const wall = ruleWallTime(r, base)
    if (r.type === 'at') return when(wall, '—')
    return wall != null ? when(wall, '') : `+${r.minutes} min`
  }

  return (
    <details className="mb-6 rounded-xl border a-border a-surface p-4" open={scheduled.length > 0 && scheduled.length <= 8}>
      <summary className="cursor-pointer text-lg font-bold a-text">
        Card schedule
        <span className="ml-2 text-sm font-normal a-text-3">
          {scheduled.length === 0 ? 'no scheduled cards on this board' : `${scheduled.length} scheduled card${scheduled.length > 1 ? 's' : ''}`}
        </span>
      </summary>
      {scheduled.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="a-text-3 text-xs uppercase tracking-wider">
                <th className="py-1.5 pr-3">Card</th><th className="pr-3">Opens</th><th className="pr-3">Closes</th><th className="pr-3">Now</th><th />
              </tr>
            </thead>
            <tbody>
              {scheduled.map(t => {
                const st = scheduleStatus(t.schedule, clock)
                const s = t.schedule!
                return (
                  <tr key={t.placement_id ?? t.id} className="border-t a-border a-text">
                    <td className="py-1.5 pr-3 font-bold [overflow-wrap:anywhere]">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: t.hex_code }} />{t.title}
                    </td>
                    <td className="pr-3 tabular-nums">{rule(s.open)}{s.lastMinutes ? ` · last ${s.lastMinutes} min` : ''}</td>
                    <td className="pr-3 tabular-nums">{rule(s.close)}</td>
                    <td className="pr-3 font-bold">
                      {st?.state === 'open' ? <span className="text-emerald-400">Open</span>
                        : st?.state === 'before' ? <span className="text-amber-300">Locked {st.opensInMs != null ? `· ${st.short}` : ''}</span>
                        : <span className="text-red-400">Closed</span>}
                      {s.override ? <span className="ml-1 text-xs a-text-3">(override)</span> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      {(['open', 'locked'] as const).map(o => (
                        <button key={o} type="button" disabled={busyId === t.id}
                          onClick={() => void press(t, s.override === o ? null : o)}
                          aria-pressed={s.override === o}
                          title={s.override === o ? 'Click to follow the schedule again' : undefined}
                          className={`mr-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border disabled:opacity-40 ${
                            s.override === o
                              ? (o === 'open' ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-red-500 border-red-500 text-white')
                              : 'a-border a-text-2 hover:a-surface'}`}>
                          {o === 'open' ? 'Open now' : 'Lock now'}
                        </button>
                      ))}
                      <a href={`/bingo-dash/admin/task/${t.id}`} className="text-xs text-teal-500 font-bold hover:underline">Edit</a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!base.gameStartAt && <p className="mt-2 text-xs a-text-3">Minutes-after-start times appear as clock times once the game has started.</p>}
        </div>
      )}
    </details>
  )
}
