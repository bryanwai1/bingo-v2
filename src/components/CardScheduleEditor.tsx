import type { BingoTask } from '../types/database'
import { describeSchedule, type CardSchedule, type SchedRule } from '../lib/cardSchedule'

const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500'
const label = 'block text-sm font-medium text-gray-600 mb-1'

// <input type="datetime-local"> speaks local time without a zone; the schedule stores an instant.
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '')

type Mode = 'none' | 'after_start' | 'at'
const modeOf = (r: SchedRule | null | undefined): Mode => r?.type ?? 'none'

/** Keep the stored schedule tidy: drop empty parts, and null when nothing is set. */
function tidy(s: CardSchedule): CardSchedule | null {
  const out: CardSchedule = { ...s }
  if (!out.open) delete out.open
  if (!out.close) delete out.close
  if (!(out.lastMinutes && out.lastMinutes > 0)) delete out.lastMinutes
  if (!out.label?.trim()) delete out.label
  if (!out.notifyText?.trim()) delete out.notifyText
  if (!out.notifyCloseMinutes || out.notifyCloseMinutes < 1) delete out.notifyCloseMinutes
  if (out.notifyOpen !== false) delete out.notifyOpen
  if (!out.override) delete out.override
  // Notification text and the lock message alone have no effect (hasSchedule is false), but they are kept.
  return Object.keys(out).length ? out : null
}

function RuleField({ title, rule, onChange, hint }: {
  title: string
  rule: SchedRule | null | undefined
  onChange: (r: SchedRule | null) => void
  hint: string
}) {
  const mode = modeOf(rule)
  return (
    <div>
      <label className={label}>{title}</label>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <select className={input} value={mode} aria-label={title}
          onChange={e => {
            const m = e.target.value as Mode
            onChange(m === 'none' ? null : m === 'after_start' ? { type: 'after_start', minutes: 30 } : { type: 'at', at: '' })
          }}>
          <option value="none">Not set</option>
          <option value="after_start">Minutes after game start</option>
          <option value="at">Date and time</option>
        </select>
        {rule?.type === 'after_start' && (
          <div className="flex items-center gap-2">
            <input type="number" min={0} step={1} className={`${input} w-28`} aria-label={`${title}: minutes`}
              value={rule.minutes} onChange={e => onChange({ type: 'after_start', minutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            <span className="text-sm text-gray-500">minutes of play</span>
          </div>
        )}
        {rule?.type === 'at' && (
          <input type="datetime-local" className={input} aria-label={`${title}: date and time`}
            value={toLocalInput(rule.at)} onChange={e => onChange({ type: 'at', at: fromLocalInput(e.target.value) })} />
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  )
}

/**
 * Card tool: when teams can open this card. Edits go through the editor's own
 * draft Save (`stage`), like every other field on the card page.
 */
export function CardScheduleEditor({ task, stage }: {
  task: BingoTask
  stage: (patch: Partial<BingoTask>) => void
}) {
  const s: CardSchedule = task.schedule ?? {}
  const set = (patch: Partial<CardSchedule>) => stage({ schedule: tidy({ ...s, ...patch }) })
  const setLooseNotify = set

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">{describeSchedule(task.schedule)}</p>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <RuleField title="Opens" rule={s.open} onChange={r => set({ open: r })}
          hint="Before this the card is locked and shows a countdown. Minutes of play skip any time the game or timer was paused." />
        <RuleField title="Closes" rule={s.close} onChange={r => set({ close: r })}
          hint="After this a team that has not started the card cannot open it. A team that already started can still finish." />
        <div>
          <label className={label} htmlFor="sched-last">Only in the last N minutes of the board timer</label>
          <input id="sched-last" type="number" min={1} step={1} className={`${input} w-32`} placeholder="Off"
            value={s.lastMinutes ?? ''} onChange={e => set({ lastMinutes: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
          <p className="text-xs text-gray-400 mt-1">Needs a running timer on the board. With no timer running the card stays locked.</p>
        </div>
        <div>
          <label className={label} htmlFor="sched-label">Lock message</label>
          <input id="sched-label" className={input} maxLength={120} placeholder="e.g. Only available after 10:30 am"
            value={s.label ?? ''} onChange={e => setLooseNotify({ label: e.target.value })} />
          <p className="text-xs text-gray-400 mt-1">What teams and observers read on the locked card. Empty = an automatic message with a countdown.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Notifications</p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={s.notifyOpen !== false} onChange={e => setLooseNotify({ notifyOpen: e.target.checked })} />
          Tell every team when the card opens
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sched-warn">Warn before it closes (minutes)</label>
            <input id="sched-warn" type="number" min={1} step={1} className={input} placeholder="No warning"
              value={s.notifyCloseMinutes ?? ''} onChange={e => setLooseNotify({ notifyCloseMinutes: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
          </div>
          <div>
            <label className={label} htmlFor="sched-text">Opening message</label>
            <input id="sched-text" className={input} maxLength={120} placeholder={`${task.title || 'Card'} is now open`}
              value={s.notifyText ?? ''} onChange={e => setLooseNotify({ notifyText: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-gray-400">Teams see a banner at the top of the board, hear a beep and feel a vibration (where the phone allows it). They need the board open.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700">Facilitator override</p>
        {([['', 'Follow the schedule'], ['open', 'Open now (ignore the schedule)'], ['locked', 'Lock now (ignore the schedule)']] as const).map(([v, text]) => (
          <label key={v} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="sched-override" checked={(s.override ?? '') === v}
              onChange={() => set({ override: v === '' ? null : v })} />
            {text}
          </label>
        ))}
      </div>

      {(task.schedule || s.label || s.notifyText) && (
        <button type="button" onClick={() => stage({ schedule: null })}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-bold hover:bg-red-50">
          Remove the schedule
        </button>
      )}
      <p className="text-xs text-gray-400">Changes are saved with the card's Save button.</p>
    </div>
  )
}
