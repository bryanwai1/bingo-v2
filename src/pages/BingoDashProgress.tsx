import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ParticleBackground } from '../components/ParticleBackground'
import { fmtElapsed } from '../components/CardBonusTimer'
import { useProgressData, type ProgressData } from '../hooks/useProgressData'
import { useLiveLocations } from '../hooks/liveLocation'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { LiveMap } from '../components/LiveMap'
import { CardAdjust } from '../components/CardAdjust'
import { BINGO_LINES, buildBingoSlots, completedBingoLines } from '../lib/bingoLines'
import { scoreTeams, compareTeamScores, formatScore, type BoardTask, type TeamScore } from '../lib/teamScore'
import { activeElapsedMs, boxPoints, completionScan, scanElapsedMs } from '../lib/timeBonus'
import { isGridSlot, PRIZE_SLOT_MIN } from '../lib/prizeCard/logic'
import type { BingoScan, BingoSection, BingoTask, BingoTeam } from '../types/database'

/** A group with no activity for this long, while the game runs, is flagged as idle. */
const IDLE_MIN = 10

// Public progress page: anyone with the link can follow every group live.
// Shows team names only, never player names.
//
// Two tabs on one page. "Scores": each board's ranking, one row per group that
// opens to that group's own board. "Stations & prizes": everything that is not
// about a single group. Laptop: tabs in the header. Phone: a bottom tab bar.

type Placed = BoardTask & { placement_id: string }
type CellState = 'done' | 'doing' | 'none'
interface Cell {
  task: Placed
  state: CellState
  inLine: boolean
  /** done: time the inner timer stopped. */
  elapsedMs: number | null
  /** done: points including the time bonus. */
  points: number | null
  /** doing: when the clock started (null = a station card still waiting for its marshal). */
  startedAt: number | null
}
interface TeamView {
  score: TeamScore
  cells: (Cell | null)[]
  lines: number
}

function buildTeamView(score: TeamScore, tasks: Placed[], scans: BingoScan[], section: BingoSection): TeamView {
  const team = score.team
  const teamScans = scans.filter(s => s.team_id === team.id)
  const slots = buildBingoSlots(tasks)
  const completedPlacements = new Set(teamScans.filter(s => s.completed && s.board_card_id).map(s => s.board_card_id as string))
  const legacyCompleted = new Set(teamScans.filter(s => s.completed && !s.board_card_id).map(s => s.task_id))
  const openedPlacements = new Set(teamScans.filter(s => !s.completed && s.board_card_id).map(s => s.board_card_id as string))
  const legacyOpened = new Set(teamScans.filter(s => !s.completed && !s.board_card_id).map(s => s.task_id))
  const isDone = (t: Placed) => completedPlacements.has(t.placement_id) || legacyCompleted.has(t.id)
  const isOpen = (t: Placed) => !isDone(t) && (openedPlacements.has(t.placement_id) || legacyOpened.has(t.id))
  const doneIds = new Set(tasks.filter(isDone).map(t => t.placement_id))
  const lineIdx = completedBingoLines(slots.map(t => (t ? { id: t.placement_id } : null)), doneIds)
  const inLine = new Set<number>()
  lineIdx.forEach(i => BINGO_LINES[i].forEach(n => inLine.add(n)))

  const cells = slots.map<Cell | null>((t, i) => {
    if (!t) return null
    const base = { task: t, inLine: inLine.has(i), elapsedMs: null, points: null, startedAt: null }
    if (isDone(t)) {
      const sc = completionScan(teamScans, t.placement_id, t.id)
      return { ...base, state: 'done', elapsedMs: scanElapsedMs(sc, section), points: boxPoints(t, teamScans, section) }
    }
    if (isOpen(t)) {
      const sc = teamScans.find(s => !s.completed && (s.board_card_id === t.placement_id || (!s.board_card_id && s.task_id === t.id)))
      const from = (t.is_station ? sc?.timer_started_at : null) ?? sc?.scanned_at
      const startedAt = t.is_station && !sc?.timer_started_at ? null : from ? Date.parse(from) : null
      return { ...base, state: 'doing', startedAt }
    }
    return { ...base, state: 'none' }
  })
  return { score, cells, lines: lineIdx.length }
}

