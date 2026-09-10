import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks } from '../lib/boardCards'
import { useFullscreen } from '../hooks/useFullscreen'
import { ParticleBackground } from '../components/ParticleBackground'
import {
  buildAwardSlides,
  normalizeSlideOrder,
  type AwardSlideDescriptor,
} from '../lib/awardSlides'
import { duelBonusByTeam } from '../hooks/useBingoDuels'
import type { BingoSection, BingoTeam, BingoScan, BingoTask, BingoAwardConfig, BingoDuel } from '../types/database'

const BINGO_LINES: number[][] = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
]

const DEFAULT_COUNTS = {
  consolation_count: 0,
  consolation_group_count: 2,
  third_count: 1,
  second_count: 1,
  first_count: 1,
}

export function BingoDashAwardSlides() {
  const { sectionSlug } = useParams<{ sectionSlug?: string }>()
  if (!sectionSlug) return <SectionPicker />
  return <AwardShow key={sectionSlug} sectionSlug={sectionSlug} />
}

// ── Section picker ───────────────────────────────────────────────────────
function SectionPicker() {
  const [sections, setSections] = useState<BingoSection[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.from('bingo_sections').select('*').order('sort_order').then(({ data }) => {
      if (data) setSections(data)
    })
    supabase.from('bingo_settings').select('active_section_id').limit(1).maybeSingle()
      .then(({ data }) => { if (data) setActiveId(data.active_section_id) })
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-x-hidden py-12 px-6">
      <ParticleBackground />

      <a href="/bingo-dash/slides" className="absolute top-6 left-6 z-20 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-widest font-semibold">
        ← Event Slides
      </a>

      <div className="relative z-10 text-center mb-12">
        <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tight animate-slide-up">
          🏆 AWARD SLIDES
        </h1>
        <p className="text-gray-400 text-lg sm:text-xl mt-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
          Pick a compartment to run the awards ceremony
        </p>
      </div>

      <div className="relative z-10 flex flex-row flex-wrap gap-6 justify-center max-w-5xl">
        {sections.length === 0 ? (
          <p className="text-gray-500 text-sm">No compartments yet. Create one in the Bingo Dash admin first.</p>
        ) : sections.map((s, i) => {
          const isActive = s.id === activeId
          return (
            <div
              key={s.id}
              className="animate-bounce-in flex flex-col items-center gap-4 px-10 py-10 rounded-3xl w-72"
              style={{
                animationDelay: `${0.25 + i * 0.08}s`,
                opacity: 0,
                animationFillMode: 'forwards',
                background: 'rgba(255,255,255,0.04)',
                border: `2px solid ${isActive ? '#fbbf24' : '#a855f733'}`,
                boxShadow: isActive ? '0 0 32px rgba(251,191,36,0.25)' : 'none',
              }}
            >
              <div className="text-6xl animate-float" style={{ filter: isActive ? 'drop-shadow(0 0 20px #fbbf24aa)' : 'none' }}>
                🎖
              </div>
              <div className="text-center w-full">
                <h2 className="text-xl font-black text-white tracking-tight">{s.name}</h2>
                {isActive && (
                  <span className="inline-block mt-1 text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    ● Active now
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate(`/bingo-dash/slides/awards/${s.slug}`)}
                className="w-full py-3 rounded-xl text-center text-sm font-black tracking-wider hover:scale-105 transition-transform"
                style={{ background: '#fbbf24', color: '#000' }}
              >
                ▶ RUN AWARDS
              </button>
              <button
                onClick={() => navigate(`/bingo-dash/slides/awards/${s.slug}/admin`)}
                className="w-full py-2 rounded-xl text-center text-[11px] font-bold tracking-[0.2em] uppercase text-white/70 hover:text-white border border-white/15 hover:border-white/40 transition-colors"
              >
                ⚙ Configure
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Slide show ───────────────────────────────────────────────────────────
type RankedTeam = {
  team: BingoTeam
  basePoints: number
  bonusPoints: number
  total: number
  bingos: number
  tasksDone: number
  /** When this team last scored; earlier wins a tie. Infinity = never scored. */
  reachedAt: number
}

function AwardShow({ sectionSlug }: { sectionSlug: string }) {
  const navigate = useNavigate()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [config, setConfig] = useState<BingoAwardConfig | null>(null)
  const [duels, setDuels] = useState<BingoDuel[]>([])
  const [loaded, setLoaded] = useState(false)
  const [slideIdx, setSlideIdx] = useState(0)
  const [showJudgePanel, setShowJudgePanel] = useState(false)

  const adjustBonus = async (teamId: string, delta: number) => {
    const current = teams.find(t => t.id === teamId)?.bonus_points ?? 0
    const next = Math.max(0, current + delta)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, bonus_points: next } : t))
    await supabase.from('bingo_teams').update({ bonus_points: next }).eq('id', teamId)
  }

  const setBonus = async (teamId: string, value: number) => {
    const v = Math.max(0, Math.floor(value))
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, bonus_points: v } : t))
    await supabase.from('bingo_teams').update({ bonus_points: v }).eq('id', teamId)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: sec } = await supabase.from('bingo_sections').select('*').eq('slug', sectionSlug).maybeSingle()
      if (!sec || cancelled) { setLoaded(true); return }
      setSection(sec)
      const [{ data: t }, { data: s }, gt, { data: cfg }, { data: d }] = await Promise.all([
        supabase.from('bingo_teams').select('*').eq('section_id', sec.id).order('name'),
        supabase.from('bingo_scans').select('*'),
        fetchBoardTasks(sec.id),
        supabase.from('bingo_award_configs').select('*').eq('section_id', sec.id).maybeSingle(),
        supabase.from('bingo_duels').select('*').eq('section_id', sec.id).eq('status', 'done'),
      ])
      if (cancelled) return
      setTeams(t ?? [])
      setScans(s ?? [])
      setGridTasks(gt)
      setConfig(cfg ?? null)
      setDuels(d ?? [])
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [sectionSlug])

  const ranked: RankedTeam[] = useMemo(() => {
    const duelBonuses = duelBonusByTeam(duels)
    if (!teams.length || !gridTasks.length) {
      return teams
        .map<RankedTeam>(team => ({
          team,
          basePoints: 0,
          bonusPoints: team.bonus_points ?? 0,
          total: team.bonus_points ?? 0,
          bingos: 0,
          tasksDone: 0,
          reachedAt: Infinity,
        }))
        .sort(rankCompare)
    }
    const slots: (BingoTask | null)[] = Array(25).fill(null)
    gridTasks.forEach(t => { if (t.sort_order >= 0 && t.sort_order < 25) slots[t.sort_order] = t })
    const gridTaskIds = new Set(gridTasks.map(t => t.id))
    const computed: RankedTeam[] = teams.map(team => {
      const teamScans = scans.filter(sc => sc.team_id === team.id)
      // A card placed in several boxes on this board completes per box
      // (scan.board_card_id); scans from before that column existed have
      // none and still count toward every box sharing their task_id — see
      // supabase/migrations/20260910_scan_board_card_id.sql.
      const completedPlacementIds = new Set(
        teamScans.filter(sc => sc.completed && sc.board_card_id).map(sc => sc.board_card_id as string),
      )
      const legacyCompletedTaskIds = new Set(
        teamScans.filter(sc => sc.completed && !sc.board_card_id && gridTaskIds.has(sc.task_id)).map(sc => sc.task_id),
      )
      const completedPlacements = gridTasks.filter(t =>
        (t.placement_id && completedPlacementIds.has(t.placement_id)) || legacyCompletedTaskIds.has(t.id),
      )
      const completedIds = new Set(completedPlacements.map(t => t.placement_id ?? t.id))
      // Contest bonuses count as earned play, alongside tile points — a winning
      // defender has no tile, so this is the only record of their win.
      const basePoints = completedPlacements.reduce((sum, t) => sum + (t.points ?? 0), 0)
        + (duelBonuses.get(team.id) ?? 0)
      const bonusPoints = team.bonus_points ?? 0
      const bingos = BINGO_LINES.filter(line => line.every(i => {
        const t = slots[i]
        return t && completedIds.has(t.placement_id ?? t.id)
      })).length
      const reachedAt = teamScans.reduce(
        (latest, sc) => (sc.completed && gridTaskIds.has(sc.task_id) && sc.completed_at)
          ? Math.max(latest, Date.parse(sc.completed_at)) : latest,
        0,
      )
      return {
        team,
        basePoints,
        bonusPoints,
        total: basePoints + bonusPoints,
        bingos,
        tasksDone: completedIds.size,
        reachedAt: reachedAt || Infinity,
      }
    })
    computed.sort(rankCompare)
    return computed
  }, [teams, scans, gridTasks, duels])

  const slides: AwardSlideDescriptor[] = useMemo(() => {
    const counts = config ?? DEFAULT_COUNTS
    const order = normalizeSlideOrder(config?.slide_order ?? null, counts)
    return buildAwardSlides(order)
  }, [config])

  const totalSlides = slides.length
  const safeSlideIdx = Math.min(slideIdx, Math.max(0, totalSlides - 1))
  const current = slides[safeSlideIdx]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (!typing && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        setShowJudgePanel(p => !p)
        return
      }
      if (typing) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setSlideIdx(i => Math.min(totalSlides - 1, i + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        setSlideIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Escape') {
        if (showJudgePanel) setShowJudgePanel(false)
        else navigate('/bingo-dash/slides/awards')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, showJudgePanel, totalSlides])

  if (!loaded) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading…</div>
  }
  if (!section) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
        <p className="text-2xl font-black">Compartment not found.</p>
        <a href="/bingo-dash/slides/awards" className="text-amber-400 hover:text-amber-300 underline">Pick another</a>
      </div>
    )
  }
  if (!current) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
        <p className="text-2xl font-black">No slides configured yet.</p>
        <a
          href={`/bingo-dash/slides/awards/${section.slug}/admin`}
          className="text-amber-400 hover:text-amber-300 underline"
        >
          Open the award admin to add prizes
        </a>
      </div>
    )
  }

  const teamsForSlide: RankedTeam[] = (current.teamRanks ?? [])
    .map(r => ranked[r - 1])
    .filter((x): x is RankedTeam => !!x)

  const isHsbcSlide = current.kind === 'main' || current.kind === 'closing'
  const slideStyle = isHsbcSlide
    ? {
        background: 'linear-gradient(135deg, #DB0011 0%, #8B0009 100%)',
        fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`,
      }
    : {
        background: 'radial-gradient(ellipse at 50% 35%, #3b1f66 0%, #180a33 55%, #06020f 100%)',
        fontFamily: `'Cinzel', 'Trajan Pro', 'Palatino Linotype', Georgia, serif`,
      }

  return (
    <div
      className="h-screen w-screen overflow-hidden relative cursor-pointer select-none"
      onClick={() => setSlideIdx(i => Math.min(totalSlides - 1, i + 1))}
      style={slideStyle}
    >
      <AwardSlideRenderer
        key={safeSlideIdx}
        slideIdx={safeSlideIdx}
        descriptor={current}
        teamsForSlide={teamsForSlide}
        config={config}
        teams={teams}
        ranked={ranked}
      />

      {/* Top nav */}
      <div className="absolute top-5 left-6 right-6 flex items-center justify-between text-[11px] text-white/50 font-semibold uppercase tracking-[0.25em] z-40">
        <a
          href="/bingo-dash/slides/awards"
          onClick={e => e.stopPropagation()}
          className="hover:text-white transition-colors"
        >
          ← Awards Home
        </a>
        <span className="hidden sm:inline">{section.name} · Slide {safeSlideIdx + 1} / {totalSlides}</span>
        <button
          onClick={e => { e.stopPropagation(); toggleFullscreen() }}
          className="hover:text-white transition-colors"
        >
          {isFullscreen ? 'Exit ⛶' : 'Fullscreen ⛶'}
        </button>
      </div>

      {/* Progress dots */}
      <div className="absolute top-14 left-0 right-0 flex items-center justify-center gap-2 z-40">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full transition-all"
            style={{
              background: i <= safeSlideIdx ? '#fbbf24' : 'rgba(255,255,255,0.18)',
              boxShadow: i === safeSlideIdx ? '0 0 10px #fbbf24' : 'none',
              transform: i === safeSlideIdx ? 'scale(1.4)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* Back button */}
      {safeSlideIdx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setSlideIdx(i => Math.max(0, i - 1)) }}
          className="absolute bottom-10 left-8 z-40 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-[0.3em] font-bold"
        >
          ← Back
        </button>
      )}

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-white/30 uppercase tracking-[0.35em] z-40 font-semibold pointer-events-none">
        {safeSlideIdx < totalSlides - 1 ? '▶ Click / Space / → to continue · Press B for bonus' : '✦ End of Awards · Esc to exit'}
      </div>

      {/* Judge panel: toggle with B — adjust bonus points live */}
      {showJudgePanel && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-0 right-0 bottom-0 w-[380px] max-w-[90vw] bg-gray-950/95 border-l border-white/10 text-white z-50 shadow-2xl flex flex-col"
          style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <p className="text-xs text-amber-400 font-bold uppercase tracking-widest">Bonus Points</p>
              <p className="text-sm text-white/60 mt-0.5">Ranks update live · Press B to close</p>
            </div>
            <button
              onClick={() => setShowJudgePanel(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg leading-none"
              title="Close (B or Esc)"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {ranked.map((r, i) => (
              <div
                key={r.team.id}
                className="bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-white/40 w-5 text-right">#{i + 1}</span>
                    <span className="font-bold text-sm truncate">{r.team.name}</span>
                  </div>
                  <span className="text-xs font-mono text-amber-400 whitespace-nowrap ml-2">
                    {r.total} pts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustBonus(r.team.id, -5)}
                    className="w-8 h-8 rounded bg-white/10 hover:bg-red-500/40 text-sm font-bold transition-colors"
                  >−5</button>
                  <button
                    onClick={() => adjustBonus(r.team.id, -1)}
                    className="w-8 h-8 rounded bg-white/10 hover:bg-red-500/40 text-sm font-bold transition-colors"
                  >−1</button>
                  <input
                    type="number"
                    value={r.bonusPoints}
                    onChange={e => setBonus(r.team.id, parseInt(e.target.value, 10) || 0)}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-white/10 rounded text-center font-mono font-bold py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/50 min-w-0"
                  />
                  <button
                    onClick={() => adjustBonus(r.team.id, 1)}
                    className="w-8 h-8 rounded bg-white/10 hover:bg-emerald-500/40 text-sm font-bold transition-colors"
                  >+1</button>
                  <button
                    onClick={() => adjustBonus(r.team.id, 5)}
                    className="w-8 h-8 rounded bg-white/10 hover:bg-emerald-500/40 text-sm font-bold transition-colors"
                  >+5</button>
                </div>
                <p className="text-[10px] text-white/40 mt-1.5 font-mono">
                  Base {r.basePoints} + Bonus {r.bonusPoints} · {r.bingos} bingo{r.bingos === 1 ? '' : 's'}
                </p>
              </div>
            ))}
            {ranked.length === 0 && (
              <p className="text-white/40 text-sm text-center py-8">No teams yet</p>
            )}
          </div>
        </div>
      )}

      {/* Judge toggle button */}
      {!showJudgePanel && (
        <button
          onClick={e => { e.stopPropagation(); setShowJudgePanel(true) }}
          className="absolute bottom-4 right-6 z-40 text-[10px] text-white/40 hover:text-amber-300 uppercase tracking-[0.3em] font-bold transition-colors"
          title="Adjust bonus points (B)"
        >
          ✎ Bonus (B)
        </button>
      )}
    </div>
  )
}

// Sort: higher total first, then more bingos, then more tasks done, then name asc
function rankCompare(a: RankedTeam, b: RankedTeam): number {
  return (
    b.total - a.total ||
    b.bingos - a.bingos ||
    b.tasksDone - a.tasksDone ||
    // Dead heat on score: the team that got there first ranks higher. Falling
    // through to the name here ranked a genuine tie alphabetically, which is
    // what let a later finisher take the higher award.
    a.reachedAt - b.reachedAt ||
    a.team.name.localeCompare(b.team.name)
  )
}

// ── Single slide renderer ─────────────────────────────────────────────────
const TIER = {
  consolation: {
    preLabel: 'Honorable Mention',
    medal: '🎖',
    medalSize: '3rem',
    labelColor: '#c4b5fd',
    beamColor: '#a855f7',
    ringBg: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 40%, #c084fc 70%, #7c3aed 100%)',
    ringGlow: 'rgba(168,85,247,0.6)',
    ringWidth: '6px',
    confetti: 34,
    photoSize: 220,
    useGoldSweep: false,
  },
  third: {
    preLabel: 'Second Runner-Up',
    medal: '🥉',
    medalSize: '4rem',
    labelColor: '#f59e0b',
    beamColor: '#b45309',
    ringBg: 'linear-gradient(135deg, #92400e 0%, #b45309 35%, #f59e0b 55%, #b45309 75%, #92400e 100%)',
    ringGlow: 'rgba(245,158,11,0.7)',
    ringWidth: '8px',
    confetti: 70,
    photoSize: 260,
    useGoldSweep: false,
  },
  second: {
    preLabel: 'First Runner-Up',
    medal: '🥈',
    medalSize: '5rem',
    labelColor: '#e5e7eb',
    beamColor: '#9ca3af',
    ringBg: 'linear-gradient(135deg, #9ca3af 0%, #e5e7eb 30%, #ffffff 50%, #e5e7eb 70%, #9ca3af 100%)',
    ringGlow: 'rgba(229,231,235,0.8)',
    ringWidth: '10px',
    confetti: 110,
    photoSize: 300,
    useGoldSweep: false,
  },
  first: {
    preLabel: 'Grand Champion',
    medal: '🥇',
    medalSize: '6rem',
    labelColor: '#fde047',
    beamColor: '#facc15',
    ringBg: 'linear-gradient(135deg, #c48c33 0%, #fde047 30%, #fff8d8 50%, #fde047 70%, #c48c33 100%)',
    ringGlow: 'rgba(253,224,71,0.9)',
    ringWidth: '14px',
    confetti: 180,
    photoSize: 340,
    useGoldSweep: true,
  },
} as const

function tierTitle(kind: 'consolation' | 'third' | 'second' | 'first', rank: number): string {
  const suffix = rank > 1 ? `  ·  #${rank}` : ''
  if (kind === 'first')  return `🏆 GRAND WINNER${suffix}`
  if (kind === 'second') return `🥈 FIRST RUNNER-UP${suffix}`
  if (kind === 'third')  return `🥉 SECOND RUNNER-UP${suffix}`
  return `🎖 HONORABLE MENTION${suffix}`
}

