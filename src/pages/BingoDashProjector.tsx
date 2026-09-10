import { useEffect, useState, useLayoutEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ParticleBackground } from '../components/ParticleBackground'
import { getScoreboardTheme } from '../lib/scoreboardThemes'
import { buildBingoSlots, completedBingoLines } from '../lib/bingoLines'
import { duelBonusByTeam } from '../hooks/useBingoDuels'
import type { BingoTask, BingoTeam, BingoScan, BingoSettings, BingoSection, BingoBoardCard, BingoDuel } from '../types/database'

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

type Row = {
  team: BingoTeam
  /** Tile points + contest bonuses won in duels — everything earned in play. */
  points: number
  /** Contest bonus alone, so the board can show where a duel win landed. */
  duelBonus: number
  /** Manual bonus the admin adds during the award ceremony. */
  bonus: number
  bingos: number
  tasksDone: number
  /**
   * When this team last scored — the moment they reached their current total.
   * Ties are broken in favour of whoever got there first, so a team that
   * matches the leader later does not leapfrog them. Infinity = never scored.
   */
  reachedAt: number
}

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

  // Initial load
  useEffect(() => {
    const load = async () => {
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
    }
    load()
  }, [])

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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

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
  const slots = buildBingoSlots(gridTasks)
  // completedBingoLines checks slot.id against completedIds; feed it the
  // placement id (falling back to task id for pre-fix rows with none) so
  // line detection is per box, matching completedIds below.
  const lineSlots = slots.map(t => t ? { ...t, id: t.placement_id ?? t.id } : null)



  // Contest bonuses won in duels. A winning DEFENDER has no tile to hang points
  // on, so this is the only place their win shows up.
  const duelBonuses = duelBonusByTeam(duels)

  const rows: Row[] = sectionTeams.map(team => {
    const teamScans = scans.filter(s => s.team_id === team.id)
    const gridTaskIds = new Set(gridTasks.map(t => t.id))
    // A completed scan counts toward the box it was recorded against
    // (board_card_id); scans from before that column existed have none, and
    // still count toward every box sharing their task_id (today's behavior
    // for that legacy data only — see the migration note above).
    const completedPlacementIds = new Set(
      teamScans.filter(s => s.completed && s.board_card_id).map(s => s.board_card_id as string),
    )
    const legacyCompletedTaskIds = new Set(
      teamScans.filter(s => s.completed && !s.board_card_id && gridTaskIds.has(s.task_id)).map(s => s.task_id),
    )
    const completedIds = new Set(
      gridTasks
        .filter(t => (t.placement_id && completedPlacementIds.has(t.placement_id)) || legacyCompletedTaskIds.has(t.id))
        .map(t => t.placement_id ?? t.id),
    )
    const tilePoints = gridTasks.reduce(
      (sum, t) => completedIds.has(t.placement_id ?? t.id) ? sum + (t.points ?? 0) : sum, 0,
    )
    const duelBonus = duelBonuses.get(team.id) ?? 0
    const bingos = completedBingoLines(lineSlots, completedIds).length
    const tasksDone = completedIds.size
    const bonus = team.bonus_points ?? 0
    const lastScan = teamScans.reduce((latest, s) => {
      if (!s.completed || !gridTaskIds.has(s.task_id) || !s.completed_at) return latest
      return Math.max(latest, Date.parse(s.completed_at))
    }, 0)
    // A duel win is a scoring moment too, so it counts for tie-breaking.
    const lastDuel = duels.reduce((latest, d) => {
      if (d.winner_team_id !== team.id || !d.resolved_at) return latest
      return Math.max(latest, Date.parse(d.resolved_at))
    }, 0)
    const reachedAt = Math.max(lastScan, lastDuel)
    return {
      team,
      points: tilePoints + duelBonus,
      duelBonus,
      bonus,
      bingos,
      tasksDone,
      reachedAt: reachedAt || Infinity,
    }
  })

  // When the "Total after Bonus" view is on, rank by Bingo points + manual bonus points.
  const scoreOf = (r: Row) => showBonus ? r.points + r.bonus : r.points
  rows.sort((a, b) => {
    if (scoreOf(b) !== scoreOf(a)) return scoreOf(b) - scoreOf(a)
    if (b.bingos !== a.bingos) return b.bingos - a.bingos
    if (b.tasksDone !== a.tasksDone) return b.tasksDone - a.tasksDone
    // Dead heat on every score component: first to get there stays ahead.
    // Without this the order fell back to the team list, so a team matching
    // the leader later could appear above them.
    return a.reachedAt - b.reachedAt
  })

  // Per-board skin. A hotel room with windows needs 'daylight' or the
  // projected scoreboard is unreadable; a dim AV suite wants 'midnight'.
  const theme = getScoreboardTheme(activeSection?.scoreboard_theme)


  // Rank-change motion.
  //
  // Re-sorting a mapped array does not animate — React repaints each row's
  // contents where it already sits, so an overtake happens silently. That is
  // the one moment a scoreboard on a wall exists for.
  //
  // FLIP: remember each row's screen position, let the re-sort happen, then
  // transform every row back to where it was and release it. The browser
  // animates the release. useLayoutEffect runs before paint, so the room never
  // sees the intermediate state.
  const rowEls = useRef(new Map<string, HTMLDivElement>())
  const lastTop = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = new Map<string, number>()
    rowEls.current.forEach((el, id) => { if (el) now.set(id, el.getBoundingClientRect().top) })

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

  return (
    <div className={`min-h-screen relative overflow-hidden ${theme.bg}`}>
      {theme.ambient && <ParticleBackground />}

      {/* Header */}
      <header className="relative z-10 px-10 pt-10 pb-6">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6">
          <div>
            <p className={`text-sm font-black uppercase tracking-[0.3em] ${theme.accent}`}>Bingo Dash</p>
            <h1 className={`text-6xl font-black tracking-tight mt-1 ${theme.heading}`}>Scoreboard</h1>
            {activeSection && (
              <p className={`text-xl font-bold mt-2 ${theme.muted}`}>{activeSection.name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {activeSection && (activeSection.timer_end_at || activeSection.timer_seconds > 0) && (
              <div
                className={`px-6 py-3 rounded-2xl font-black text-4xl tabular-nums transition-colors ${
                  timerRunning ? `bg-white/10 ${theme.heading}` : `bg-white/5 ${theme.muted}`
                }`}
              >
                <span className={`mr-3 text-2xl ${timerRunning ? theme.positive : theme.muted}`}>
                  {timerRunning ? '●' : '■'}
                </span>
                {timerDisplay}
              </div>
            )}
            <p className={`${theme.muted} text-sm font-bold`}>{sectionTeams.length} teams competing</p>
            <button
              onClick={() => setShowBonus(v => !v)}
              className={`px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
                showBonus
                  ? 'bg-amber-400 text-gray-950 shadow-lg shadow-amber-500/30'
                  : 'bg-white/10 text-amber-300 border border-amber-700/50 hover:bg-white/15'
              }`}
            >
              {showBonus ? '✓ Total after Bonus' : '＋ Total after Bonus'}
            </button>
          </div>
        </div>
      </header>

      {/* Scoreboard */}
      <main className="relative z-10 px-10 pb-10">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex-1 min-w-0">
          {rows.length === 0 ? (
            <div className={`text-center py-32 ${theme.muted}`}>
              <div className="text-6xl mb-4">🎯</div>
              <p className="text-2xl font-bold">No teams registered yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Column headers */}
              <div className={`grid grid-cols-[80px_1fr_200px_200px_200px] gap-4 px-6 py-2 text-xs font-black uppercase tracking-widest ${theme.muted}`}>
                <div>Rank</div>
                <div>Team</div>
                <div className="text-center">{showBonus ? 'Total (Bingo + Bonus)' : 'Points'}</div>
                <div className="text-center">Bingo Lines</div>
                <div className="text-center">Tasks Done</div>
              </div>

              {rows.map((row, i) => {
                const rank = i + 1
                const isTop3 = rank <= 3
                const rankColor = isTop3 ? theme.rankColors[rank - 1] : theme.rankMuted
                return (
                  <div
                    key={row.team.id}
                    ref={el => {
                      if (el) rowEls.current.set(row.team.id, el)
                      else rowEls.current.delete(row.team.id)
                    }}
                    className="grid grid-cols-[80px_1fr_200px_200px_200px] gap-4 items-center px-6 py-5 rounded-2xl"
                    style={{
                      background: isTop3
                        ? `linear-gradient(90deg, ${rankColor}22 0%, rgba(255,255,255,0.03) 100%)`
                        : 'rgba(255,255,255,0.04)',
                      border: isTop3 ? `1px solid ${rankColor}55` : '1px solid rgba(255,255,255,0.05)',
                      boxShadow: isTop3 ? `0 0 30px ${rankColor}22` : 'none',
                    }}
                  >
                    <div
                      className="text-4xl font-black tabular-nums"
                      style={{ color: rankColor }}
                    >
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                    </div>
                    <div>
                      <p className={`${theme.heading} text-3xl font-black tracking-tight`}>{row.team.name}</p>
                    </div>
                    <div className="text-center">
                      <p className={`${theme.heading} text-5xl font-black tabular-nums`}>
                        {showBonus ? row.points + row.bonus : row.points}
                      </p>
                      {showBonus ? (
                        <p className={`${theme.muted} text-xs font-bold uppercase tracking-widest mt-1`}>
                          <span className={theme.accent}>{row.points} bingo</span>
                          <span className={theme.muted}> + </span>
                          <span className={theme.bonus}>{row.bonus} bonus</span>
                        </p>
                      ) : row.duelBonus > 0 ? (
                        // Surface duel winnings — otherwise a defender who won
                        // reads as having scored from nowhere.
                        <p className={`${theme.muted} text-xs font-bold uppercase tracking-widest mt-1`}>
                          pts <span className={theme.duel}>· incl. {row.duelBonus} duel</span>
                        </p>
                      ) : (
                        <p className={`${theme.muted} text-xs font-bold uppercase tracking-widest mt-1`}>pts</p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className={`${theme.lines} text-5xl font-black tabular-nums`}>
                        {row.bingos}<span className={`text-2xl ${theme.muted}`}>/12</span>
                      </p>
                      <p className={`${theme.muted} text-xs font-bold uppercase tracking-widest mt-1`}>lines</p>
                    </div>
                    <div className="text-center">
                      <p className={`${theme.positive} text-5xl font-black tabular-nums`}>
                        {row.tasksDone}
                      </p>
                      <p className={`${theme.muted} text-xs font-bold uppercase tracking-widest mt-1`}>completed</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
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