// Dark text on light boxes, white on dark ones (a navy box was unreadable).
function textOn(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return '#111827'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.5 ? '#ffffff' : '#111827'
}

const minutesAgo = (from: number, now: number) => {
  const m = Math.max(0, Math.floor((now - from) / 60000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`
}
const minutesText = (from: number, now: number) => {
  const m = Math.max(0, Math.floor((now - from) / 60000))
  return m < 1 ? 'under 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

const liveMs = (c: Cell, now: number, section: BingoSection) =>
  c.startedAt === null ? null : activeElapsedMs(c.startedAt, now, section)

const currentCell = (v: TeamView) =>
  v.cells.filter((c): c is Cell => !!c && c.state === 'doing').sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]

// ── small pieces ────────────────────────────────────────────────────────────

const Dot = ({ on, title }: { on: boolean; title?: string }) => (
  <span title={title} className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${on ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-gray-600'}`} />
)

function onlineInfo(data: ProgressData, teamId: string) {
  const o = data.online.get(teamId)
  const on = !!o && o.players + o.observers > 0
  return { on, title: on ? `${o!.players} player${o!.players === 1 ? '' : 's'}, ${o!.observers} observer${o!.observers === 1 ? '' : 's'} online` : 'Nobody from this team is online' }
}

// The team's own board, as the admin grid used to show it, with the time each
// box stopped at and what it paid (time bonus included).
function TeamBoard({ view, section, now, pendingTasks, onPick }: { view: TeamView; section: BingoSection; now: number; pendingTasks?: Set<string>; onPick?: (task: Placed) => void }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 mx-auto max-w-xl">
        {view.cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} className="aspect-square rounded-lg bg-white/5 border border-dashed border-white/10" />
          const ms = c.state === 'doing' ? liveMs(c, now, section) : c.elapsedMs
          return (
            <div
              key={c.task.placement_id}
              title={c.task.title}
              onClick={onPick && (() => onPick(c.task))}
              className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-center px-0.5 overflow-hidden ${c.state === 'doing' ? 'prog-pulse' : ''} ${onPick ? 'cursor-pointer' : ''}`}
              style={{
                backgroundColor: c.task.hex_code,
                opacity: c.state === 'none' ? 0.22 : 1,
                boxShadow: c.inLine && c.state === 'done' ? '0 0 0 2px #fbbf24, 0 0 8px #fbbf24aa' : undefined,
              }}
            >
              <span style={{ color: textOn(c.task.hex_code) }} className="text-[8px] min-[400px]:text-[9px] sm:text-[11px] font-black leading-tight line-clamp-3">{c.task.title}</span>
              {pendingTasks?.has(c.task.id) && <span className="absolute bottom-0.5 left-0.5 text-[10px] leading-none" title="Waiting for approval">⏳</span>}
              {c.state === 'done' && (
                <>
                  <span className="absolute top-0.5 right-0.5 bg-white/90 rounded-full w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center text-green-600 text-[9px] sm:text-[10px] font-black">✓</span>
                  <span className="mt-0.5 text-[8px] min-[400px]:text-[9px] sm:text-[11px] font-black leading-tight" style={{ color: textOn(c.task.hex_code) }}>{ms !== null ? fmtElapsed(ms) : '–'}</span>
                  <span className="text-[8px] min-[400px]:text-[9px] sm:text-[11px] font-black leading-none" style={{ color: textOn(c.task.hex_code) }}>+{formatScore(c.points)}</span>
                </>
              )}
              {c.state === 'doing' && (
                <span className="mt-0.5 text-[9px] sm:text-[11px] font-black leading-none" style={{ color: textOn(c.task.hex_code) }}>{ms !== null ? `⏱ ${fmtElapsed(ms)}` : 'waiting'}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-gray-400 mt-3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" />Done: time stopped, points with bonus</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 prog-pulse" />Doing now</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-600" />Not started</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border-2 border-amber-400" />Bingo line</span>
      </div>
    </div>
  )
}

function TeamRow({ rank, view, section, data, now, open, onToggle, taskCount, pendingTasks, lastActiveAt, gameOver, onPick }: {
  onPick?: (task: Placed) => void
  rank: number; view: TeamView; section: BingoSection; data: ProgressData; now: number; open: boolean; onToggle: () => void; taskCount: number
  /** Cards this team has submitted that are not approved yet. */
  pendingTasks?: Set<string>
  /** Latest sign of life from this team (card opened, finished, submitted, prize claimed). */
  lastActiveAt: number | null
  /** The board's timer has run out: nobody is expected to be active, so nothing is flagged idle. */
  gameOver: boolean
}) {
  const o = onlineInfo(data, view.score.team.id)
  const cur = currentCell(view)
  const ms = cur ? liveMs(cur, now, section) : null
  const idle = lastActiveAt !== null && !gameOver && now - lastActiveAt >= IDLE_MIN * 60000
  const since = data.offlineSince.get(view.score.team.id)
  return (
    <div className="border-t border-white/5 first:border-t-0">
      <button onClick={onToggle} aria-expanded={open}
        className={`w-full min-h-[56px] flex items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-white/5 ${open ? 'bg-white/5' : ''}`}>
        <span className="w-6 text-center text-gray-500 font-black shrink-0">{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-white font-black text-sm sm:text-base">
            <Dot on={o.on} title={o.title} /><span className="truncate">{view.score.team.name}</span>
            {pendingTasks && pendingTasks.size > 0 && (
              <span className="shrink-0 text-[11px] font-black px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300" title="Waiting for approval">⏳ {pendingTasks.size}</span>
            )}
          </span>
          <span className={`block truncate text-[11px] sm:text-xs font-bold mt-0.5 ${cur ? 'text-amber-300' : 'text-gray-600'}`}>
            {cur ? `⏱ ${cur.task.title}${ms !== null ? ` · ${fmtElapsed(ms)}` : ' · waiting'}` : 'Nothing open'}
          </span>
          <span className="block truncate text-[11px] font-bold mt-0.5">
            <span className={idle ? 'text-red-300' : 'text-gray-500'}>
              {lastActiveAt === null ? 'No activity yet' : `${idle ? '⚠ Idle · ' : ''}Active ${minutesAgo(lastActiveAt, now)}`}
            </span>
            {!o.on && <span className="text-gray-400"> · {since ? `offline ${minutesText(since, now)}` : 'offline'}</span>}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-white font-black text-base sm:text-lg tabular-nums leading-tight">{formatScore(view.score.basePoints)}</span>
          <span className="block text-[11px] text-gray-400 font-bold">
            <span className="text-amber-400">{view.lines} line{view.lines === 1 ? '' : 's'}</span> · <span className="text-green-400">{view.score.tasksDone}/{taskCount}</span>
          </span>
        </span>
        <span className={`text-gray-400 text-base shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-1 sm:px-3 pb-4 pt-2 bg-white/[0.03]">
          <div className="grid grid-cols-3 gap-2 mb-3 max-w-xl mx-auto text-center">
            <div className="rounded-lg bg-black/30 py-1.5"><p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Points</p><p className="text-lg font-black text-white">{formatScore(view.score.basePoints)}</p></div>
            <div className="rounded-lg bg-black/30 py-1.5"><p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Bingos</p><p className="text-lg font-black text-amber-400">{view.lines}<span className="text-xs text-gray-500">/12</span></p></div>
            <div className="rounded-lg bg-black/30 py-1.5"><p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Done</p><p className="text-lg font-black text-green-400">{view.score.tasksDone}</p></div>
          </div>
          <TeamBoard view={view} section={section} now={now} pendingTasks={pendingTasks} onPick={onPick} />
          {onPick && <p className="text-center text-[11px] text-gray-500 mt-2">Admin: tap a card to fix its time</p>}
        </div>
      )}
    </div>
  )
}