function AwardSlideRenderer({
  slideIdx, descriptor, teamsForSlide, config, teams, ranked,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  teamsForSlide: RankedTeam[]
  config: BingoAwardConfig | null
  teams: BingoTeam[]
  ranked: RankedTeam[]
}) {
  if (descriptor.kind === 'main') return <MainSlide slideIdx={slideIdx} config={config} />
  if (descriptor.kind === 'intro') return <IntroSlide slideIdx={slideIdx} />
  if (descriptor.kind === 'holding') return <HoldingSlide slideIdx={slideIdx} />
  if (descriptor.kind === 'lineup') return <LineupSlide slideIdx={slideIdx} teams={teams} />
  if (descriptor.kind === 'scoreboard') return <ScoreboardSlide slideIdx={slideIdx} ranked={ranked} />
  if (descriptor.kind === 'closing') return <ClosingSlide slideIdx={slideIdx} config={config} />
  if (descriptor.kind === 'consolation_group') {
    return (
      <ConsolationGroupSlide
        slideIdx={slideIdx}
        descriptor={descriptor}
        teamsForSlide={teamsForSlide}
      />
    )
  }
  return (
    <PrizeSlide
      slideIdx={slideIdx}
      descriptor={descriptor}
      ranked={teamsForSlide[0] ?? null}
    />
  )
}

