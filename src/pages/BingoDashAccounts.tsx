import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { FacilitatorSessions } from '../components/FacilitatorSessions'
import { errText } from '../lib/errText'
import type { BingoAccount, BingoSection } from '../types/database'

const STATUS_STYLES: Record<BingoAccount['status'], string> = {
  pending:  'bg-amber-400/15 text-amber-300 border-amber-400/40',
  approved: 'bg-green-400/15 text-green-300 border-green-400/40',
  rejected: 'bg-red-400/15 text-red-300 border-red-400/40',
}

const fmtExpiry = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

/**
 * How long a request has been sitting there. Triaging Pending is really a
 * question of "who has been waiting longest", so lead with the age and keep
 * the exact timestamp on hover.
 */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24)  return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30)   return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

function GameToggle({ label, on, busy, onToggle }: {
  label: string; on: boolean; busy: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle} disabled={busy}
      className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border transition-colors disabled:opacity-50 ${
        on
          ? 'bg-green-400/15 text-green-300 border-green-400/40 hover:bg-green-400/25'
          : 'a-surface-2 a-text-3 border-white/15 hover:bg-white/10'
      }`}>
      {label} {on ? 'ON' : 'OFF'}
    </button>
  )
}

export function BingoDashAccounts() {
  const navigate = useNavigate()
  const { account: me } = useBingoAuth()
  const [accounts, setAccounts] = useState<BingoAccount[]>([])
  const [boards, setBoards] = useState<BingoSection[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)
  const inviteUrl = `${window.location.origin}/bingo-dash/login`

  const load = useCallback(async () => {
    const [accountsRes, boardsRes, settingsRes] = await Promise.all([
      supabase.from('bingo_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('bingo_sections').select('*').is('owner_id', null).order('sort_order'),
      supabase.from('bingo_settings').select('template_section_id').eq('id', 'main').maybeSingle(),
    ])
    if (accountsRes.data) setAccounts(accountsRes.data as BingoAccount[])
    if (boardsRes.data) setBoards(boardsRes.data as BingoSection[])
    if (settingsRes.data) setTemplateId(settingsRes.data.template_section_id ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('bingo-accounts-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_accounts' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const setStatus = async (id: string, status: BingoAccount['status']) => {
    if (status === 'approved' && !templateId) {
      setNotice('Heads up: no template board is set — this account will start without a default board. Pick a template below, then use "Give default board".')
    }
    setBusyId(id)
    try {
      await supabase.from('bingo_accounts').update({ status }).eq('id', id)
      await load()
    } finally { setBusyId(null) }
  }

  // Plan + limits are owner-only and go through set_account_plan(), not a
  // direct UPDATE: a renter must never be able to raise their own caps.
  const savePlan = async (a: BingoAccount, patch: {
    plan?: string; max_boards?: number; max_teams_per_board?: number
  }) => {
    setBusyId(a.id)
    const { error } = await supabase.rpc('set_account_plan', {
      p_account: a.id,
      p_plan: patch.plan ?? a.plan ?? 'trial',
      p_max_boards: patch.max_boards ?? a.max_boards ?? 3,
      p_max_teams: patch.max_teams_per_board ?? a.max_teams_per_board ?? 20,
      p_expires: a.plan_expires_at ?? null,
    })
    setBusyId(null)
    if (error) alert(error.message)
    else await load()
  }

  const toggleGame = async (a: BingoAccount, field: 'can_bingo' | 'can_flag') => {
    setBusyId(a.id)
    try {
      await supabase.from('bingo_accounts').update({ [field]: !a[field] }).eq('id', a.id)
      await load()
    } finally { setBusyId(null) }
  }

  const saveTemplate = async (sectionId: string) => {
    const value = sectionId || null
    setTemplateId(value)
    await supabase.from('bingo_settings').update({ template_section_id: value }).eq('id', 'main')
  }

  const provision = async (a: BingoAccount) => {
    if (!templateId) {
      setNotice('Pick a template board first.')
      return
    }
    setBusyId(a.id)
    setNotice('')
    try {
      const { error } = await supabase.rpc('admin_clone_template_for', { p_target: a.id })
      if (error) throw error
      setNotice(`Gave ${a.email ?? 'account'} a fresh copy of the template board.`)
    } catch (err) {
      setNotice(`Could not clone board: ${errText(err)}`)
    } finally { setBusyId(null) }
  }

  const endFacilitatorAccess = async (a: BingoAccount) => {
    setBusyId(a.id)
    try {
      const { error } = await supabase.from('bingo_accounts')
        .update({ access_expires_at: new Date().toISOString() }).eq('id', a.id)
      if (error) { setNotice(`Could not end access: ${errText(error)}`); return }
      await load()
    } finally { setBusyId(null) }
  }

  const removeFacilitator = async (a: BingoAccount) => {
    setBusyId(a.id)
    try {
      // facilitator_session_id must be cleared too. Leaving it set kept the
      // row excluded from `standalone` below, so a removed facilitator became
      // an approved account with no host, no expiry and no way to manage it
      // from this page — while keeping its game flags.
      const { error } = await supabase.from('bingo_accounts')
        .update({ facilitator_host: null, access_expires_at: null, facilitator_session_id: null })
        .eq('id', a.id)
      if (error) { setNotice(`Could not remove facilitator: ${errText(error)}`); return }
      await load()
    } finally { setBusyId(null) }
  }

  // Crew who joined through a pass are listed as chips under their session,
  // so keep them out of the account lists — a busy event would otherwise bury
  // real client accounts under a dozen anonymous logins.
  const standalone = accounts.filter(a => !a.facilitator_session_id)
  const pending = standalone.filter(a => a.status === 'pending')
  const others = standalone.filter(a => a.status !== 'pending')

  const Row = ({ a }: { a: BingoAccount }) => {
    const isFac = !!a.facilitator_host
    const facExpired = !!a.access_expires_at && new Date(a.access_expires_at).getTime() <= Date.now()
    const hostEmail = accounts.find(x => x.id === a.facilitator_host)?.email ?? 'unknown host'
    return (
    <div className="px-4 py-3 rounded-2xl a-surface-2 border a-border">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="a-text font-bold text-sm truncate">{a.display_name ?? a.email ?? a.id}</p>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLES[a.status]}`}>
              {a.status}
            </span>
            {a.role === 'owner' && (
              <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-teal-400/15 text-teal-300 border-teal-400/40">
                owner
              </span>
            )}
            {isFac && (
              <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                facExpired
                  ? 'bg-red-400/15 text-red-300 border-red-400/40'
                  : 'bg-sky-400/15 text-sky-300 border-sky-400/40'
              }`}>
                facilitator
              </span>
            )}
            <span className="text-[11px] a-text-3" title={fmtExpiry(a.created_at)}>
              {a.status === 'pending' ? 'Requested' : 'Signed up'} {ago(a.created_at)}
            </span>
            {a.id === me?.id && <span className="text-[11px] a-text-3">you</span>}
          </div>
        </div>
        {a.role !== 'owner' && (
          <div className="flex gap-2 flex-shrink-0">
            {a.status !== 'approved' && (
              <button onClick={() => setStatus(a.id, 'approved')} disabled={busyId === a.id}
                className="px-3 py-1.5 rounded-xl text-xs font-black bg-green-600 hover:bg-green-500 a-text transition-colors disabled:opacity-50">
                Approve
              </button>
            )}
            {a.status !== 'rejected' && (
              <button onClick={() => setStatus(a.id, 'rejected')} disabled={busyId === a.id}
                className="px-3 py-1.5 rounded-xl text-xs font-black bg-white/10 hover:bg-red-500/80 a-text transition-colors disabled:opacity-50">
                {a.status === 'approved' ? 'Revoke' : 'Reject'}
              </button>
            )}
          </div>
        )}
      </div>
      {isFac && (
        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t a-border">
          <span className="text-xs a-text-2 min-w-0 truncate">
            Assisting <span className="a-text font-bold">{hostEmail}</span>
            {a.access_expires_at && (
              <span className={facExpired ? 'text-red-300' : ''}>
                {' '}· {facExpired ? 'expired' : 'expires'} {fmtExpiry(a.access_expires_at)}
              </span>
            )}
          </span>
          <div className="flex gap-2 ml-auto flex-shrink-0">
            {!facExpired && (
              <button onClick={() => endFacilitatorAccess(a)} disabled={busyId === a.id}
                className="px-3 py-1.5 rounded-xl text-xs font-black bg-white/10 hover:bg-red-500/80 a-text transition-colors disabled:opacity-50">
                End access now
              </button>
            )}
            <button onClick={() => removeFacilitator(a)} disabled={busyId === a.id}
              title="Turn this back into a normal account (no host, no expiry)"
              className="px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-50">
              Remove facilitator
            </button>
          </div>
        </div>
      )}
      {!isFac && a.role !== 'owner' && a.status === 'approved' && (
        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t a-border">
          <span className="text-[11px] a-text-3 font-bold uppercase tracking-widest mr-1">Games:</span>
          <GameToggle label="Bingo Dash" on={a.can_bingo} busy={busyId === a.id} onToggle={() => toggleGame(a, 'can_bingo')} />
          <GameToggle label="Flag Retrieval" on={a.can_flag} busy={busyId === a.id} onToggle={() => toggleGame(a, 'can_flag')} />
          <div className="flex gap-2 ml-auto">
            <button onClick={() => provision(a)} disabled={busyId === a.id || !templateId}
              title={templateId ? 'Clone the template board into this account' : 'Pick a template board first'}
              className="px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-40">
              Give default board
            </button>
          </div>
        </div>
      )}
      {!isFac && a.role !== 'owner' && a.status === 'approved' && (
        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t a-border">
          <span className="text-[11px] a-text-3 font-bold uppercase tracking-widest mr-1">Plan:</span>
          <select
            defaultValue={a.plan ?? 'trial'}
            onChange={e => void savePlan(a, { plan: e.target.value })}
            className="px-3 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none">
            <option value="trial">Trial</option>
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] a-text-2 font-bold">
            Boards
            <input type="number" min={1} defaultValue={a.max_boards ?? 3}
              onBlur={e => void savePlan(a, { max_boards: Number(e.target.value) })}
              className="w-16 px-2 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none" />
          </label>
          <label className="flex items-center gap-1 text-[11px] a-text-2 font-bold">
            Teams / board
            <input type="number" min={1} defaultValue={a.max_teams_per_board ?? 20}
              onBlur={e => void savePlan(a, { max_teams_per_board: Number(e.target.value) })}
              className="w-16 px-2 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none" />
          </label>
          {a.company_name && (
            <span className="text-[11px] a-text-3 ml-auto">{a.company_name}</span>
          )}
        </div>
      )}
    </div>
    )
  }

  return (
    <div className="min-h-screen a-bg px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-teal-400 text-xs font-black uppercase tracking-[0.3em]">Bingo Dash</p>
            <h1 className="a-text text-4xl font-black tracking-tight mt-1">Accounts</h1>
          </div>
          <button onClick={() => navigate('/bingo-dash/admin')}
            className="px-4 py-2 rounded-2xl a-text font-bold text-sm border border-white/20 hover:bg-white/10 transition-colors">
            ← Admin
          </button>
        </div>

        {loading ? (
          <p className="a-text-2 animate-pulse">Loading…</p>
        ) : (
          <div className="flex flex-col gap-8">
            <FacilitatorSessions />

            <section className="px-4 py-4 rounded-2xl a-surface-2 border a-border">
              <h2 className="a-text text-sm font-black uppercase tracking-widest mb-2">Client sign-up link</h2>
              <p className="a-text-3 text-xs mb-3">
                For a <b className="a-text-2">client renting the app</b>, not your crew — this gives them their own
                separate boards. They sign up with email or Google, then appear under Pending for your approval.
                Approving here does <b className="a-text-2">not</b> let them see your event.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate px-4 py-3 rounded-2xl bg-black/30 border-2 border-white/15 a-text-2 text-sm">
                  {inviteUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    setCopiedInvite(true)
                    setTimeout(() => setCopiedInvite(false), 1500)
                  }}
                  className="px-4 py-3 rounded-2xl text-sm font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors flex-shrink-0">
                  {copiedInvite ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </section>

            <section className="px-4 py-4 rounded-2xl a-surface-2 border a-border">
              <h2 className="a-text text-sm font-black uppercase tracking-widest mb-2">Default board template</h2>
              <p className="a-text-3 text-xs mb-3">
                New accounts get an independent copy of this board (cards, instructions, photos and links included) the moment you approve them.
              </p>
              <select
                value={templateId ?? ''}
                onChange={e => saveTemplate(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-black/30 border-2 border-white/15 a-text focus:border-teal-500 outline-none transition-colors">
                <option value="">— No template (accounts start empty) —</option>
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </section>

            {notice && <p className="text-amber-300 text-sm font-medium">{notice}</p>}

            <section>
              <h2 className="a-text text-sm font-black uppercase tracking-widest mb-3">
                Pending {pending.length > 0 && <span className="text-amber-400">({pending.length})</span>}
              </h2>
              {pending.length === 0
                ? <p className="a-text-3 text-sm">No one is waiting for approval.</p>
                : <div className="flex flex-col gap-2">{pending.map(a => <Row key={a.id} a={a} />)}</div>}
            </section>
            <section>
              <h2 className="a-text text-sm font-black uppercase tracking-widest mb-3">All accounts</h2>
              <div className="flex flex-col gap-2">{others.map(a => <Row key={a.id} a={a} />)}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
