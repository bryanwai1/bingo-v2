import { useCallback, useEffect, useState, useLayoutEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ParticleBackground } from '../components/ParticleBackground'
import { FitBoard } from '../components/FitBoard'
import { useFullscreen } from '../hooks/useFullscreen'
import { getScoreboardTheme } from '../lib/scoreboardThemes'
import { scoreTeams, compareTeamScores, formatScore, type TeamScore, type BoardTask } from '../lib/teamScore'
import type { BingoTask, BingoTeam, BingoScan, BingoSettings, BingoSection, BingoBoardCard, BingoDuel } from '../types/database'

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Fit-to-screen ──────────────────────────────────────────────────────────
//
// The board used to grow past the bottom of the screen, putting the lowest
// ranks below the fold where a room watching a projector can never see them.
// Rather than a second set of responsive font sizes to keep in step with the
// first, the existing rows are authored at a fixed width and the whole board
// is scaled to the space available.

/**
 * A column is authored within a RANGE, not at one fixed width.
 *
 * The board is scaled, so "wider canvas" and "smaller text" are the same
 * thing: rendered width = canvas width x scale. Pinning the rendered width to
 * the screen and solving for the canvas therefore turns spare horizontal space
 * directly into type size, and makes sideways scrolling impossible.
 *
 * COL_MIN is where the row runs out of room. The stat columns are sized from
 * measured text, not guessed:
 *   - points 200: "12,883.0" is 198px at 48px/900, and the bonus breakdown
 *     line under it is 219px - this column has NO slack and must not shrink.
 *   - lines 130: "12" plus the smaller "/12" is ~92px, header 91px.
 *   - tasks 130: three digits 81px, "COMPLETED" 81px.
 * That leaves 652px spoken for (540 fixed + 64 gaps + 48 padding), so 900
 * still gives the team name ~248px. COL_MAX is where extra width stops buying
 * anything and just reopens the gap between the name and the points, since
 * 1fr swallows all of it.
 */
const COL_MIN = 900
const COL_MAX = 1150
const COL_GAP = 40
/**
 * Two columns once one would squeeze the text, and only where there is room.
 *
 * Keyed on row COUNT, never on the resulting scale - choosing columns by scale
 * would feed back into the scale that chose them.
 *
 * The number is measured, not guessed. Two columns halve the rows but double
 * the width each one needs, and the width cap is the binding one: at 1080p two
 * columns top out at 1840/2040 = 0.90 while one column is bound by height (row
 * pitch 124px). One column wins until eight rows, where 0.90 beats 0.72.
 * Ceiling: on shorter viewports the crossover arrives a row earlier; not worth
 * predicting both layouts to chase.
 */
const TWO_COL_FROM = 8
const TWO_COL_MIN_WIDTH = 1024

/**
 * In-page zoom, which scales only the board - the browser's own zoom would
 * resize the whole Chrome UI with it.
 *
 * 100% is the auto-fit: the largest the board can be with every group on one
 * screen and nothing overlapping. It is a genuine ceiling, not a chosen
 * number - past it the row would have to be wider than the screen - so zoom
 * runs downwards from it rather than up.
 */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1
const ZOOM_STEP = 0.1
const ZOOM_KEY = 'bingo-projector-zoom'

function loadZoom(): number {
  // Private mode and blocked site data both throw here; a projector that
  // refuses to render because it cannot read a preference would be worse than
  // one that forgets it.
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    if (Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  } catch { /* fall through to the default */ }
  return 1
}
// The projector's row IS the shared score — see src/lib/teamScore.ts. It used
// to compute its own, and the award ceremony computed a second, subtly
// different one.
type Row = TeamScore