// ── Main slide (HSBC red opener) ──────────────────────────────────────────
function MainSlide({ slideIdx, config }: { slideIdx: number; config: BingoAwardConfig | null }) {
  const title = config?.main_title || 'HSBC KL EXPLORACE 2026'
  const subtitle = config?.main_subtitle || 'HSBC KL Explorace 2026'
  const tagline = config?.main_tagline || 'AWARDS CEREMONY'

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      {/* Soft animated blobs to mirror briefing aesthetics */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          top: '-10%', left: '-15%', width: '60vw', height: '60vw',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
          animation: 'medal-pulse 6s ease-in-out infinite',
        }}
      />
      <div
        className="absolute pointer-events-none z-0"
        style={{
          bottom: '-15%', right: '-10%', width: '55vw', height: '55vw',
          background: 'radial-gradient(circle, rgba(255,184,28,0.16) 0%, transparent 70%)',
          filter: 'blur(48px)',
          animation: 'medal-pulse 8s ease-in-out 1s infinite',
        }}
      />

      <div
        className="relative z-10 mb-6"
        style={{ animation: 'pop-bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 260 140"
          style={{
            width: '110px',
            height: 'auto',
            filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.55))',
          }}
        >
          <polygon points="0,70 65,0 65,140" fill="#fff" />
          <polygon points="260,70 195,0 195,140" fill="#fff" />
          <polygon points="65,0 130,70 195,0" fill="#fff" />
          <polygon points="65,140 130,70 195,140" fill="#fff" />
          <polygon points="65,0 130,70 65,140" fill="rgba(200,0,12,.7)" />
          <polygon points="195,0 130,70 195,140" fill="rgba(200,0,12,.7)" />
        </svg>
      </div>

      <h1
        className="relative z-10 font-black leading-[0.95] text-white"
        style={{
          fontSize: 'clamp(3rem, 11vw, 9rem)',
          letterSpacing: '0.04em',
          textShadow: '0 4px 30px rgba(0,0,0,0.45)',
          animation: 'title-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both',
        }}
      >
        {title}
      </h1>

      <p
        className="relative z-10 mt-5 text-white/95 font-light"
        style={{
          fontSize: 'clamp(1.1rem, 2.4vw, 1.8rem)',
          letterSpacing: '0.02em',
          animation: 'slide-up-fade 0.7s ease-out 0.85s both',
        }}
      >
        {subtitle}
      </p>

      <div
        className="relative z-10 mt-6 mx-auto"
        style={{
          width: 60,
          height: 2,
          background: 'rgba(255,255,255,0.65)',
          animation: 'slide-up-fade 0.6s ease-out 1.05s both',
        }}
      />

      <p
        className="relative z-10 mt-6 text-white/80 font-bold uppercase"
        style={{
          fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)',
          letterSpacing: '0.4em',
          animation: 'slide-up-fade 0.7s ease-out 1.25s both',
        }}
      >
        {tagline}
      </p>
    </div>
  )
}

