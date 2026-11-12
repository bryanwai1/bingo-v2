import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectorPrizeBand } from '../lib/prizeCard/ProjectorPrizeBand'
import { supabase } from '../lib/supabase'
import { usePrizeClaims } from '../hooks/usePrizeClaims'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { completedGridCount, stripState, tooLateText } from '../lib/prizeCard/logic'
import { PrizeStrip } from '../lib/prizeCard/PrizeStrip'
import { PrizeReveal, type RevealData } from '../lib/prizeCard/PrizeReveal'
import type { PrizeTheme } from '../lib/prizeCard/shared'
import type { BingoScan, BingoTask } from '../types/database'

function OneStrip({ task, count, teamId, memberId, role, theme, claim, onClaim, onOpen }: {
  task: BingoTask
  count: number
  teamId: string
  memberId: string | null
  role: 'player' | 'observer'
  theme: PrizeTheme
  claim: Parameters<typeof stripState>[0]['claim']
  onClaim: (memberId: string, boardCardId: string) => ReturnType<ReturnType<typeof usePrizeClaims>['claim']>
  onOpen: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const state = stripState({ count, threshold: task.prize_threshold ?? 20, claim, teamId, role })

  const press = async () => {
    if (!memberId || !task.placement_id) { setMessage(tooLateText(null)); return }
    setBusy(true); setMessage(null); setFailed(false)
    try {
      const r = await onClaim(memberId, task.placement_id)
      if (!r.ok) setMessage(tooLateText(r.winner))
    } catch {
      setFailed(true)
      setMessage('Could not reach the server. Check your connection and try again.')
    } finally { setBusy(false) }
  }
  return <PrizeStrip state={state} theme={theme} busy={busy} message={state.kind === 'won' || state.kind === 'lost' ? null : message} failed={failed} title={task.title} onClaim={() => void press()} onOpen={onOpen} />
}

/** One strip per prize card under the grid (AC-13). Renders nothing when the board has none. */
export function PrizeCardStrips({ sectionId, teamId, memberId, role, theme, prizeTasks, gridTasks, scans, onOpen }: {
  sectionId: string
  teamId: string
  memberId: string | null
  role: 'player' | 'observer'
  theme: PrizeTheme
  prizeTasks: BingoTask[]
  gridTasks: BingoTask[]
  scans: BingoScan[]
  onOpen: (task: BingoTask) => void
}) {
  const { claims, claim } = usePrizeClaims(prizeTasks.length > 0 ? sectionId : null)
  if (prizeTasks.length === 0) return null
  const placements = gridTasks.map(t => ({ id: t.placement_id ?? '', task_id: t.id, slot: t.sort_order }))
  const count = completedGridCount(placements, scans)
  return (
    <div className="flex flex-col gap-2 mt-3" data-prize-strips>
      {prizeTasks.map(t => (
        <OneStrip
          key={t.placement_id ?? t.id} task={t} count={count} teamId={teamId} memberId={memberId} role={role} theme={theme}
          claim={claims.find(c => c.board_card_id === t.placement_id) ?? null}
          onClaim={claim} onOpen={() => onOpen(t)}
        />
      ))}
    </div>
  )
}

/**
 * Projector: the claim popup (5 s) then a persistent line, in a block below the
 * scoreboard (AC-14). Claims already there when the screen opens get no popup.
 */
export function ProjectorPrizeBandLive({ sectionId, theme }: { sectionId: string | null; theme: PrizeTheme }) {
  const { claims, loaded } = usePrizeClaims(sectionId)
  const seen = useRef<Record<string, number | null>>({})
  const opened = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  if (loaded) {
    for (const c of claims) if (!(c.id in seen.current)) seen.current[c.id] = opened.current ? Date.now() : null
    opened.current = true
  }
  return <ProjectorPrizeBand claims={claims} seenAt={seen.current} now={now} theme={theme} />
}

/** The winner's reveal page: secret text from get_prize_reveal, photos from the card's hero photos. */
export function PrizeRevealScreen({ task, memberId, theme, eventEnded, onBack }: {
  task: BingoTask
  memberId: string | null
  theme: PrizeTheme
  eventEnded: boolean
  onBack: () => void
}) {
  const { photos } = useBingoTaskPhotos(task.id)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<(RevealData & { team_name: string; claimed_at: string }) | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    if (!memberId || !task.placement_id) { setStatus('error'); return }
    const { data: d, error } = await supabase.rpc('get_prize_reveal', { p_member: memberId, p_board_card: task.placement_id })
    if (error || !d) { setStatus('error'); return }
    setData(d as typeof data); setStatus('ready')
  }, [memberId, task.placement_id])
  useEffect(() => { void load() }, [load])

  return (
    <PrizeReveal
      status={status} data={data} theme={theme} eventEnded={eventEnded}
      photos={photos.map(p => ({ id: p.id, photo_url: p.photo_url, caption: p.caption ?? null, position_x: p.position_x ?? null, position_y: p.position_y ?? null }))}
      winner={data?.team_name ?? ''} claimedAt={data?.claimed_at ?? new Date().toISOString()}
      onBack={onBack} onRetry={() => void load()}
    />
  )
}
