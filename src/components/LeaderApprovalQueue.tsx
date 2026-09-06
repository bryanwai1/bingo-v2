import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBingoScans } from '../hooks/useBingoScans'

// Pending submissions waiting on the team leader.
//
// A member taps Complete, submit_tile() marks the scan pending, and it lands
// here instead of on the marshal's screen. The leader approves once and the
// points score. Four phones on one team therefore produce one host-facing
// event, not four — which is the whole point at a 700-player session.

type Pending = {
  id: string
  task_id: string
  submitted_at: string | null
  taskTitle: string
  memberName: string
}

export function LeaderApprovalQueue({ teamId }: { teamId: string | null }) {
  const { approveTile } = useBingoScans()
  const [pending, setPending] = useState<Pending[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const memberId = localStorage.getItem('bingo-dash-member-id')
  const isLeader = localStorage.getItem('bingo-dash-member-role') === 'leader'

  const load = useCallback(async () => {
    if (!teamId || !isLeader) { setPending([]); return }
    const { data: scans } = await supabase
      .from('bingo_scans')
      .select('id, task_id, submitted_at, submitted_by')
      .eq('team_id', teamId).eq('pending', true)
      .order('submitted_at', { ascending: true })
    if (!scans?.length) { setPending([]); return }

    const taskIds = [...new Set(scans.map(s => s.task_id))]
    const memberIds = [...new Set(scans.map(s => s.submitted_by).filter(Boolean))]
    const [{ data: tasks }, { data: members }] = await Promise.all([
      supabase.from('bingo_tasks').select('id, title').in('id', taskIds),
      memberIds.length
        ? supabase.from('bingo_members').select('id, name').in('id', memberIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const titleOf = new Map((tasks ?? []).map(t => [t.id, t.title]))
    const nameOf = new Map((members ?? []).map(m => [m.id, m.name]))
    setPending(scans.map(s => ({
      id: s.id, task_id: s.task_id, submitted_at: s.submitted_at,
      taskTitle: titleOf.get(s.task_id) ?? 'Challenge',
      memberName: s.submitted_by ? (nameOf.get(s.submitted_by) ?? 'A teammate') : 'A teammate',
    })))
  }, [teamId, isLeader])

  useEffect(() => { void load() }, [load])

  // Filtered to this team only — a global subscription here would be one
  // broadcast per phone per submission across the whole event.
  useEffect(() => {
    if (!teamId || !isLeader) return
    let t: ReturnType<typeof setTimeout> | null = null
    const nudge = () => { if (t) clearTimeout(t); t = setTimeout(() => { void load() }, 250) }
    const ch = supabase
      .channel(`leader-queue-${teamId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_scans', filter: `team_id=eq.${teamId}` }, nudge)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [teamId, isLeader, load])

  if (!isLeader || !memberId || pending.length === 0) return null

  const act = async (scanId: string, approve: boolean) => {
    setBusy(scanId); setErr('')
    const r = await approveTile(scanId, memberId, approve)
    setBusy(null)
    if (r.error) { setErr(r.error); return }
    await load()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3">
      <div className="max-w-md mx-auto rounded-3xl border-2 border-emerald-400/60 a-bg overflow-hidden shadow-2xl">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center justify-between bg-emerald-500/20 border-b border-emerald-400/30"
        >
          <span className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <span className="a-text font-black text-sm uppercase tracking-wide">Leader approvals</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-gray-950 text-xs font-black">
              {pending.length}
            </span>
            <span className="text-emerald-200 text-xs">{open ? '▾' : '▴'}</span>
          </span>
        </button>

        {open && (
          <div className="max-h-72 overflow-y-auto divide-y divide-transparent">
            {pending.map(p => (
              <div key={p.id} className="px-4 py-3">
                <p className="a-text font-bold text-sm">{p.taskTitle}</p>
                <p className="a-text-3 text-xs mt-0.5">Submitted by {p.memberName}</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => void act(p.id, false)}
                    disabled={busy === p.id}
                    className="py-2.5 rounded-xl a-text-2 text-sm font-bold border border-white/15 disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => void act(p.id, true)}
                    disabled={busy === p.id}
                    className="py-2.5 rounded-xl a-text text-sm font-black bg-emerald-500 active:scale-95 transition-transform disabled:opacity-40"
                  >
                    {busy === p.id ? '...' : 'Approve ✅'}
                  </button>
                </div>
              </div>
            ))}
            {err && <p className="px-4 py-2 text-center text-red-400 text-xs font-bold">{err}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