// ── Intro slide (animated opener) ─────────────────────────────────────────
function IntroSlide({ slideIdx }: { slideIdx: number }) {
  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '180vmax',
          height: '180vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, #fde04733 18deg, transparent 40deg, transparent 170deg, #fde04722 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 20s linear infinite',
          opacity: 0.9,
        }}
      />
      <Confetti count={140} slideKey={slideIdx} />

      <p
        className="relative z-10 text-xs sm:text-sm font-bold uppercase tracking-[0.6em] text-amber-200/80"
        style={{ animation: 'slide-down-fade 0.7s ease-out 0.1s both' }}
      >
        Ladies and Gentlemen
      </p>

      <h1
        className="relative z-10 mt-4 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(3rem, 11vw, 9rem)',
          letterSpacing: '0.08em',
          animation: 'title-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both, gold-sweep 6s linear 0.35s infinite',
        }}
      >
        🏆 AWARD CEREMONY
      </h1>

      <p
        className="relative z-10 mt-6 text-white/80 text-xl sm:text-3xl font-light tracking-wider"
        style={{ animation: 'slide-up-fade 0.7s ease-out 1s both', fontStyle: 'italic' }}
      >
        Presenting your champions…
      </p>

      {/* Sparkles row */}
      <div
        className="relative z-10 mt-10 flex gap-5 text-3xl sm:text-5xl"
        style={{ animation: 'slide-up-fade 0.7s ease-out 1.3s both' }}
      >
        <span style={{ animation: 'medal-pulse 2s ease-in-out infinite' }}>✨</span>
        <span style={{ animation: 'medal-pulse 2s ease-in-out 0.2s infinite' }}>🎉</span>
        <span style={{ animation: 'medal-pulse 2s ease-in-out 0.4s infinite' }}>🏆</span>
        <span style={{ animation: 'medal-pulse 2s ease-in-out 0.6s infinite' }}>🎊</span>
        <span style={{ animation: 'medal-pulse 2s ease-in-out 0.8s infinite' }}>✨</span>
      </div>
    </div>
  )
}