// ── per-board data ──────────────────────────────────────────────────────────

function useBoard(section: BingoSection, data: ProgressData) {
  return useMemo(() => {
    const taskById = new Map<string, BingoTask>(data.tasks.map(t => [t.id, t]))
    const cards = data.boardCards.filter(bc => bc.section_id === section.id)
    const tasks = cards
      .filter(bc => isGridSlot(bc.slot) && taskById.has(bc.task_id))
      .map(bc => ({ ...taskById.get(bc.task_id)!, sort_order: bc.slot, in_grid: true, placement_id: bc.id }) as Placed)
      .sort((a, b) => a.sort_order - b.sort_order)
    const teams = data.teams.filter(t => t.section_id === section.id)
    const scores = scoreTeams({ teams, scans: data.scans, boardTasks: tasks, duels: data.duels, board: section })
      .sort((a, b) => compareTeamScores(a, b, { includeBonus: false }))
    const views = scores.map(s => buildTeamView(s, tasks, data.scans, section))
    const prizes = cards
      .filter(bc => bc.slot >= PRIZE_SLOT_MIN && taskById.has(bc.task_id))
      .map(bc => ({ id: bc.id, title: taskById.get(bc.task_id)!.title, claim: data.claims.find(c => c.board_card_id === bc.id) ?? null }))
    return { tasks, views, prizes }
  }, [section, data.tasks, data.boardCards, data.teams, data.scans, data.duels, data.claims])
}

