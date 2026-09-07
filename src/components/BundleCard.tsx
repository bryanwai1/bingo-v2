import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aitbByName, aitbMaxPoints, type AitbActivity } from '../lib/aitbActivities'
import { BundleMission } from './BundleMission'
import type { BingoTask } from '../types/database'

// One tile holding a whole activity set.
//
// Ten activities as ten tiles would eat most of a 25-slot board and read as
// ten unrelated challenges. Here they are one tile: the team opens it, picks
// any activity in any order, and each is scored on its own — check-in, steps
// ticked, then a marshal approval that adds the completion award plus a speed
// bonus measured from that team's own check-in.

type Progress = {
  id: string
  activity_id: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  checked_in_at: string | null
  steps_done: number[]
  bonus: number
  difficulty: 'Easy' | 'Normal' | 'Hard'
  words: string[]
}

export function BundleCard({ task, teamId, marshalPassword }: {
  task: BingoTask
  teamId: string
  marshalPassword: string
}) {
  const [items, setItems] = useState<{ id: string; title: string; activity?: AitbActivity }[]>([])
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [err] = useState('')

  const load = useCallback(async () => {
    const [{ data: bi }, { data: pg }] = await Promise.all([
      supabase.from('bingo_bundle_items')
        .select('activity_id, sort_order, bingo_tasks!bingo_bundle_items_activity_id_fkey(id, title)')
        .eq('bundle_id', task.id).order('sort_order'),
      supabase.from('bingo_bundle_progress').select('*')
        .eq('team_id', teamId).eq('bundle_id', task.id),
    ])
    setItems((bi ?? []).map((r) => {
      const t = (r as unknown as { bingo_tasks: { id: string; title: string } }).bingo_tasks
      return { id: t.id, title: t.title, activity: aitbByName(t.title) }
    }))
    setProgress(Object.fromEntries(((pg ?? []) as Progress[]).map(p => [p.activity_id, p])))
  }, [task.id, teamId])

  useEffect(() => { void load() }, [load])







  const scoreOf = (p?: Progress, a?: AitbActivity) => {
    if (!p) return 0
    const complete = { Easy: 200, Normal: 350, Hard: 500 }[p.difficulty] ?? 350
    return (p.checked_in_at ? 100 : 0) + (p.steps_done?.length ?? 0) * 100
      + (p.status === 'approved' ? complete + p.bonus : 0)
    void a
  }

  const total = items.reduce((n, it) => n + scoreOf(progress[it.id], it.activity), 0)
  const doneCount = items.filter(it => progress[it.id]?.status === 'approved').length

  const openItem = items.find(it => it.id === open)
  if (openItem?.activity) {
    return (
      <BundleMission
        activity={openItem.activity}
        progress={progress[openItem.id] ?? null}
        teamId={teamId}
        bundleId={task.id}
        onBack={() => setOpen(null)}
        onChange={() => void load()}
      />
    )
  }

  return (
    <div className="rounded-3xl border-2 border-white/15 bg-white/5 overflow-hidden">
      <div className="px-5 py-4 bg-white/5 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Activity set</p>
            <p className="text-white font-black text-lg leading-tight">{task.title}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black text-emerald-300 tabular-nums">{total}</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">points</p>
          </div>
        </div>
        <p className="text-white/50 text-xs mt-1.5">
          {doneCount} of {items.length} approved · play them in any order
        </p>
      </div>

      <div className="divide-y divide-white/5">
        {items.map(it => {
          const p = progress[it.id]
          const a = it.activity
          const isOpen = open === it.id
          const score = scoreOf(p, a)
          const max = a ? aitbMaxPoints(a) : 0

          return (
            <div key={it.id}>
              <button
                onClick={() => setOpen(isOpen ? null : it.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{a?.emoji ?? '▪'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-white font-bold text-sm leading-tight">{it.title}</span>
                  <span className="block text-white/40 text-[11px] mt-0.5">
                    {a ? `${a.mins} min · ${a.difficulty}` : 'Activity'}
                    {max > 0 && ` · up to ${max} pts`}
                  </span>
                </span>
                {p?.status === 'approved' ? (
                  <span className="px-2 py-1 rounded-lg bg-emerald-400/20 text-emerald-300 text-xs font-black flex-shrink-0">
                    ✓ {score}
                  </span>
                ) : p?.checked_in_at ? (
                  <span className="px-2 py-1 rounded-lg bg-amber-400/20 text-amber-300 text-xs font-black flex-shrink-0">
                    {score} pts
                  </span>
                ) : (
                  <span className="text-white/25 text-xs flex-shrink-0">Not started</span>
                )}
                <span className={`text-white/25 text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>

            </div>
          )
        })}
      </div>

      {err && <p className="px-4 py-2 text-center text-red-400 text-xs font-bold">{err}</p>}
      {void marshalPassword}
    </div>
  )
}