// ── Holding slide ─────────────────────────────────────────────────────────
// Layout mirrors PrizeSlide so the hero image lands where the team photo
// will appear on the next slides (pretitle → title → photo → name-line).
function HoldingSlide({ slideIdx }: { slideIdx: number }) {
  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, #fcd34d22 18deg, transparent 40deg, transparent 170deg, #fcd34d22 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 26s linear infinite',
          opacity: 0.55,
        }}
      />

      <p
        className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] text-amber-200/80"
        style={{ animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        Ladies and Gentlemen
      </p>

      <h1
        className="relative z-10 mt-3 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(3rem, 11vw, 9rem)',
          letterSpacing: '0.05em',
          animation: 'title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
        }}
      >
        Presenting Awards
      </h1>

      <p
        className="relative z-10 mt-10 text-white/40 text-xs uppercase tracking-[0.4em]"
        style={{ animation: 'slide-up-fade 0.6s ease-out 1.0s both' }}
      >
        ▶ Continue for the winners
      </p>
    </div>
  )
}

// ── Lineup slide: all teams with photos ───────────────────────────────────
function LineupSlide({ slideIdx, teams }: { slideIdx: number; teams: BingoTeam[] }) {
  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  )
  const count = sorted.length
  const cols = count <= 4 ? count : count <= 9 ? 3 : count <= 16 ? 4 : 5
  const photoSize = count <= 6 ? 180 : count <= 12 ? 140 : count <= 20 ? 110 : 90

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, #a5f3fc22 18deg, transparent 40deg, transparent 170deg, #a5f3fc22 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 28s linear infinite',
          opacity: 0.7,
        }}
      />

      <p
        className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] text-cyan-200/80"
        style={{ animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        Tonight's Contenders
      </p>

      <h1
        className="relative z-10 mt-3 mb-8 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(2rem, 6vw, 4.5rem)',
          letterSpacing: '0.05em',
          animation: 'title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
        }}
      >
        👥 MEET THE TEAMS
      </h1>

      <div
        className="relative z-10 grid gap-x-6 gap-y-4 max-w-[min(92vw,1400px)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {sorted.map((t, i) => (
          <div
            key={t.id}
            className="flex flex-col items-center gap-2"
            style={{ animation: `pop-bounce-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.45 + i * 0.06}s both` }}
          >
            <div
              className="relative flex items-center justify-center"
              style={{
                width: `${photoSize}px`,
                height: `${photoSize}px`,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #67e8f9 0%, #a5f3fc 35%, #ecfeff 55%, #a5f3fc 75%, #67e8f9 100%)',
                padding: '4px',
                boxShadow: '0 0 28px rgba(165,243,252,0.5), inset 0 0 14px rgba(0,0,0,0.3)',
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                {t.photo_url ? (
                  <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-3xl text-white/40">👥</div>
                )}
              </div>
            </div>
            <p
              className="font-bold text-white/90 leading-tight"
              style={{ fontSize: photoSize >= 140 ? '0.95rem' : photoSize >= 110 ? '0.8rem' : '0.7rem' }}
            >
              {t.name}
            </p>
          </div>
        ))}
        {count === 0 && (
          <p className="col-span-full text-white/60 text-lg">No teams yet.</p>
        )}
      </div>
    </div>
  )
}