function ScoreBoard({ section, data, now, pending }: { section: BingoSection; data: ProgressData; now: number; pending?: Map<string, Set<string>> }) {
  const { tasks, views } = useBoard(section, data)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const isAdmin = useIsAdmin()
  const [adjust, setAdjust] = useState<{ team: BingoTeam; card: Placed } | null>(null)
  const gameOver = !!section.timer_end_at && Date.parse(section.timer_end_at) <= now
  const lastActive = useMemo(() => {
    const m = new Map<string, number>()
    const bump = (team: string, iso: string | null | undefined) => {
      const ts = iso ? Date.parse(iso) : NaN
      if (Number.isFinite(ts) && ts > (m.get(team) ?? 0)) m.set(team, ts)
    }
    for (const sc of data.scans) { bump(sc.team_id, sc.scanned_at); bump(sc.team_id, sc.timer_started_at); bump(sc.team_id, sc.completed_at) }
    for (const pd of data.pending) bump(pd.team_id, pd.created_at)
    for (const c of data.claims) bump(c.team_id, c.claimed_at)
    return m
  }, [data.scans, data.pending, data.claims])
  const toggle = (id: string) => setOpenIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div className="rounded-2xl bg-gray-900/80 border border-white/10 overflow-hidden px-1 sm:px-3 py-2">
      {views.length === 0 ? <p className="text-gray-500 text-sm px-1">No teams yet.</p> : (
        <>
          <p className="text-[11px] text-gray-500 font-bold px-2 pb-1">Tap a group to see its board</p>
          {views.map((v, i) => (
            <TeamRow key={v.score.team.id} rank={i + 1} view={v} section={section} data={data} now={now}
              open={openIds.has(v.score.team.id)} onToggle={() => toggle(v.score.team.id)} taskCount={tasks.length} pendingTasks={pending?.get(v.score.team.id)}
              lastActiveAt={lastActive.get(v.score.team.id) ?? null} gameOver={gameOver}
              onPick={isAdmin ? card => setAdjust({ team: v.score.team, card }) : undefined} />
          ))}
        </>
      )}
      {adjust && <CardAdjust team={adjust.team} section={section} card={adjust.card} scans={data.scans} onClose={() => setAdjust(null)} />}
    </div>
  )
}

