import { CategoryIcon } from './BingoTileFace'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectorPrizeBand } from '../lib/prizeCard/ProjectorPrizeBand'
import { supabase } from '../lib/supabase'
import { usePrizeClaims } from '../hooks/usePrizeClaims'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { prizeView, tooLateText, type PrizeView } from '../lib/prizeCard/logic'
import { scoreTeams } from '../lib/teamScore'
import { PrizeStrip } from '../lib/prizeCard/PrizeStrip'
import { PrizeReveal, type RevealData } from '../lib/prizeCard/PrizeReveal'
import type { PrizeTheme } from '../lib/prizeCard/shared'
import type { BingoScan, BingoTask, BingoTeam } from '../types/database'

function OneStrip({ task, view, memberId, theme, onClaim, onOpen }: {
  task: BingoTask
  view: PrizeView
  memberId: string | null
  theme: PrizeTheme
  onClaim: (memberId: string, boardCardId: string) => ReturnType<ReturnType<typeof usePrizeClaims>['claim']>
  onOpen: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const state = view.state

  const press = async () => {
    // The old team-password page keeps no member row, so there is nobody to claim as.
    if (!memberId) { setMessage('To claim this card, open the board from your team link and enter your name.'); return }
    if (!task.placement_id) { setMessage(tooLateText(null)); return }
    setBusy(true); setMessage(null); setFailed(false)
    try {
      const r = await onClaim(memberId, task.placement_id)
      if (!r.ok) setMessage(tooLateText(r.winner))
    } catch {
      setFailed(true)
      setMessage('Could not reach the server. Check your connection and try again.')
    } finally { setBusy(false) }
  }
  return <PrizeStrip state={state} theme={theme} busy={busy} message={state.kind === 'won' || state.kind === 'lost' ? null : message} failed={failed} title={task.title} hint={task.completion_warning} onClaim={() => void press()} onOpen={onOpen} slots={view.slots} notes={view.notes} slotIcon={sl => <CategoryIcon category={sl.category} iconKey={sl.iconKey} className="w-5 h-5" />} />
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
  // A box is done when a completed scan names its placement, or (legacy scan
  // without a box) its card - the same predicate the server uses.
  const doneScans = scans.filter(s => s.completed)
  const isDone = (c: { id: string; placement_id?: string | null }) =>
    doneScans.some(s => s.board_card_id === c.placement_id || (s.board_card_id == null && s.task_id === c.id))
  // Score and lines are only worked out when some prize asks for them.
  const needsScore = prizeTasks.some(t => t.prize_min_points != null || t.prize_min_lines != null)
  const scored = needsScore
    ? scoreTeams({ teams: [{ id: teamId } as BingoTeam], scans, boardTasks: gridTasks, duels: [] })[0]
    : null
  return (
    <div className="flex flex-col gap-2 mt-3" data-prize-strips>
      {prizeTasks.map(t => (
        <OneStrip
          key={t.placement_id ?? t.id} task={t} memberId={memberId} theme={theme}
          view={prizeView({
            rule: t, grid: gridTasks, isDone, teamId, role,
            points: scored ? scored.tilePoints + scored.lineBonus : 0, lines: scored?.bingos ?? 0,
            claims: claims.filter(c => c.board_card_id === t.placement_id),
          })}
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