export function BingoDashProjector() {
  // Optional /bingo-dash/projector/:sectionSlug — pins the projector to one
  // board (used by sub-account admins). Without it, falls back to the global
  // active board (the owner's front door).
  const { sectionSlug } = useParams<{ sectionSlug?: string }>()
  const [tasks, setTasks] = useState<BingoTask[]>([])
  const [boardCards, setBoardCards] = useState<BingoBoardCard[]>([])
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [settings, setSettings] = useState<BingoSettings | null>(null)
  const [sections, setSections] = useState<BingoSection[]>([])
  const [duels, setDuels] = useState<BingoDuel[]>([])
  const [timerDisplay, setTimerDisplay] = useState('00:00')
  const [timerRunning, setTimerRunning] = useState(false)
  const [showBonus, setShowBonus] = useState(false)
  // Only used to decide whether to scale at all, and how many columns - the
  // fit factor itself is measured inside FitBoard.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [zoom, setZoom] = useState(loadZoom)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

  const setZoomPersisted = useCallback((next: number) => {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 10) / 10))
    setZoom(v)
    try { localStorage.setItem(ZOOM_KEY, String(v)) } catch { /* best-effort */ }
  }, [])
  // Live-status readout, so "is it updating?" can be answered from across
  // the room: realtime channel state and when data was last fetched.
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [lastSync, setLastSync] = useState<number>(0)
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(id) }, [])

  // Initial load — also the periodic safety refresh (below): a projector runs
  // for hours on venue Wi-Fi, and a dropped realtime socket otherwise leaves
  // it frozen on old scores with nobody noticing until a team complains.
  const loadAll = useCallback(async () => {
      const [tasksRes, boardCardsRes, teamsRes, scansRes, sectionsRes, settingsRes, duelsRes] = await Promise.all([
        supabase.from('bingo_tasks').select('*'),
        supabase.from('bingo_board_cards').select('*').order('slot'),
        supabase.from('bingo_teams').select('*').order('created_at'),
        supabase.from('bingo_scans').select('*'),
        supabase.from('bingo_sections').select('*').order('sort_order'),
        supabase.from('bingo_settings').select('*').eq('id', 'main').maybeSingle(),
        supabase.from('bingo_duels').select('*').eq('status', 'done'),
      ])
      if (tasksRes.data) setTasks(tasksRes.data)
      if (boardCardsRes.data) setBoardCards(boardCardsRes.data)
      if (teamsRes.data) setTeams(teamsRes.data)
      if (scansRes.data) setScans(scansRes.data)
      if (sectionsRes.data) setSections(sectionsRes.data)
      if (settingsRes.data) setSettings(settingsRes.data)
      if (duelsRes.data) setDuels(duelsRes.data)
      setLastSync(Date.now())
  }, [])
  useEffect(() => { void loadAll() }, [loadAll])

  // Safety net: full refresh every 20s, and immediately when the tab comes
  // back (screen wake, tab switch) or the network returns.
  useEffect(() => {
    const id = setInterval(() => { void loadAll() }, 20_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void loadAll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [loadAll])

  // Live updates
  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    const nudge = (what: string) => {
      if (timers[what]) clearTimeout(timers[what])
      timers[what] = setTimeout(async () => {
        if (what === 'scans')    { const { data } = await supabase.from('bingo_scans').select('*'); if (data) setScans(data) }  // team-scoped filtering happens below at render
        if (what === 'teams')    { const { data } = await supabase.from('bingo_teams').select('*').order('created_at'); if (data) setTeams(data) }
        if (what === 'tasks')    { const { data } = await supabase.from('bingo_tasks').select('*'); if (data) setTasks(data) }
        if (what === 'cards')    { const { data } = await supabase.from('bingo_board_cards').select('*').order('slot'); if (data) setBoardCards(data) }
        if (what === 'settings') { const { data } = await supabase.from('bingo_settings').select('*').eq('id','main').maybeSingle(); if (data) setSettings(data) }
        if (what === 'sections') { const { data } = await supabase.from('bingo_sections').select('*').order('sort_order'); if (data) setSections(data) }
        if (what === 'duels')    { const { data } = await supabase.from('bingo_duels').select('*').eq('status', 'done'); if (data) setDuels(data) }
      }, 400)
    }
    const channel = supabase
      .channel('bingo-projector')
      // Scale note: each handler used to select('*') the whole table on every
      // change. Debounced so a burst of scans triggers one refresh, not one
      // per event.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_scans' }, () => nudge('scans'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_teams' }, () => nudge('teams'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_tasks' }, () => nudge('tasks'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_board_cards' }, () => nudge('cards'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_settings' }, () => nudge('settings'))
      // The board's own timer and live/locked state live on the section row.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_sections' }, () => nudge('sections'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_duels' }, () => nudge('duels'))
      .subscribe((status) => {
        // A re-subscribe after a drop means events were missed: catch up.
        if (status === 'SUBSCRIBED') { setLiveState('live'); void loadAll() }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveState('offline')
      })
    return () => { supabase.removeChannel(channel) }
  }, [loadAll])

  const slugSection = sectionSlug ? sections.find(s => s.slug === sectionSlug) ?? null : null
  const activeSectionId = slugSection?.id ?? (sectionSlug ? null : settings?.active_section_id ?? null)
  const activeSection = slugSection ?? sections.find(s => s.id === activeSectionId) ?? null

  // Timer tick — driven by the active board's own timer
  useEffect(() => {
    const id = setInterval(() => {
      if (!activeSection) { setTimerDisplay('00:00'); setTimerRunning(false); return }
      if (activeSection.timer_end_at) {
        const remaining = (new Date(activeSection.timer_end_at).getTime() - Date.now()) / 1000
        setTimerDisplay(formatTime(remaining))
        setTimerRunning(remaining > 0)
      } else {
        setTimerDisplay(formatTime(activeSection.timer_seconds))
        setTimerRunning(false)
      }
    }, 250)
    return () => clearInterval(id)
  }, [activeSection])

  const sectionTeams = activeSectionId ? teams.filter(t => t.section_id === activeSectionId) : teams
  // Grid membership lives in bingo_board_cards (cards are shared across boards).
  // placement_id (= bc.id) is what lets the same card placed in several boxes
  // on one board be scored and bingo-line-detected per box instead of once
  // for the whole card — see supabase/scan-completion/20260910_scan_board_card_id.sql.
  const gridTasks = (activeSectionId ? boardCards.filter(bc => bc.section_id === activeSectionId) : boardCards)
    .filter(bc => tasks.some(x => x.id === bc.task_id))
    .map(bc => ({ ...tasks.find(x => x.id === bc.task_id)!, sort_order: bc.slot, in_grid: true, placement_id: bc.id }))
    .sort((a, b) => a.sort_order - b.sort_order)
  // Scoring lives in src/lib/teamScore.ts so the projector and the award
  // ceremony can never disagree about who won.
  const rows: Row[] = scoreTeams({
    teams: sectionTeams,
    scans,
    boardTasks: gridTasks as BoardTask[],
    duels,
    board: activeSection,
  })

  // "Total after Bonus" is a DISPLAY choice — the score itself always carries
  // the manual bonus. Both the figure shown and the ordering follow the toggle.
  const scoreOf = (r: Row) => (showBonus ? r.total : r.basePoints)
  const fmt = (v: unknown) => formatScore(v)
  rows.sort((a, b) => compareTeamScores(a, b, { includeBonus: showBonus }))

  // Per-board skin. A hotel room with windows needs 'daylight' or the
  // projected scoreboard is unreadable; a dim AV suite wants 'midnight'.
  const theme = getScoreboardTheme(activeSection?.scoreboard_theme)


  // Rank-change motion.
  //
  // Re-sorting a mapped array does not animate — React repaints each row's
  // contents where it already sits, so an overtake happens silently. That is
  // the one moment a scoreboard on a wall exists for.
  //
  // FLIP: remember each row's position, let the re-sort happen, then transform
  // every row back to where it was and release it. The browser animates the
  // release. useLayoutEffect runs before paint, so the room never sees the
  // intermediate state.
  //
  // Positions are read with offsetTop, NOT getBoundingClientRect: the board
  // sits inside a scaled box, and screen coordinates shift whenever that scale
  // changes (resize, zoom, fullscreen). The effect would read that as every
  // team changing rank at once and fling the rows off-screen - and because the
  // next measurement starts from where it flung them, each pass amplified the
  // last. offsetTop is layout-relative and an ancestor's transform cannot
  // affect it, so a shift here always means a real rank change.
  const rowEls = useRef(new Map<string, HTMLDivElement>())
  const lastTop = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = new Map<string, number>()
    rowEls.current.forEach((el, id) => { if (el) now.set(id, el.offsetTop) })

    if (!reduced) {
      now.forEach((top, id) => {
        const was = lastTop.current.get(id)
        const el = rowEls.current.get(id)
        if (was === undefined || !el) return
        const shift = was - top
        if (Math.abs(shift) < 2) return

        el.style.transition = 'none'
        el.style.transform = `translateY(${shift}px)`
        el.style.zIndex = '20'
        requestAnimationFrame(() => {
          el.style.transition = 'transform .85s cubic-bezier(.22,1,.36,1)'
          el.style.transform = ''
          window.setTimeout(() => {
            el.style.transition = ''
            el.style.zIndex = ''
          }, 900)
        })
      })
    }
    lastTop.current = now
  }, [rows])

  // Scaling only makes sense where a full-width column can actually fit.
  const fitEnabled = viewportWidth >= TWO_COL_MIN_WIDTH

  // Every group is on screen at once - that is the point of the board, so the
  // layout never pages or scrolls. Two even columns once a single one would
  // squeeze the text; ranks stay in reading order down the left, then right.
  const ranked = rows.map((row, i) => ({ row, rank: i + 1 }))
  const columns = fitEnabled && ranked.length >= TWO_COL_FROM
    ? [ranked.slice(0, Math.ceil(ranked.length / 2)), ranked.slice(Math.ceil(ranked.length / 2))]
    : [ranked]

  const cols = columns.length
  const canvasMin = cols * COL_MIN + (cols - 1) * COL_GAP
  const canvasMax = cols * COL_MAX + (cols - 1) * COL_GAP

  const board = (
    <div className="flex items-start justify-center w-full" style={{ gap: COL_GAP }}>
      {columns.map((chunk, ci) => (
        <div
          key={ci}
          className="flex flex-col gap-2.5 lg:gap-3 min-w-0"
          // The columns divide whatever canvas width FitBoard solved for,
          // rather than carrying a fixed width of their own.
          style={{ flex: 1, minWidth: 0 }}
        >
              {/* Column headers — the 5-column table only exists from lg up;
                  on phones each row carries its own inline labels instead. */}
              <div className={`hidden lg:grid grid-cols-[80px_1fr_200px_130px_130px] gap-4 px-6 py-2 text-xs font-black uppercase tracking-widest ${theme.muted}`}>
                <div>Rank</div>
                <div>Team</div>
                <div className="text-center">{showBonus ? 'Total (Bingo + Bonus)' : 'Points'}</div>
                <div className="text-center">Bingo Lines</div>
                <div className="text-center">Tasks Done</div>
              </div>

              {chunk.map(({ row, rank }) => {
                const isTop3 = rank <= 3
                const rankColor = isTop3 ? theme.rankColors[rank - 1] : theme.rankMuted
                return (
                  <div
                    key={row.team.id}
                    ref={el => {
                      if (el) rowEls.current.set(row.team.id, el)
                      else rowEls.current.delete(row.team.id)
                    }}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2.5 gap-y-3 items-center px-3 py-3.5 rounded-2xl lg:grid-cols-[80px_1fr_200px_130px_130px] lg:gap-4 lg:px-6 lg:py-5"
                    style={{
                      background: isTop3
                        ? `linear-gradient(90deg, ${rankColor}22 0%, rgba(255,255,255,0.03) 100%)`
                        : 'rgba(255,255,255,0.04)',
                      border: isTop3 ? `1px solid ${rankColor}55` : '1px solid rgba(255,255,255,0.05)',
                      boxShadow: isTop3 ? `0 0 30px ${rankColor}22` : 'none',
                    }}
                  >
                    <div
                      className="text-2xl lg:text-4xl font-black tabular-nums"
                      style={{ color: rankColor }}
                    >
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                    </div>
                    <div className="min-w-0">
                      <p className={`${theme.heading} text-lg sm:text-2xl lg:text-3xl font-black tracking-tight break-words`}>{row.team.name}</p>
                    </div>
                    {/* On phones the three stats sit on their own row under the
                        team name; `lg:contents` drops this wrapper so they become
                        real table columns again on a projector. */}
                    <div className="col-span-2 grid grid-cols-3 gap-1.5 lg:contents">
                    <div className="text-center min-w-0">
                      <p className={`${theme.heading} text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums`}>
                        {fmt(scoreOf(row))}
                      </p>
                      {showBonus ? (
                        <p className={`${theme.muted} text-[9px] lg:text-xs font-bold uppercase tracking-wider lg:tracking-widest mt-1`}>
                          <span className={theme.accent}>{fmt(row.basePoints)} bingo</span>
                          <span className={theme.muted}> + </span>
                          <span className={theme.bonus}>{fmt(row.bonusPoints)} bonus</span>
                        </p>
                      ) : (
                        // No breakdown under the score: the lines column next
                        // to it already says how many landed, and duel
                        // winnings are rolled into the total silently.
                        <p className={`${theme.muted} text-[9px] lg:text-xs font-bold uppercase tracking-wider lg:tracking-widest mt-1`}>pts</p>
                      )}
                    </div>
                    <div className="text-center min-w-0">
                      <p className={`${theme.lines} text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums`}>
                        {row.bingos}<span className={`text-lg lg:text-2xl ${theme.muted}`}>/12</span>
                      </p>
                      <p className={`${theme.muted} text-[9px] lg:text-xs font-bold uppercase tracking-wider lg:tracking-widest mt-1`}>lines</p>
                    </div>
                    <div className="text-center min-w-0">
                      <p className={`${theme.positive} text-3xl sm:text-4xl lg:text-5xl font-black tabular-nums`}>
                        {row.tasksDone}
                      </p>
                      <p className={`${theme.muted} text-[9px] lg:text-xs font-bold uppercase tracking-wider lg:tracking-widest mt-1`}>completed</p>
                    </div>
                    </div>
                  </div>
                )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <div className={`h-screen flex flex-col relative overflow-hidden ${theme.bg}`}>
      {theme.ambient && <ParticleBackground />}

      {/* Header */}
      {/* Deliberately compact: every pixel here is one the scoreboard does not
          get, and on a projector the board is the point - the title is read
          once. */}
      <header className="relative z-10 px-3 pt-3 pb-2 sm:px-6 sm:pt-4 lg:px-10 lg:pt-4 lg:pb-3">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className={`text-[10px] sm:text-sm font-black uppercase tracking-[0.3em] ${theme.accent}`}>Bingo Dash</p>
            <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight ${theme.heading}`}>Scoreboard</h1>
            {activeSection && (
              <p className={`text-sm sm:text-base font-bold truncate ${theme.muted}`}>{activeSection.name}</p>
            )}
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end sm:gap-1.5 flex-shrink-0">
            {activeSection && (activeSection.timer_end_at || activeSection.timer_seconds > 0) && (
              <div
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-black text-xl sm:text-3xl tabular-nums transition-colors ${
                  timerRunning ? `bg-white/10 ${theme.heading}` : `bg-white/5 ${theme.muted}`
                }`}
              >
                <span className={`mr-2 sm:mr-3 text-base sm:text-2xl ${timerRunning ? theme.positive : theme.muted}`}>
                  {timerRunning ? '●' : '■'}
                </span>
                {timerDisplay}
              </div>
            )}
            <p className={`${theme.muted} text-xs sm:text-sm font-bold`}>{sectionTeams.length} teams competing</p>
            <p className={`${theme.muted} text-[11px] sm:text-xs font-bold flex items-center gap-1.5`} title="Realtime connection and last data refresh">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${liveState === 'live' ? 'bg-green-400 animate-pulse' : liveState === 'offline' ? 'bg-red-400' : 'bg-amber-400'}`} />
              {liveState === 'live' ? 'Live' : liveState === 'offline' ? 'Reconnecting' : 'Connecting'}
              {lastSync > 0 && <span className="opacity-60">· synced {Math.max(0, Math.round((nowTick - lastSync) / 1000))}s ago</span>}
            </p>
            <button
              onClick={() => setShowBonus(v => !v)}
              className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all ${
                showBonus
                  ? 'bg-amber-400 text-gray-950 shadow-lg shadow-amber-500/30'
                  : 'bg-white/10 text-amber-300 border border-amber-700/50 hover:bg-white/15'
              }`}
            >
              {showBonus ? '✓ Total after Bonus' : '＋ Total after Bonus'}
            </button>

            {/* In-page zoom: scales the board only, never the browser UI.
                Hidden where the board is not scaled at all (narrow screens
                keep the phone layout), so the buttons are never inert. */}
            <div className="flex items-center gap-1.5">
              {fitEnabled && <>
              <button
                onClick={() => setZoomPersisted(zoom - ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN}
                className={`w-9 h-9 rounded-xl font-black text-lg bg-white/10 ${theme.heading} border border-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10`}
                title="Zoom out"
              >−</button>
              <button
                onClick={() => setZoomPersisted(1)}
                className={`px-2 min-w-[4rem] h-9 rounded-xl text-xs font-black tabular-nums bg-white/10 ${theme.heading} border border-white/10 hover:bg-white/20`}
                title="Back to the largest size that fits every group"
              >{Math.round(zoom * 100)}%</button>
              <button
                onClick={() => setZoomPersisted(zoom + ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX}
                className={`w-9 h-9 rounded-xl font-black text-lg bg-white/10 ${theme.heading} border border-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10`}
                title="Zoom in (100% already fills the screen)"
              >+</button>
              </>}
              <button
                onClick={toggleFullscreen}
                className={`w-9 h-9 rounded-xl text-base bg-white/10 ${theme.heading} border border-white/10 hover:bg-white/20`}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >⛶</button>
            </div>
          </div>
        </div>
      </header>

      {/* Scoreboard */}
      <main className="relative z-10 px-3 pb-4 sm:px-6 lg:px-10 flex-1 min-h-0 flex flex-col">
        {rows.length === 0 ? (
          <div className={`text-center py-20 lg:py-32 ${theme.muted}`}>
            <div className="text-5xl lg:text-6xl mb-4">🎯</div>
            <p className="text-xl lg:text-2xl font-bold">No teams registered yet</p>
          </div>
        ) : fitEnabled ? (
          <FitBoard canvasMin={canvasMin} canvasMax={canvasMax} zoom={zoom}>
            {board}
          </FitBoard>
        ) : (
          // Too narrow to scale a 1600px board onto: keep the phone
          // layout and let it scroll, as it always has.
          <div className="max-w-[1600px] mx-auto w-full overflow-auto">{board}</div>
        )}
      </main>

      {/* Sits under the scoreboard on the projected screen — visible to the
          whole room for the length of the event without competing with the
          scores above it. */}
      <footer className="pb-6 pt-2 text-center">
        <span className={`text-[10px] uppercase tracking-[0.25em] ${theme.muted}`}>Powered by</span>
        <span className="ml-2 text-sm font-black bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
          Pixels and Purpose Enterprise
        </span>
      </footer>
    </div>
  )
}