// ── Scoreboard slide: full ranked list of every team ──────────────────────
function ScoreboardSlide({ slideIdx, ranked }: { slideIdx: number; ranked: RankedTeam[] }) {
  const count = ranked.length
  const cols = count <= 8 ? 1 : 2
  const rows = Math.max(1, Math.ceil(count / cols))
  const rowFontSize = count <= 8 ? '1.6rem' : count <= 16 ? '1.15rem' : '1rem'
  const rowPad = count <= 8 ? 'py-3 px-5' : count <= 16 ? 'py-2 px-4' : 'py-1.5 px-3.5'
  const photoSize = count <= 8 ? 56 : count <= 16 ? 44 : 36

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, #86efac22 18deg, transparent 40deg, transparent 170deg, #86efac22 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 28s linear infinite',
          opacity: 0.55,
        }}
      />

      <p
        className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] text-emerald-200/80"
        style={{ animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        Final Standings
      </p>

      <h1
        className="relative z-10 mt-3 mb-7 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(2rem, 6vw, 4.4rem)',
          letterSpacing: '0.05em',
          animation: 'title-slam 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
        }}
      >
        📊 FULL SCOREBOARD
      </h1>

      <div
        className="relative z-10 grid gap-x-6 gap-y-2 w-full max-w-[min(94vw,1500px)]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, auto)`,
          gridAutoFlow: 'column',
        }}
      >
        {ranked.map((r, i) => {
          const rank = i + 1
          const isPodium = rank <= 3
          const podiumIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
          return (
            <div
              key={r.team.id}
              className={`flex items-center gap-3 rounded-xl ${rowPad}`}
              style={{
                background: isPodium
                  ? 'linear-gradient(90deg, rgba(253,224,71,0.18) 0%, rgba(253,224,71,0.05) 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isPodium ? 'rgba(253,224,71,0.45)' : 'rgba(255,255,255,0.08)'}`,
                animation: `slide-up-fade 0.45s ease-out ${0.45 + i * 0.04}s both`,
              }}
            >
              <span
                className="font-black tabular-nums shrink-0 text-right"
                style={{
                  width: '2.2em',
                  fontSize: rowFontSize,
                  color: isPodium ? '#fde047' : 'rgba(255,255,255,0.5)',
                }}
              >
                {podiumIcon ?? `#${rank}`}
              </span>
              <div
                className="rounded-full overflow-hidden bg-gray-900 shrink-0"
                style={{
                  width: `${photoSize}px`,
                  height: `${photoSize}px`,
                  border: `2px solid ${isPodium ? '#fde047' : 'rgba(255,255,255,0.18)'}`,
                  boxShadow: isPodium ? '0 0 18px rgba(253,224,71,0.4)' : 'none',
                }}
              >
                {r.team.photo_url ? (
                  <img src={r.team.photo_url} alt={r.team.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40 text-base">👥</div>
                )}
              </div>
              <p
                className="font-black text-white leading-tight flex-1 min-w-0 text-left truncate"
                style={{ fontSize: rowFontSize }}
              >
                {r.team.name}
              </p>
              <p
                className="font-black tabular-nums shrink-0"
                style={{
                  fontSize: rowFontSize,
                  color: isPodium ? '#fde047' : '#fff',
                  textShadow: isPodium ? '0 0 18px rgba(253,224,71,0.5)' : 'none',
                }}
              >
                {r.total.toLocaleString()}
                <span className="text-white/50 font-light text-[0.6em] ml-1.5">pts</span>
              </p>
            </div>
          )
        })}
        {count === 0 && (
          <p className="col-span-full text-white/60 text-lg py-10">No teams yet.</p>
        )}
      </div>
    </div>
  )
}

// ── Closing slide (HSBC red, ceremony end) ────────────────────────────────
function ClosingSlide({ slideIdx, config }: { slideIdx: number; config: BingoAwardConfig | null }) {
  const title = config?.main_title || 'HSBC KL EXPLORACE 2026'
  const subtitle = config?.main_subtitle || 'Thank you to all our teams'
  const tagline = 'CONGRATULATIONS · SEE YOU NEXT TIME'

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute pointer-events-none z-0"
        style={{
          top: '-10%', left: '-15%', width: '60vw', height: '60vw',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
          animation: 'medal-pulse 6s ease-in-out infinite',
        }}
      />
      <div
        className="absolute pointer-events-none z-0"
        style={{
          bottom: '-15%', right: '-10%', width: '55vw', height: '55vw',
          background: 'radial-gradient(circle, rgba(255,184,28,0.16) 0%, transparent 70%)',
          filter: 'blur(48px)',
          animation: 'medal-pulse 8s ease-in-out 1s infinite',
        }}
      />

      <div
        className="relative z-10 mb-6"
        style={{ animation: 'pop-bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 260 140"
          style={{ width: '110px', height: 'auto', filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.55))' }}
        >
          <polygon points="0,70 65,0 65,140" fill="#fff" />
          <polygon points="260,70 195,0 195,140" fill="#fff" />
          <polygon points="65,0 130,70 195,0" fill="#fff" />
          <polygon points="65,140 130,70 195,140" fill="#fff" />
          <polygon points="65,0 130,70 65,140" fill="rgba(200,0,12,.7)" />
          <polygon points="195,0 130,70 195,140" fill="rgba(200,0,12,.7)" />
        </svg>
      </div>

      <p
        className="relative z-10 text-white/80 font-bold uppercase mb-4"
        style={{
          fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)',
          letterSpacing: '0.4em',
          animation: 'slide-down-fade 0.7s ease-out 0.4s both',
        }}
      >
        Thank You
      </p>

      <h1
        className="relative z-10 font-black leading-[0.95] text-white"
        style={{
          fontSize: 'clamp(2.6rem, 9vw, 7.5rem)',
          letterSpacing: '0.04em',
          textShadow: '0 4px 30px rgba(0,0,0,0.45)',
          animation: 'title-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both',
        }}
      >
        {title}
      </h1>

      <p
        className="relative z-10 mt-5 text-white/95 font-light"
        style={{
          fontSize: 'clamp(1.1rem, 2.2vw, 1.6rem)',
          letterSpacing: '0.02em',
          animation: 'slide-up-fade 0.7s ease-out 1s both',
        }}
      >
        {subtitle}
      </p>

      <div
        className="relative z-10 mt-6 mx-auto"
        style={{
          width: 60, height: 2,
          background: 'rgba(255,255,255,0.65)',
          animation: 'slide-up-fade 0.6s ease-out 1.2s both',
        }}
      />

      <p
        className="relative z-10 mt-6 text-white/80 font-bold uppercase"
        style={{
          fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)',
          letterSpacing: '0.4em',
          animation: 'slide-up-fade 0.7s ease-out 1.4s both',
        }}
      >
        {tagline}
      </p>
    </div>
  )
}