function Overview({ section, data, part }: { section: BingoSection; data: ProgressData; part: 'stations' | 'prizes' }) {
  const { tasks, views, prizes } = useBoard(section, data)
  const stationTasks = tasks.some(t => t.is_station) ? tasks.filter(t => t.is_station) : tasks
  return (
    <>
      <div className="flex flex-col gap-3">
        {part === 'stations' && (<div className="rounded-2xl bg-gray-900/80 border border-white/10 px-3 sm:px-4 py-2">
          {stationTasks.length === 0 ? <p className="text-gray-500 text-sm">No cards on this board yet.</p> : stationTasks.map(t => {
            const done: BingoTeam[] = [], doing: BingoTeam[] = []
            for (const v of views) {
              const c = v.cells.find(x => x?.task.placement_id === t.placement_id)
              if (c?.state === 'done') done.push(v.score.team); else if (c?.state === 'doing') doing.push(v.score.team)
            }
            const pct = views.length ? (done.length / views.length) * 100 : 0
            return (
              <div key={t.placement_id} className="py-2.5 border-t border-white/5 first:border-t-0">
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: t.hex_code }} />
                  <span className="text-white font-bold flex-1 min-w-0 truncate">{t.title}{t.is_station && <span className="ml-2 text-[10px] text-teal-300 uppercase tracking-wider">station</span>}</span>
                  <span className="w-16 sm:w-28 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0"><span className="block h-full bg-green-400" style={{ width: `${pct}%` }} /></span>
                  <span className="text-xs text-gray-400 font-bold w-10 text-right shrink-0">{done.length}/{views.length}</span>
                </div>
                {(done.length > 0 || doing.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 pl-6">
                    {done.map(tm => <span key={tm.id} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-400/15 text-green-300">✓ {tm.name}</span>)}
                    {doing.map(tm => <span key={tm.id} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 prog-pulse">⏱ {tm.name}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>)}

        {part === 'prizes' && (
          <div className="rounded-2xl bg-gray-900/80 border border-white/10 px-3 sm:px-4 py-2">
            {prizes.length === 0 && <p className="text-gray-500 text-sm py-2">There are no prize cards on this board.</p>}
            {prizes.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 border-t border-white/5 first:border-t-0 text-sm">
                <span className="text-white font-bold truncate min-w-0">🎁 {p.title}</span>
                {p.claim
                  ? <span className="text-green-300 font-bold text-right shrink-0">{p.claim.team_name} · {new Date(p.claim.claimed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  : <span className="text-gray-500 font-bold shrink-0">Unclaimed</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── page ────────────────────────────────────────────────────────────────────

// The board's own countdown, drawn like the projector's: MIN and SEC ticket tiles.
function EventClock({ section, now }: { section: BingoSection; now: number }) {
  const end = section.timer_end_at ? Date.parse(section.timer_end_at) : null
  let secs: number, running = false, note: string | null = null
  if (end !== null) { secs = (end - now) / 1000; running = secs > 0; if (!running) note = "Time's up" }
  else if (section.timer_seconds > 0) {
    secs = section.timer_seconds
    note = (section.timer_duration_seconds ?? 0) > secs ? 'Paused' : 'Not started'
  } else return null
  const total = Math.max(0, Math.round(secs))
  const parts: [string, string][] = [['MIN', String(Math.floor(total / 60)).padStart(2, '0')], ['SEC', String(total % 60).padStart(2, '0')]]
  const urgent = running && total <= 300
  const tile = `relative flex flex-col items-center rounded-lg border border-white/10 px-2.5 pt-0.5 pb-0.5 ${urgent ? 'bg-red-500/20 text-red-300' : running ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-400'}`
  const notch = 'absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gray-950'
  return (
    <div className="flex flex-col items-end gap-0.5" aria-label={`Time left ${parts[0][1]}:${parts[1][1]}`}>
      <div className="flex items-center gap-1.5">
        {parts.map(([label, v]) => (
          <div key={label} className={tile}>
            <span className={`${notch} -left-1`} /><span className={`${notch} -right-1`} />
            <span className="text-xl sm:text-2xl font-black tabular-nums leading-none">{v}</span>
            <span className={`text-[8px] font-bold tracking-[0.25em] ${running ? 'text-green-400' : 'text-gray-500'}`}>
              {label === 'SEC' ? (running ? '● ' : '■ ') : ''}{label}
            </span>
          </div>
        ))}
      </div>
      {note && <span className={`text-[10px] font-black uppercase tracking-widest ${running ? '' : note === "Time's up" ? 'text-red-300' : 'text-gray-400'}`}>{note}</span>}
    </div>
  )
}

function Section({ id, icon, title, hint, open, onToggle, children }: { id: string; icon: string; title: string; hint?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 pt-6 first:pt-1">
      <button onClick={onToggle} aria-expanded={open}
        className={`w-full min-h-[44px] flex items-end justify-between gap-3 border-b-2 border-amber-400/70 pb-2 text-left ${open ? 'mb-3' : ''}`}>
        <span className="min-w-0">
          <span className="block font-black text-white tracking-tight leading-tight" style={{ fontSize: 'clamp(1.2rem, 3.5vw, 1.75rem)' }}>
            <span className="mr-2">{icon}</span>{title}
          </span>
          {hint && <span className="block text-xs sm:text-sm text-gray-400 font-medium mt-0.5">{hint}</span>}
        </span>
        <span className={`text-xl text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && children}
    </section>
  )
}

const JUMPS: { id: string; icon: string; label: string }[] = [
  { id: 'scoreboard', icon: '🏆', label: 'Scoreboard' },
  { id: 'map',        icon: '📍', label: 'Live map' },
  { id: 'feed',       icon: '📡', label: 'Live feed' },
  { id: 'stations',   icon: '📍', label: 'Stations' },
  { id: 'prizes',     icon: '🎁', label: 'Prizes' },
]

export function BingoDashProgress() {
  const { sectionId = '' } = useParams<{ sectionId?: string }>()
  const data = useProgressData(sectionId)
  const section = data.sections[0] ?? null
  const isAdmin = useIsAdmin()
  const locs = useLiveLocations(sectionId, !!section?.gps_enabled)
  const [now, setNow] = useState(() => Date.now())
  // Only the scoreboard is open to start with; the rest open on tap.
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ scoreboard: true })
  const toggleSec = (id: string) => setOpenSec(o => ({ ...o, [id]: !o[id] }))
  const jumpTo = (id: string) => {
    setOpenSec(o => ({ ...o, [id]: true }))
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const teamIds = useMemo(() => new Set(data.teams.filter(t => data.sections.some(s => s.id === t.section_id)).map(t => t.id)), [data.teams, data.sections])

  // Which cards each team has submitted that are not approved yet. Shown to
  // everyone; approving is done on the admin side.
  const pendingByTeam = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const p of data.pending) {
      if (!teamIds.has(p.team_id)) continue
      const s = m.get(p.team_id) ?? new Set<string>()
      s.add(p.task_id); m.set(p.team_id, s)
    }
    return m
  }, [data.pending, teamIds])

  const feed = useMemo(() => {
    const ev: { at: number; text: string }[] = []
    for (const s of data.scans) {
      if (!teamIds.has(s.team_id)) continue
      const who = data.teams.find(t => t.id === s.team_id)?.name ?? 'A team'
      const what = data.tasks.find(t => t.id === s.task_id)?.title ?? 'a card'
      if (s.completed && s.completed_at) {
        const ms = scanElapsedMs(s, null)
        ev.push({ at: Date.parse(s.completed_at), text: `${who} finished ${what}${ms !== null ? ` in ${fmtElapsed(ms)}` : ''}` })
      } else if (s.scanned_at) {
        ev.push({ at: Date.parse(s.scanned_at), text: `${who} started ${what}` })
      }
    }
    const placed = new Map(data.boardCards.map(bc => [bc.id, bc.task_id]))
    for (const c of data.claims) {
      const taskId = placed.get(c.board_card_id)
      if (!taskId) continue
      const what = data.tasks.find(x => x.id === taskId)?.title ?? 'a prize'
      ev.push({ at: Date.parse(c.claimed_at), text: `🎁 ${c.team_name} claimed the prize ${what}` })
    }
    return ev.sort((a, b) => b.at - a.at).slice(0, 15)
  }, [data.scans, data.teams, data.tasks, data.boardCards, data.claims, teamIds])

  // Share: the phone's share sheet where there is one, otherwise copy the link.
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    const title = section ? `${section.name} – live progress` : 'Live progress'
    if (navigator.share) {
      try { await navigator.share({ title, url }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copy this link', url); return }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const ago = (ms: number) => {
    const s = Math.max(0, Math.floor((now - ms) / 1000))
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`
  }

  return (
    <div className="min-h-[100dvh] bg-gray-950 relative overflow-x-clip">
      <style>{`
        @keyframes prog-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,.9); } 50% { box-shadow: 0 0 0 4px rgba(251,191,36,.25); } }
        .prog-pulse { animation: prog-pulse 1.4s ease-in-out infinite; outline: 2px solid #fbbf24; outline-offset: -1px; }
      `}</style>
      <ParticleBackground />

      {/* Header: board name + live badge, then a jump bar (sticky) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-gray-950/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 pt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {isAdmin && <Link to="/bingo-dash/admin" className="inline-flex items-center min-h-[44px] -mb-2 text-xs font-black text-gray-300 hover:text-white">← Back to admin</Link>}
            <p className="text-purple-400 text-[11px] font-bold uppercase tracking-widest">Live progress</p>
            <h1 className="font-black text-white tracking-tight leading-tight truncate" style={{ fontSize: 'clamp(1.4rem, 4vw, 2.25rem)' }}>{section ? section.name : 'Live progress'}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
          <button onClick={share} aria-label="Share this page" title={copied ? 'Link copied' : 'Share this page'}
            className="relative w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all">
            {copied ? <span className="text-green-400 font-black">✓</span> : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
            )}
            {copied && <span className="absolute top-full mt-1 right-0 text-[10px] font-black text-green-400 whitespace-nowrap">Link copied</span>}
          </button>
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-2 text-[11px] font-black text-green-400 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Live
            </span>
            {section && <EventClock section={section} now={now} />}
          </div>
          </div>
        </div>
        {section && (
          <nav className="max-w-5xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto" aria-label="Jump to a section">
            {JUMPS.filter(j => j.id !== 'map' || section.gps_enabled).map(j => (
              <a key={j.id} href={`#${j.id}`}
                onClick={e => { e.preventDefault(); jumpTo(j.id) }}
                className="min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-black whitespace-nowrap shrink-0">
                <span>{j.icon}</span>{j.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        {!data.loaded ? (
          <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
        ) : !section ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-white font-black text-lg">Board not found</p>
            <p className="text-gray-500 text-sm mt-1">This link may be wrong or the event was removed.</p>
          </div>
        ) : (
          <>
            <Section id="scoreboard" icon="🏆" title="Scoreboard" hint="Tap a group to open its board: stopped times and points for every card." open={!!openSec.scoreboard} onToggle={() => toggleSec('scoreboard')}>
              <ScoreBoard section={section} data={data} now={now} pending={pendingByTeam} />
            </Section>

            {section.gps_enabled && (
              <Section id="map" icon="📍" title="Live map" hint="Where each player and observer is right now. Tap a dot to follow." open={!!openSec.map} onToggle={() => toggleSec('map')}>
                <LiveMap locs={locs} teams={data.teams} isAdmin={isAdmin} className="h-[60dvh] min-h-[320px] rounded-2xl border border-white/10" />
              </Section>
            )}

            <Section id="feed" icon="📡" title="Live feed" hint="The latest cards started and finished, and prizes claimed." open={!!openSec.feed} onToggle={() => toggleSec('feed')}>
              <div className="rounded-2xl bg-gray-900/80 border border-white/10 px-3 sm:px-4 py-2">
                {feed.length === 0 ? <p className="text-gray-500 text-sm py-2">Nothing yet.</p> : feed.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-t border-white/5 first:border-t-0 text-sm">
                    <span className="text-white font-medium min-w-0 truncate">{e.text}</span>
                    <span className="text-gray-500 text-xs font-bold shrink-0">{ago(e.at)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="stations" icon="📍" title="Station progress" hint="How many groups have finished each card, and which ones." open={!!openSec.stations} onToggle={() => toggleSec('stations')}>
              <Overview section={section} data={data} part="stations" />
            </Section>

            <Section id="prizes" icon="🎁" title="Prize claims" hint="Who has claimed each prize." open={!!openSec.prizes} onToggle={() => toggleSec('prizes')}>
              <Overview section={section} data={data} part="prizes" />
            </Section>

          </>
        )}
        <p className="text-[11px] text-gray-600 text-center mt-8">This page updates live.</p>
      </main>
    </div>
  )
}
