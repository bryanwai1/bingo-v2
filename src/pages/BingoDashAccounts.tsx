import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { FacilitatorSessions } from '../components/FacilitatorSessions'
import { errText } from '../lib/errText'
import type { BingoAccount, BingoSection } from '../types/database'
import {
  PlansPanel, EnrollPanel, toDateInput, fromDateInput, addDays,
  type BingoPlan, type AccountInvite,
} from '../components/PlansAndEnroll'

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

// Shape returned by owner_preview_account_sync (20261119_sync_preview_and_protect.sql)
type SyncPreviewBoard = {
  board: string; name: string; email: string | null
  changes: {
    slot: number; title: string
    edited: boolean   // changed in the app on their side since it was last in step
    fields: { field: string; from: string | null; to: string | null }[]
    parts: { part: string; from: number; to: number }[]
  }[]
  added: { slot: number; title: string }[]
}
// Slots the owner chose to sync, per board id
type SyncPicks = Record<string, number[]>

const PART_LABELS: Record<string, string> = {
  bingo_task_pages: 'instruction pages', bingo_task_photos: 'photos', bingo_task_links: 'links',
  bingo_task_samples: 'samples', bingo_task_secrets: 'secrets', bingo_prize_secrets: 'prize details',
  bingo_breakout_puzzles: 'puzzles', bingo_draw_slots: 'draw slots', bingo_draw_items: 'draw items',
}
const FIELD_LABELS: Record<string, string> = {
  title: 'title', hex_code: 'colour', hex_custom: 'custom colour', task_type: 'card type',
  points: 'points', category: 'category', completion_inputs: 'completion settings',
}
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f.replace(/_/g, ' ')
const shown = (v: string | null) => (v === null || v === '' ? '(empty)' : v)