// ── Prize slide (consolation/third/second/first) ──────────────────────────
function PrizeSlide({
  slideIdx, descriptor, ranked,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  ranked: RankedTeam | null
}) {
  const kind = descriptor.kind as 'consolation' | 'third' | 'second' | 'first'
  const cfg = TIER[kind]
  const hasTeam = !!ranked
  const rank = descriptor.rank ?? 1

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, ${cfg.beamColor}33 18deg, transparent 40deg, transparent 170deg, ${cfg.beamColor}22 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 22s linear infinite',
          opacity: 0.75,
        }}
      />
      <Confetti count={cfg.confetti} slideKey={slideIdx} />

      <p
        className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] opacity-70"
        style={{ color: cfg.labelColor, animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        {cfg.preLabel}
      </p>

      <h1
        className={`relative z-10 mt-3 mb-8 font-black leading-none ${cfg.useGoldSweep ? 'animate-gold-title' : ''}`}
        style={{
          fontSize: kind === 'first'
            ? 'clamp(2.6rem, 9vw, 7rem)'
            : kind === 'second'
              ? 'clamp(2.4rem, 8vw, 6rem)'
              : kind === 'third'
                ? 'clamp(2.2rem, 7vw, 5.4rem)'
                : 'clamp(1.6rem, 5vw, 3.4rem)',
          letterSpacing: '0.05em',
          color: cfg.useGoldSweep ? undefined : cfg.labelColor,
          animation: `title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both${cfg.useGoldSweep ? ', gold-sweep 6s linear 0.3s infinite' : ''}`,
          textShadow: cfg.useGoldSweep ? undefined : `0 0 30px ${cfg.labelColor}88`,
        }}
      >
        {tierTitle(kind, rank)}
      </h1>

      {hasTeam ? (
        <>
          <div
            className="relative z-10"
            style={{ animation: 'pop-bounce-in 0.75s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both' }}
          >
            <div
              className="relative flex items-center justify-center"
              style={{
                width: `${cfg.photoSize}px`,
                height: `${cfg.photoSize}px`,
                borderRadius: '50%',
                background: cfg.ringBg,
                padding: cfg.ringWidth,
                boxShadow: `0 0 70px ${cfg.ringGlow}, inset 0 0 22px rgba(0,0,0,0.3)`,
                animation: 'medal-pulse 2.8s ease-in-out 1.1s infinite',
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                {ranked!.team.photo_url ? (
                  <img src={ranked!.team.photo_url} alt={ranked!.team.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-7xl text-white/40">👥</div>
                )}
              </div>
              <div
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 select-none"
                style={{
                  fontSize: cfg.medalSize,
                  filter: `drop-shadow(0 6px 14px ${cfg.ringGlow})`,
                  animation: 'medal-drop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 1s both',
                }}
              >
                {cfg.medal}
              </div>
            </div>
          </div>

          <h2
            className="relative z-10 font-black text-white mt-8 mb-1"
            style={{
              fontSize: kind === 'first'
                ? 'clamp(2rem, 6vw, 5rem)'
                : kind === 'second'
                  ? 'clamp(1.8rem, 5.5vw, 4.4rem)'
                  : kind === 'third'
                    ? 'clamp(1.6rem, 5vw, 4rem)'
                    : 'clamp(1.4rem, 4vw, 3.2rem)',
              letterSpacing: '0.03em',
              animation: 'slide-up-fade 0.6s ease-out 1.35s both',
              textShadow: `0 4px 34px ${cfg.ringGlow}`,
            }}
          >
            {ranked!.team.name}
          </h2>

          <div
            className="relative z-10 mt-5 flex flex-col items-center"
            style={{ animation: 'slide-up-fade 0.6s ease-out 1.6s both' }}
          >
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-60">Overall</p>
            <p
              className="font-black leading-none mt-1"
              style={{
                fontSize: kind === 'first'
                  ? 'clamp(2.4rem, 7vw, 5.5rem)'
                  : kind === 'second'
                    ? 'clamp(2.2rem, 6.5vw, 5rem)'
                    : kind === 'third'
                      ? 'clamp(2rem, 6vw, 4.4rem)'
                      : 'clamp(1.6rem, 5vw, 3.6rem)',
                color: cfg.labelColor,
                textShadow: `0 0 30px ${cfg.ringGlow}`,
                letterSpacing: '0.02em',
              }}
            >
              {ranked!.total.toLocaleString()} <span className="text-white/70 font-light">pts</span>
            </p>
          </div>
        </>
      ) : (
        <p
          className="relative z-10 text-white/60 text-xl mt-6"
          style={{ animation: 'slide-up-fade 0.6s ease-out 0.5s both' }}
        >
          No team for this position yet.
        </p>
      )}
    </div>
  )
}

// ── Consolation group slide (3 teams revealed together) ──────────────────
function ConsolationGroupSlide({
  slideIdx, descriptor, teamsForSlide,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  teamsForSlide: RankedTeam[]
}) {
  const cfg = TIER.consolation
  const ranks = descriptor.teamRanks ?? []
  // Display teams in order matching ranks (e.g. [9, 8, 7]) — descending so the
  // first column shows the worst rank (ceremonial worst→best within the slide).
  const ordered = ranks
    .map((r, i) => ({ rank: r, team: teamsForSlide[i] }))
    .sort((a, b) => b.rank - a.rank)
  const photoSize = 180

  const titleText = ranks.length
    ? `🎖 HONORABLE MENTIONS · ${ordered.map(o => `#${o.rank}`).join(' · ')}`
    : '🎖 HONORABLE MENTIONS'

  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none z-0"
        style={{
          width: '160vmax',
          height: '160vmax',
          background: `conic-gradient(from 0deg, transparent 0deg, ${cfg.beamColor}33 18deg, transparent 40deg, transparent 170deg, ${cfg.beamColor}22 200deg, transparent 230deg, transparent 360deg)`,
          animation: 'award-spotlight 22s linear infinite',
          opacity: 0.7,
        }}
      />
      <Confetti count={cfg.confetti} slideKey={slideIdx} />

      <p
        className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] opacity-70"
        style={{ color: cfg.labelColor, animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        {cfg.preLabel}
      </p>

      <h1
        className="relative z-10 mt-3 mb-10 font-black leading-none"
        style={{
          fontSize: 'clamp(1.6rem, 5vw, 3.4rem)',
          letterSpacing: '0.05em',
          color: cfg.labelColor,
          textShadow: `0 0 30px ${cfg.labelColor}88`,
          animation: 'title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both',
        }}
      >
        {titleText}
      </h1>

      <div
        className="relative z-10 grid gap-x-10 gap-y-6 max-w-[min(95vw,1500px)] w-full"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, ordered.length)}, minmax(0, 1fr))` }}
      >
        {ordered.map((entry, i) => {
          const team = entry.team?.team
          return (
            <div
              key={`${entry.rank}-${team?.id ?? i}`}
              className="flex flex-col items-center"
              style={{ animation: `pop-bounce-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.5 + i * 0.18}s both` }}
            >
              <p
                className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.45em] mb-3"
                style={{ color: cfg.labelColor, opacity: 0.85 }}
              >
                #{entry.rank}
              </p>
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: `${photoSize}px`,
                  height: `${photoSize}px`,
                  borderRadius: '50%',
                  background: cfg.ringBg,
                  padding: cfg.ringWidth,
                  boxShadow: `0 0 50px ${cfg.ringGlow}, inset 0 0 18px rgba(0,0,0,0.3)`,
                }}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                  {team?.photo_url ? (
                    <img src={team.photo_url} alt={team.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-5xl text-white/40">👥</div>
                  )}
                </div>
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 select-none"
                  style={{
                    fontSize: '2.4rem',
                    filter: `drop-shadow(0 6px 14px ${cfg.ringGlow})`,
                  }}
                >
                  {cfg.medal}
                </div>
              </div>
              <p
                className="font-black text-white mt-6 leading-tight"
                style={{
                  fontSize: 'clamp(1rem, 1.8vw, 1.6rem)',
                  textShadow: `0 4px 24px ${cfg.ringGlow}`,
                }}
              >
                {team?.name ?? 'No team'}
              </p>
              {entry.team && (
                <p
                  className="font-black leading-none mt-3"
                  style={{
                    fontSize: 'clamp(1.2rem, 3vw, 2.2rem)',
                    color: cfg.labelColor,
                    textShadow: `0 0 24px ${cfg.ringGlow}`,
                    letterSpacing: '0.02em',
                  }}
                >
                  {entry.team.total.toLocaleString()} <span className="text-white/70 font-light text-base">pts</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Confetti ─────────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  '#fde047', '#facc15', '#f59e0b',
  '#a855f7', '#c084fc', '#8b5cf6',
  '#ec4899', '#f472b6',
  '#22d3ee', '#34d399',
  '#ef4444', '#f97316',
  '#e5e7eb', '#ffffff',
]

function Confetti({ count, slideKey }: { count: number; slideKey: number }) {
  const pieces = useMemo(() => (
    Array.from({ length: count }, (_, i) => ({
      id: `${slideKey}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.6 + Math.random() * 2.8,
      size: 5 + Math.random() * 10,
      rotate: Math.random() * 360,
      spin: 360 + Math.random() * 1080,
      drift: (Math.random() - 0.5) * 320,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      circle: Math.random() > 0.65,
    }))
  ), [count, slideKey])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {pieces.map(p => (
        <span
          key={p.id}
          className="absolute block"
          style={{
            left: `${p.left}%`,
            top: 0,
            width: `${p.size}px`,
            height: `${p.size * (p.circle ? 1 : 0.4)}px`,
            background: p.color,
            borderRadius: p.circle ? '50%' : '1px',
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-drift ${p.duration}s ${p.delay}s linear forwards`,
            boxShadow: `0 0 4px ${p.color}`,
            opacity: 0,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
