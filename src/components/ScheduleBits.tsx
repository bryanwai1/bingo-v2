import { useEffect } from 'react'
import type { ScheduleStatus } from '../lib/cardSchedule'
import type { ScheduleAlert } from '../hooks/useCardSchedules'

/** Over a tile that teams cannot open yet (or any more): a padlock and the countdown. */
export function ScheduleLockOverlay({ sched, small = false }: { sched?: ScheduleStatus | null; small?: boolean }) {
  if (!sched?.locked) return null
  return (
    <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-0.5 z-10 pointer-events-none" data-schedule-lock>
      <span className={small ? 'text-[11px] leading-none' : 'text-sm leading-none'}>🔒</span>
      <span className={`${small ? 'text-[8px]' : 'text-[10px]'} font-black text-white leading-none tabular-nums px-1 rounded bg-black/50`}>{sched.short}</span>
    </div>
  )
}

/** Top-of-screen banner for "card opened" and "closes soon". Each fades after 8 s. */
export function ScheduleBanner({ alerts, onDismiss }: { alerts: ScheduleAlert[]; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timers = alerts.map(a => setTimeout(() => onDismiss(a.id), 8000))
    return () => timers.forEach(clearTimeout)
  }, [alerts, onDismiss])
  if (alerts.length === 0) return null
  return (
    <div className="fixed top-2 inset-x-2 z-[200] flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="assertive">
      {alerts.map(a => (
        <button key={a.id} type="button" onClick={() => onDismiss(a.id)}
          className={`pointer-events-auto max-w-md w-full rounded-2xl px-4 py-3 shadow-2xl border-2 text-left font-black text-sm ${a.kind === 'opened' ? 'bg-emerald-500 border-emerald-200 text-black' : 'bg-amber-400 border-amber-100 text-black'}`}>
          <span aria-hidden className="mr-2">{a.kind === 'opened' ? '🔓' : '⏳'}</span>{a.text}
        </button>
      ))}
    </div>
  )
}