function SyncPreviewDialog({ account, boards, onCancel, onConfirm }: {
  account: BingoAccount | null; boards: SyncPreviewBoard[]
  onCancel: () => void; onConfirm: (picks: SyncPicks, settings: boolean) => void
}) {
  const touched = boards.filter(b => b.changes.length > 0 || b.added.length > 0)
  const key = (board: string, slot: number) => `${board}:${slot}`
  // Ticked = will be synced. Cards they edited start unticked, so they are kept.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(touched.flatMap(b => [
    ...b.changes.filter(c => !c.edited).map(c => key(b.board, c.slot)),
    ...b.added.map(c => key(b.board, c.slot)),
  ])))
  const [settings, setSettings] = useState(false)
  const toggle = (k: string) => setPicked(p => {
    const next = new Set(p)
    if (!next.delete(k)) next.add(k)
    return next
  })
  const confirm = () => onConfirm(
    // Every previewed board gets an entry, so an unticked board syncs nothing.
    Object.fromEntries(boards.map(b => [b.board,
      [...b.changes, ...b.added].filter(c => picked.has(key(b.board, c.slot))).map(c => c.slot)])),
    settings)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl a-surface-2 border a-border">
        <div className="px-5 pt-5 pb-3">
          <h2 className="a-text text-lg font-black">Choose what to sync</h2>
          <p className="a-text-3 text-xs mt-1">
            Ticked cards on {account ? `${account.email ?? 'this account'}'s board` : 'each given board'} are overwritten with your version.
            Cards marked <span className="text-amber-300 font-bold">edited by them</span> start unticked, so their changes are kept.
            Teams and scores are never touched.
          </p>
        </div>
        <div className="px-5 overflow-y-auto flex flex-col gap-4">
          {touched.map(b => (
            <div key={b.board}>
              <p className="a-text text-sm font-black">{b.name} <span className="a-text-3 font-medium">· {b.email ?? 'no email'}</span></p>
              <ul className="mt-1 flex flex-col gap-2">
                {b.changes.map(c => (
                  <li key={c.slot}>
                    <label className="flex items-start gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-teal-500"
                        checked={picked.has(key(b.board, c.slot))} onChange={() => toggle(key(b.board, c.slot))} />
                      <span className="min-w-0">
                        <span className="a-text text-xs font-bold">{c.title}</span>
                        {c.edited && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-amber-300">edited by them</span>}
                        {c.fields.map(f => (
                          <span key={f.field} className="block a-text-3 text-[11px] break-words">
                            {fieldLabel(f.field)}: theirs <span className="text-amber-300">{shown(f.from)}</span> → yours <span className="text-teal-300">{shown(f.to)}</span>
                          </span>
                        ))}
                        {c.parts.map(p => (
                          <span key={p.part} className="block a-text-3 text-[11px]">
                            {PART_LABELS[p.part] ?? p.part} differ{p.from !== p.to ? ` (theirs ${p.from}, yours ${p.to})` : ''}
                          </span>
                        ))}
                      </span>
                    </label>
                  </li>
                ))}
                {b.added.map(c => (
                  <li key={`add-${c.slot}`}>
                    <label className="flex items-start gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-teal-500"
                        checked={picked.has(key(b.board, c.slot))} onChange={() => toggle(key(b.board, c.slot))} />
                      <span className="a-text text-xs font-bold">{c.title} <span className="a-text-3 font-medium">· new card, they don't have it yet</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <label className="flex items-start gap-3 a-text-3 text-xs cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-teal-500" checked={settings} onChange={e => setSettings(e.target.checked)} />
            Also copy your board's display settings (scoreboard theme, bonus timers, card pauses)
          </label>
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-bold a-text border border-white/20 hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={confirm} disabled={picked.size === 0 && !settings}
            className="px-4 py-2 rounded-xl text-sm font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors disabled:opacity-40">
            Sync {picked.size} card{picked.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
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
  const { account: me, supportFor, exitSupport } = useBingoAuth()
  // Coming back to this page ends support mode.
  useEffect(() => { if (supportFor) exitSupport() }, [supportFor, exitSupport])
  // The account whose board tools (give / sync / undo) are open
  const [managing, setManaging] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<BingoAccount[]>([])
  const [boards, setBoards] = useState<BingoSection[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  // Board chosen per account for "Give board" ('' = the default template)
  const [pickedBoard, setPickedBoard] = useState<Record<string, string>>({})
  const [plans, setPlans] = useState<BingoPlan[]>([])
  const [invites, setInvites] = useState<AccountInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)
  // What a sync would change, shown for confirmation before anything is written
  const [syncPreview, setSyncPreview] = useState<{ account: BingoAccount | null; boards: SyncPreviewBoard[] } | null>(null)
  const inviteUrl = `${window.location.origin}/bingo-dash/login`

  const load = useCallback(async () => {
    const [accountsRes, boardsRes, settingsRes, plansRes, invitesRes] = await Promise.all([
      supabase.from('bingo_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('bingo_sections').select('*').is('owner_id', null).order('sort_order'),
      supabase.from('bingo_settings').select('template_section_id').eq('id', 'main').maybeSingle(),
      supabase.from('bingo_plans').select('*').order('sort_order'),
      supabase.from('bingo_account_invites').select('*').order('created_at', { ascending: false }),
    ])
    // Both tables come from 20261113_plans_and_enroll.sql; until it is run the
    // queries error and the page falls back to the built-in three plans.
    setPlans((plansRes.data as BingoPlan[] | null) ?? [])
    setInvites((invitesRes.data as AccountInvite[] | null) ?? [])
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
    expires?: string | null   // undefined = keep, null = no expiry
  }) => {
    setBusyId(a.id)
    const { error } = await supabase.rpc('set_account_plan', {
      p_account: a.id,
      p_plan: patch.plan ?? a.plan ?? 'trial',
      p_max_boards: patch.max_boards ?? a.max_boards ?? 3,
      p_max_teams: patch.max_teams_per_board ?? a.max_teams_per_board ?? 20,
      p_expires: patch.expires !== undefined ? patch.expires : (a.plan_expires_at ?? null),
    })
    setBusyId(null)
    if (error) alert(error.message)
    else await load()
  }

  const deleteAccount = async (a: BingoAccount) => {
    if (!confirm(`Permanently delete ${a.email ?? 'this account'}? Their login and account are removed and this cannot be undone.`)) return
    setBusyId(a.id)
    const { error } = await supabase.rpc('owner_delete_account', { p_account: a.id })
    setBusyId(null)
    if (error) setNotice(`Could not delete: ${errText(error)}`)
    else { setNotice(`Deleted ${a.email ?? 'account'}.`); await load() }
  }

  const toggleGame = async (a: BingoAccount, field: 'can_bingo' | 'can_flag') => {
    setBusyId(a.id)
    try {
      await supabase.from('bingo_accounts').update({ [field]: !a[field] }).eq('id', a.id)
      await load()
    } finally { setBusyId(null) }
  }

  // Support mode: open the normal admin page working as this account — the
  // same page they see, so every setting on it can be changed for them.
  // It opens in a new tab: support mode is per tab, so this tab stays on the
  // owner's own account.
  const openTenantAdmin = (a: BingoAccount) => {
    window.open(`/bingo-dash/admin?support=${a.id}`, '_blank', 'noopener')
  }

  const saveTemplate = async (sectionId: string) => {
    const value = sectionId || null
    setTemplateId(value)
    await supabase.from('bingo_settings').update({ template_section_id: value }).eq('id', 'main')
  }

  const provision = async (a: BingoAccount, boardId: string | null) => {
    if (!boardId && !templateId) {
      setNotice('Pick a template board first.')
      return
    }
    setBusyId(a.id)
    setNotice('')
    try {
      const { error } = await supabase.rpc('admin_clone_template_for', { p_target: a.id, p_template: boardId })
      if (error) throw error
      const name = boardId ? boards.find(b => b.id === boardId)?.name : null
      setNotice(`Gave ${a.email ?? 'account'} a fresh copy of ${name ? `“${name}”` : 'the template board'}.`)
    } catch (err) {
      setNotice(`Could not clone board: ${errText(err)}`)
    } finally { setBusyId(null) }
  }

  // Bring boards that were given to an account back in step with the board they
  // were copied from (cards, unlock chain, colours, pages ...). Teams, scores and
  // progress are kept. One account, or every account when `a` is null.
  // Step 1: ask the database what the sync would change and show it. Nothing
  // is written until the owner confirms in the dialog (runSync).
  const syncBoards = async (a: BingoAccount | null) => {
    setBusyId(a?.id ?? 'sync-all')
    setNotice('')
    try {
      const { data, error } = await supabase.rpc('owner_preview_account_sync', { p_account: a?.id ?? null })
      if (error) throw error
      const list = (data as { boards?: SyncPreviewBoard[] } | null)?.boards ?? []
      if (list.length === 0) {
        setNotice('Nothing to sync: no board here remembers its source yet (only boards given after the sync SQL was run do).')
      } else if (list.every(b => b.changes.length === 0 && b.added.length === 0)) {
        setNotice(`Nothing to sync: ${a ? `${a.email ?? 'this account'}'s board already matches` : 'every given board already matches'} the board it was copied from.`)
      } else {
        setSyncPreview({ account: a, boards: list })
      }
    } catch (err) {
      setNotice(`Could not preview the sync: ${errText(err)}`)
    } finally { setBusyId(null) }
  }

  const runSync = async (a: BingoAccount | null, picks: SyncPicks, settings: boolean) => {
    setSyncPreview(null)
    setBusyId(a?.id ?? 'sync-all')
    setNotice('')
    try {
      const { data, error } = await supabase.rpc('owner_sync_account_boards',
        { p_account: a?.id ?? null, p_picks: picks, p_settings: settings })
      if (error) throw error
      const detail = (data as { detail?: { updated?: number; added?: number }[] } | null)?.detail ?? []
      const cards = detail.reduce((n, d) => n + (d.updated ?? 0) + (d.added ?? 0), 0)
      setNotice(`Synced ${cards} card${cards === 1 ? '' : 's'}${a ? ` for ${a.email ?? 'the account'}` : ''}. Teams and scores were not touched. "Undo sync" puts it back.`)
    } catch (err) {
      setNotice(`Could not sync: ${errText(err)}`)
    } finally { setBusyId(null) }
  }

  // Put an account's given board(s) back to the copy saved just before the
  // last sync. Teams and scores are kept.
  const undoSync = async (a: BingoAccount) => {
    if (!confirm(`Undo the last sync for ${a.email ?? 'this account'}? Their board goes back to how it was just before that sync. Any card edits made since the sync are lost. Teams and scores are kept.`)) return
    setBusyId(a.id)
    setNotice('')
    try {
      const { data, error } = await supabase.rpc('owner_undo_board_sync', { p_account: a.id })
      if (error) throw error
      const d = data as { boards?: number; detail?: { backup_at?: string }[] } | null
      const n = d?.boards ?? 0
      const at = d?.detail?.[0]?.backup_at
      setNotice(n === 0
        ? 'Nothing to undo: no sync backup is saved for this account.'
        : `Restored ${n} board${n === 1 ? '' : 's'} for ${a.email ?? 'the account'} to the copy saved ${at ? new Date(at).toLocaleString() : 'before the last sync'}.`)
    } catch (err) {
      setNotice(`Could not undo: ${errText(err)}`)
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
            {a.id !== me?.id && (
              <button onClick={() => deleteAccount(a)} disabled={busyId === a.id}
                className="px-3 py-1.5 rounded-xl text-xs font-black bg-white/10 hover:bg-red-600 a-text transition-colors disabled:opacity-50">
                Delete
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
          <button onClick={() => setManaging(m => m === a.id ? null : a.id)} aria-expanded={managing === a.id}
            title="Give a board, sync or undo a sync"
            className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-white/20 hover:bg-white/10 transition-colors">
            {managing === a.id ? 'Close' : 'Board tools'}
          </button>
          <button onClick={() => openTenantAdmin(a)}
            title="Open their admin page exactly as they see it, to view or change anything for them"
            className="px-3 py-1.5 rounded-xl text-xs font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors">
            Manage boards
          </button>
        </div>
      )}
      {managing === a.id && (
        <div className="mt-3 pt-3 border-t a-border flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              aria-label="Board to give"
              value={pickedBoard[a.id] ?? ''}
              onChange={e => setPickedBoard(p => ({ ...p, [a.id]: e.target.value }))}
              className="px-2 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none max-w-[11rem]">
              <option value="">Default template</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={() => provision(a, pickedBoard[a.id] || null)}
              disabled={busyId === a.id || (!templateId && !pickedBoard[a.id])}
              title="Clone the chosen board into this account"
              className="px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-40">
              {pickedBoard[a.id] ? 'Give board' : 'Give default board'}
            </button>
            <button onClick={() => syncBoards(a)} disabled={busyId === a.id}
              title="Update this account's given board to match the board it was copied from — keeps their teams and scores"
              className="px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-teal-400/40 hover:bg-teal-500/20 transition-colors disabled:opacity-40">
              Sync board
            </button>
            <button onClick={() => undoSync(a)} disabled={busyId === a.id}
              title="Put this account's board back to the copy saved just before the last sync"
              className="px-3 py-1.5 rounded-xl text-xs font-bold a-text border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-40">
              Undo sync
            </button>
          </div>
        </div>
      )}
      {!isFac && a.role !== 'owner' && a.status === 'approved' && (
        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t a-border">
          <span className="text-[11px] a-text-3 font-bold uppercase tracking-widest mr-1">Plan:</span>
          <select
            key={a.plan}
            defaultValue={a.plan ?? 'trial'}
            onChange={e => {
              // Choosing a plan fills in its limits and default length.
              const p = plans.find(x => x.key === e.target.value)
              void savePlan(a, p
                ? {
                    plan: p.key, max_boards: p.max_boards, max_teams_per_board: p.max_teams_per_board,
                    expires: p.default_days ? addDays(p.default_days) : null,
                  }
                : { plan: e.target.value })
            }}
            className="px-3 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none">
            {(plans.length ? plans : [
              { key: 'trial', name: 'Trial' }, { key: 'standard', name: 'Standard' }, { key: 'pro', name: 'Pro' },
            ]).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            {a.plan && !plans.some(p => p.key === a.plan) && plans.length > 0 && (
              <option value={a.plan}>{a.plan} (removed)</option>
            )}
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
          <label className="flex items-center gap-1 text-[11px] a-text-2 font-bold">
            Expires
            <input type="date" key={a.plan_expires_at ?? 'none'} defaultValue={toDateInput(a.plan_expires_at)}
              onChange={e => void savePlan(a, { expires: fromDateInput(e.target.value) })}
              className="px-2 py-1.5 rounded-xl bg-black/30 border-2 border-white/15 a-text text-xs focus:border-teal-500 outline-none" />
          </label>
          <button onClick={() => void savePlan(a, { expires: addDays(30, a.plan_expires_at) })}
            className="px-2 py-1.5 rounded-xl text-[11px] font-bold a-text border border-white/20 hover:bg-white/10">+30d</button>
          <button onClick={() => void savePlan(a, { expires: addDays(365, a.plan_expires_at) })}
            className="px-2 py-1.5 rounded-xl text-[11px] font-bold a-text border border-white/20 hover:bg-white/10">+1y</button>
          <button onClick={() => void savePlan(a, { expires: null })} disabled={!a.plan_expires_at}
            className="px-2 py-1.5 rounded-xl text-[11px] font-bold a-text border border-white/20 hover:bg-white/10 disabled:opacity-40">No expiry</button>
          {a.plan_expires_at && (
            <span className={`text-[11px] font-black ${new Date(a.plan_expires_at).getTime() < Date.now() ? 'text-red-300' : 'a-text-3'}`}>
              {new Date(a.plan_expires_at).getTime() < Date.now() ? 'expired' : `ends ${toDateInput(a.plan_expires_at)}`}
            </span>
          )}
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
      {syncPreview && (
        <SyncPreviewDialog account={syncPreview.account} boards={syncPreview.boards}
          onCancel={() => setSyncPreview(null)}
          onConfirm={(picks, settings) => runSync(syncPreview.account, picks, settings)} />
      )}
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

            <EnrollPanel plans={plans} invites={invites} loginUrl={inviteUrl} onChanged={load} onNotice={setNotice} />
            <PlansPanel
              plans={plans}
              usage={accounts.reduce<Record<string, number>>((m, x) => { if (x.role !== 'owner') m[x.plan ?? 'trial'] = (m[x.plan ?? 'trial'] ?? 0) + 1; return m }, {})}
              onChanged={load}
            />

            <section className="px-4 py-4 rounded-2xl a-surface-2 border a-border">
              <h2 className="a-text text-sm font-black uppercase tracking-widest mb-2">Sync given boards</h2>
              <p className="a-text-3 text-xs mb-3">
                Changed a card, the unlock chain or a colour on your board? Push it to every board you already gave out —
                no need to give a new one. You pick which cards to sync before anything is written, and cards they
                edited are kept unless you tick them. Teams, scores and progress are kept. Each board is backed up first, so "Undo sync" on an account puts it back.
              </p>
              <button onClick={() => syncBoards(null)} disabled={busyId === 'sync-all'}
                className="px-4 py-2 rounded-xl text-sm font-black bg-teal-600 hover:bg-teal-500 a-text transition-colors disabled:opacity-40">
                {busyId === 'sync-all' ? 'Syncing…' : 'Sync all given boards'}
              </button>
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
