import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/errText'

export interface BingoPlan {
  key: string
  name: string
  max_boards: number
  max_teams_per_board: number
  default_days: number | null
  sort_order: number
}

export interface AccountInvite {
  email: string
  plan: string
  max_boards: number
  max_teams_per_board: number
  expires_at: string | null
  created_at: string
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export const toDateInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A picked date means "through the end of that day", local time. */
export const fromDateInput = (v: string): string | null => {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

export const addDays = (days: number, from?: string | null) => {
  const base = from && new Date(from).getTime() > Date.now() ? new Date(from) : new Date()
  base.setDate(base.getDate() + days)
  return base.toISOString()
}

const inputCls =
  'px-2 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none min-w-0'
const btnCls =
  'px-3 py-1.5 rounded-xl text-xs font-black a-text border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-40'

export function PlansPanel({ plans, usage, onChanged }: {
  plans: BingoPlan[]
  usage: Record<string, number>
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ key: '', name: '', boards: '3', teams: '20', days: '' })

  const update = async (key: string, patch: Partial<BingoPlan>) => {
    setBusy(true)
    const { error } = await supabase.from('bingo_plans').update(patch).eq('key', key)
    setBusy(false)
    if (error) alert(errText(error))
    else onChanged()
  }

  const remove = async (p: BingoPlan) => {
    const n = usage[p.key] ?? 0
    if (n > 0) {
      alert(`${n} account(s) are on “${p.name}”. Move them to another plan first.`)
      return
    }
    if (!confirm(`Delete the “${p.name}” plan? This cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('bingo_plans').delete().eq('key', p.key)
    setBusy(false)
    if (error) alert(errText(error))
    else onChanged()
  }

  const add = async () => {
    const key = draft.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    if (!key || !draft.name.trim()) { alert('Give the plan a key and a name.'); return }
    setBusy(true)
    const { error } = await supabase.from('bingo_plans').insert({
      key,
      name: draft.name.trim(),
      max_boards: Math.max(1, Number(draft.boards) || 1),
      max_teams_per_board: Math.max(1, Number(draft.teams) || 1),
      default_days: draft.days.trim() ? Math.max(1, Number(draft.days) || 1) : null,
      sort_order: plans.length,
    })
    setBusy(false)
    if (error) { alert(errText(error)); return }
    setDraft({ key: '', name: '', boards: '3', teams: '20', days: '' })
    onChanged()
  }

  const num = (e: React.FocusEvent<HTMLInputElement>) => Math.max(1, Number(e.target.value) || 1)

  return (
    <section className="px-4 py-4 rounded-2xl a-surface-2 border a-border">
      <h2 className="a-text text-sm font-black uppercase tracking-widest mb-2">Plans</h2>
      <p className="a-text-3 text-xs mb-3">
        Each plan sets the default limits and how long it lasts. Picking a plan on an account fills these in;
        you can still adjust an account afterwards.
      </p>
      <div className="flex flex-col gap-2">
        {plans.map(p => (
          <div key={p.key} className="flex flex-wrap items-end gap-2 px-3 py-2 rounded-xl border a-border">
            <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1 w-full sm:w-36">
              Name · <code className="normal-case">{p.key}</code>
              <input key={p.name} defaultValue={p.name} className={inputCls}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) void update(p.key, { name: v }) }} />
            </label>
            <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
              Boards
              <input type="number" min={1} key={p.max_boards} defaultValue={p.max_boards} className={`${inputCls} w-16`}
                onBlur={e => { const v = num(e); if (v !== p.max_boards) void update(p.key, { max_boards: v }) }} />
            </label>
            <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
              Teams / board
              <input type="number" min={1} key={p.max_teams_per_board} defaultValue={p.max_teams_per_board} className={`${inputCls} w-16`}
                onBlur={e => { const v = num(e); if (v !== p.max_teams_per_board) void update(p.key, { max_teams_per_board: v }) }} />
            </label>
            <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
              Days (blank = never)
              <input type="number" min={1} key={String(p.default_days)} defaultValue={p.default_days ?? ''} className={`${inputCls} w-24`}
                onBlur={e => {
                  const raw = e.target.value.trim()
                  const v = raw ? Math.max(1, Number(raw) || 1) : null
                  if (v !== p.default_days) void update(p.key, { default_days: v })
                }} />
            </label>
            <span className="text-[11px] a-text-3 ml-auto">{usage[p.key] ?? 0} account(s)</span>
            <button onClick={() => remove(p)} disabled={busy}
              className="px-3 py-1.5 rounded-xl text-xs font-black bg-white/10 hover:bg-red-500/80 a-text transition-colors disabled:opacity-40">
              Delete
            </button>
          </div>
        ))}
        {plans.length === 0 && <p className="a-text-3 text-sm">No plans yet — add one below, or run the plans SQL first.</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t a-border">
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Key
          <input value={draft.key} onChange={e => setDraft(d => ({ ...d, key: e.target.value }))} placeholder="gold" className={`${inputCls} w-24`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Name
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Gold" className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Boards
          <input type="number" min={1} value={draft.boards} onChange={e => setDraft(d => ({ ...d, boards: e.target.value }))} className={`${inputCls} w-16`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Teams / board
          <input type="number" min={1} value={draft.teams} onChange={e => setDraft(d => ({ ...d, teams: e.target.value }))} className={`${inputCls} w-16`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Days
          <input type="number" min={1} value={draft.days} onChange={e => setDraft(d => ({ ...d, days: e.target.value }))} placeholder="never" className={`${inputCls} w-20`} />
        </label>
        <button onClick={add} disabled={busy} className="px-4 py-1.5 rounded-xl text-xs font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors disabled:opacity-40">
          + Add plan
        </button>
      </div>
    </section>
  )
}

export function EnrollPanel({ plans, invites, loginUrl, onChanged, onNotice }: {
  plans: BingoPlan[]
  invites: AccountInvite[]
  loginUrl: string
  onChanged: () => void
  onNotice: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [planKey, setPlanKey] = useState('')
  const [boards, setBoards] = useState('3')
  const [teams, setTeams] = useState('20')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)

  const applyPlan = (key: string) => {
    setPlanKey(key)
    const p = plans.find(x => x.key === key)
    if (!p) return
    setBoards(String(p.max_boards))
    setTeams(String(p.max_teams_per_board))
    setExpiry(p.default_days ? toDateInput(addDays(p.default_days)) : '')
  }

  // Preselect the first plan once the catalogue arrives.
  useEffect(() => {
    if (!planKey && plans.length > 0) applyPlan(plans[0].key)
  }, [plans]) // eslint-disable-line react-hooks/exhaustive-deps

  const enroll = async () => {
    const em = email.trim().toLowerCase()
    if (!em.includes('@')) { onNotice('Enter a valid email.'); return }
    if (!planKey) { onNotice('Pick a plan first.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('owner_enroll_account', {
      p_email: em,
      p_plan: planKey,
      p_max_boards: Math.max(1, Number(boards) || 1),
      p_max_teams: Math.max(1, Number(teams) || 1),
      p_expires: fromDateInput(expiry),
    })
    setBusy(false)
    if (error) { onNotice(`Could not enroll: ${errText(error)}`); return }
    onNotice(data === 'applied'
      ? `${em} already had an account — approved and moved to the plan.`
      : `${em} is enrolled. When they sign in at the link below (email or Google) they are approved automatically.`)
    setEmail('')
    onChanged()
  }

  const cancel = async (em: string) => {
    if (!confirm(`Cancel the enrolment for ${em}?`)) return
    const { error } = await supabase.from('bingo_account_invites').delete().eq('email', em)
    if (error) onNotice(`Could not cancel: ${errText(error)}`)
    else onChanged()
  }

  const planName = (k: string) => plans.find(p => p.key === k)?.name ?? k

  return (
    <section className="px-4 py-4 rounded-2xl a-surface-2 border a-border">
      <h2 className="a-text text-sm font-black uppercase tracking-widest mb-2">Enroll an account</h2>
      <p className="a-text-3 text-xs mb-3">
        Add a client by email with a plan and expiry. No email is sent from here — send them the sign-in link
        ({' '}<code className="a-text-2">{loginUrl}</code>{' '}); signing in with this exact email approves them with this plan.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1 flex-1 min-w-[12rem]">
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@company.com" className={inputCls} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Plan
          <select value={planKey} onChange={e => applyPlan(e.target.value)} className={inputCls}>
            {plans.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Boards
          <input type="number" min={1} value={boards} onChange={e => setBoards(e.target.value)} className={`${inputCls} w-16`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Teams / board
          <input type="number" min={1} value={teams} onChange={e => setTeams(e.target.value)} className={`${inputCls} w-16`} />
        </label>
        <label className="flex flex-col text-[10px] a-text-3 font-bold uppercase gap-1">
          Expires (blank = never)
          <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className={inputCls} />
        </label>
        <button onClick={enroll} disabled={busy || plans.length === 0}
          className="px-4 py-1.5 rounded-xl text-xs font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors disabled:opacity-40">
          Enroll
        </button>
      </div>

      {invites.length > 0 && (
        <div className="mt-4 pt-3 border-t a-border">
          <p className="text-[11px] a-text-3 font-bold uppercase tracking-widest mb-2">Waiting to sign in</p>
          <div className="flex flex-col gap-1.5">
            {invites.map(i => (
              <div key={i.email} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border a-border">
                <span className="a-text text-sm font-bold min-w-0 truncate">{i.email}</span>
                <span className="text-[11px] a-text-3">
                  {planName(i.plan)} · {i.max_boards} boards · {i.max_teams_per_board} teams
                  {' · '}{i.expires_at ? `expires ${toDateInput(i.expires_at)}` : 'no expiry'}
                </span>
                <button onClick={() => cancel(i.email)} className={`${btnCls} ml-auto`}>Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
