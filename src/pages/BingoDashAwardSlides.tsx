import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks } from '../lib/boardCards'
import { useFullscreen } from '../hooks/useFullscreen'
import { ParticleBackground } from '../components/ParticleBackground'
import { FitBoard } from '../components/FitBoard'
import {
  buildAwardSlides,
  normalizeSlideOrder,
  groupLabel,
  mainBackground,
  CEREMONY_BACKGROUND,
  readSlideText,
  slideTextValue,
  type SlideText,
  type PlaceKind,
  DEFAULT_PRIZE_COUNTS,
  type AwardSlideDescriptor,
} from '../lib/awardSlides'
import type { BingoSection, BingoTeam, BingoScan, BingoTask, BingoAwardConfig, BingoDuel, BonusItem } from '../types/database'
import { rankTeams, formatScore, type TeamScore, type BoardTask } from '../lib/teamScore'

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
// The ceremony ranks on the SHARED score (src/lib/teamScore.ts). It used to
// carry its own copy, which had drifted from the projector's — no tiebreak,
// no duel time in the tie-break, and its own duplicated line table. The room
// could therefore watch one winner on the board and see another crowned.
type RankedTeam = TeamScore

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

  // bonus_points is the sum of bonus_breakdown, so a change made here is
  // booked as one "Award ceremony" line rather than leaving the two to drift.
  const writeBonus = async (teamId: string, next: number) => {
    const team = teams.find(t => t.id === teamId)
    const others: BonusItem[] = (team?.bonus_breakdown ?? []).filter(i => i.label !== CEREMONY_BONUS_LABEL)
    const adjustment = next - others.reduce((sum, i) => sum + (Number(i.points) || 0), 0)
    const breakdown = adjustment !== 0 ? [...others, { label: CEREMONY_BONUS_LABEL, points: adjustment }] : others
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, bonus_points: next, bonus_breakdown: breakdown } : t))
    const { error } = await supabase.from('bingo_teams')
      .update({ bonus_points: next, bonus_breakdown: breakdown }).eq('id', teamId)
    if (error) alert(`Could not save bonus: ${error.message}`)
  }

  const adjustBonus = (teamId: string, delta: number) => {
    const current = teams.find(t => t.id === teamId)?.bonus_points ?? 0
    void writeBonus(teamId, Math.max(0, current + delta))
  }

  const setBonus = (teamId: string, value: number) => {
    void writeBonus(teamId, Math.max(0, Math.floor(value)))
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

  // Live: admin edits and score changes reach a running show without a reload.
  const sectionId = section?.id
  useEffect(() => {
    if (!sectionId) return
    const refetch = {
      config: async () => {
        const { data } = await supabase.from('bingo_award_configs').select('*').eq('section_id', sectionId).maybeSingle()
        setConfig(data ?? null)
      },
      teams: async () => {
        const { data } = await supabase.from('bingo_teams').select('*').eq('section_id', sectionId).order('name')
        if (data) setTeams(data)
      },
      scans: async () => {
        const { data } = await supabase.from('bingo_scans').select('*')
        if (data) setScans(data)
      },
      duels: async () => {
        const { data } = await supabase.from('bingo_duels').select('*').eq('section_id', sectionId).eq('status', 'done')
        if (data) setDuels(data)
      },
    }
    const channel = supabase
      .channel(`award-show-${sectionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_award_configs', filter: `section_id=eq.${sectionId}` }, () => { void refetch.config() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_teams', filter: `section_id=eq.${sectionId}` }, () => { void refetch.teams() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_scans' }, () => { void refetch.scans() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_duels', filter: `section_id=eq.${sectionId}` }, () => { void refetch.duels() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [sectionId])

  const ranked: RankedTeam[] = useMemo(
    () => rankTeams({ teams, scans, boardTasks: gridTasks as BoardTask[], duels }),
    [teams, scans, gridTasks, duels],
  )

  const text: SlideText = useMemo(() => readSlideText(config?.slide_text), [config])
  const slides: AwardSlideDescriptor[] = useMemo(() => {
    const counts = config ?? DEFAULT_PRIZE_COUNTS
    // An editor-saved config may have removed the scoreboard / closing slide.
    const order = normalizeSlideOrder(config?.slide_order ?? null, counts, text.v !== 1)
    return buildAwardSlides(order)
  }, [config, text])

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
        else if (window.confirm('Leave the award show?')) navigate('/bingo-dash/slides/awards')
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
        background: current.kind === 'main'
          ? mainBackground(config?.main_bg)
          : mainBackground(text.closing?.bg),
        fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`,
      }
    : {
        background: CEREMONY_BACKGROUND,
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
        decimals={!!section.decimal_points}
        text={text}
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
                    onChange={e => setBonus(r.team.id, parseFloat(e.target.value) || 0)}
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

// ── Single slide renderer ─────────────────────────────────────────────────
const DEFAULT_LOGO_BG = '#ffffff'
const CEREMONY_BONUS_LABEL = 'Award ceremony'

/** Main / closing emblem: the default hexagon, nothing, or an uploaded image. */
function SlideLogo({ logo, bg }: { logo?: string; bg?: string }) {
  const custom = customLogo(logo)
  if (!custom) return null
  return (
    <div
      className="relative z-10 mb-6 rounded-2xl"
      style={{ background: bg || DEFAULT_LOGO_BG, padding: '10px 16px', animation: 'pop-bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}
    >
      <img src={custom} alt="" style={{ maxWidth: '220px', maxHeight: '110px', objectFit: 'contain', display: 'block' }} />
    </div>
  )
}

/** The uploaded logo URL, or null ("none", "default" and unset show no logo). */
function customLogo(logo?: string): string | null {
  return logo && logo !== 'none' && logo !== 'default' ? logo : null
}

/**
 * Text for a gold (background-clip) title. The gold fill is clipped to every
 * glyph, so an emoji came out as a solid gold square; emoji are drawn in their
 * own colours instead.
 */
function GoldText({ text }: { text: string }) {
  const parts = text.split(/(\p{Extended_Pictographic}+)/u)
  return (
    <>
      {parts.map((part, i) => i % 2 === 1
        ? <span key={i} style={{ WebkitTextFillColor: 'initial', color: 'initial', marginRight: '0.15em' }}>{part}</span>
        : part)}
    </>
  )
}

/** Window width, kept current, for choosing one or two columns. */
function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}
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
  slideIdx, descriptor, teamsForSlide, config, teams, ranked, decimals, text,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  teamsForSlide: RankedTeam[]
  config: BingoAwardConfig | null
  teams: BingoTeam[]
  ranked: RankedTeam[]
  /** Board's points format — the score carries a tiebreak fraction. */
  decimals: boolean
  text: SlideText
}) {
  if (descriptor.kind === 'main') return <MainSlide slideIdx={slideIdx} config={config} text={text} />
  if (descriptor.kind === 'intro') return <IntroSlide slideIdx={slideIdx} text={text} />
  if (descriptor.kind === 'holding') return <HoldingSlide slideIdx={slideIdx} text={text} />
  if (descriptor.kind === 'lineup') return <LineupSlide slideIdx={slideIdx} teams={teams} text={text} />
  if (descriptor.kind === 'scoreboard') return <ScoreboardSlide slideIdx={slideIdx} ranked={ranked} decimals={decimals} text={text} />
  if (descriptor.kind === 'closing') return <ClosingSlide slideIdx={slideIdx} config={config} text={text} />
  if (descriptor.kind === 'consolation_group') {
    return (
      <ConsolationGroupSlide
        slideIdx={slideIdx}
        descriptor={descriptor}
        teamsForSlide={teamsForSlide}
        decimals={decimals}
      />
    )
  }
  // The five places use the new PlaceSlide design; `consolation` keeps the
  // medal-ring PrizeSlide, which still suits honorable mentions.
  if (descriptor.kind !== 'consolation') {
    return (
      <PlaceSlide
        slideIdx={slideIdx}
        descriptor={descriptor}
        config={config}
        decimals={decimals}
        ranked={teamsForSlide[0] ?? null}
      />
    )
  }
  return (
    <PrizeSlide
      slideIdx={slideIdx}
      descriptor={descriptor}
      decimals={decimals}
      ranked={teamsForSlide[0] ?? null}
    />
  )
}

// ── Main slide (opener) ───────────────────────────────────────────────────
function MainSlide({ slideIdx, config, text }: { slideIdx: number; config: BingoAwardConfig | null; text: SlideText }) {
  // Blank fields show nothing — there is no built-in fallback text.
  const title = config?.main_title?.trim() || ''
  // Blank means no subtitle line — there is no built-in fallback.
  const subtitle = config?.main_subtitle?.trim() || ''
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

      <SlideLogo logo={text.logo} bg={text.logo_bg} />

      {title && (
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
      )}

      {subtitle && (
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
      )}

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
function IntroSlide({ slideIdx, text }: { slideIdx: number; text: SlideText }) {
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
        {slideTextValue(text, 'intro', 'pretitle')}
      </p>

      <h1
        className="relative z-10 mt-4 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(3rem, 11vw, 9rem)',
          letterSpacing: '0.08em',
          animation: 'title-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both, gold-sweep 6s linear 0.35s infinite',
        }}
      >
        <GoldText text={slideTextValue(text, 'intro', 'title')} />
      </h1>

      <p
        className="relative z-10 mt-6 text-white/80 text-xl sm:text-3xl font-light tracking-wider"
        style={{ animation: 'slide-up-fade 0.7s ease-out 1s both', fontStyle: 'italic' }}
      >
        {slideTextValue(text, 'intro', 'subtitle')}
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
function HoldingSlide({ slideIdx, text }: { slideIdx: number; text: SlideText }) {
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
        {slideTextValue(text, 'holding', 'pretitle')}
      </p>

      <h1
        className="relative z-10 mt-3 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(3rem, 11vw, 9rem)',
          letterSpacing: '0.05em',
          animation: 'title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
        }}
      >
        <GoldText text={slideTextValue(text, 'holding', 'title')} />
      </h1>

      <p
        className="relative z-10 mt-10 text-white/40 text-xs uppercase tracking-[0.4em]"
        style={{ animation: 'slide-up-fade 0.6s ease-out 1.0s both' }}
      >
        {slideTextValue(text, 'holding', 'hint')}
      </p>
    </div>
  )
}

// ── Lineup + scoreboard: fitted to the screen ─────────────────────────────
// Both used to be centred over the whole screen with fixed-size rows, so the
// top bar, progress dots and bottom hints floated over them and the last teams
// fell off the bottom. Now they reserve bands for that chrome and author the
// list at a fixed size inside FitBoard (the projector's fit), which scales it to
// the space left — every team on screen, at any team count or screen size.
const CHROME_TOP = 'pt-[88px]'
const CHROME_BOTTOM = 'pb-[64px]'

function SlideHeading({ pretitle, title, tone }: { pretitle: string; title: string; tone: string }) {
  return (
    <>
      <p
        className={`relative z-10 shrink-0 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] ${tone}`}
        style={{ animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}
      >
        {pretitle}
      </p>
      <h1
        className="relative z-10 shrink-0 mt-2 mb-5 font-black leading-none animate-gold-title"
        style={{
          fontSize: 'clamp(1.8rem, min(5vw, 7vh), 4rem)',
          letterSpacing: '0.05em',
          animation: 'title-slam 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
        }}
      >
        <GoldText text={title} />
      </h1>
    </>
  )
}

function Spotlight({ color, speed }: { color: string; speed: number }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none z-0"
      style={{
        width: '160vmax',
        height: '160vmax',
        background: `conic-gradient(from 0deg, transparent 0deg, ${color} 18deg, transparent 40deg, transparent 170deg, ${color} 200deg, transparent 230deg, transparent 360deg)`,
        animation: `award-spotlight ${speed}s linear infinite`,
        opacity: 0.6,
      }}
    />
  )
}

// ── Lineup slide: all teams with photos ───────────────────────────────────
const LINEUP_CELL = 200
const LINEUP_GAP = 28

function LineupSlide({ slideIdx, teams, text }: { slideIdx: number; teams: BingoTeam[]; text: SlideText }) {
  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  )
  const count = sorted.length
  const cols = Math.max(1, count <= 4 ? count : count <= 8 ? 4 : count <= 15 ? 5 : 6)
  const width = cols * LINEUP_CELL + (cols - 1) * LINEUP_GAP

  return (
    <div key={slideIdx} className={`absolute inset-0 flex flex-col items-center text-center px-8 ${CHROME_TOP} ${CHROME_BOTTOM} award-slide-enter`}>
      <Spotlight color="#a5f3fc22" speed={28} />
      <SlideHeading
        pretitle={slideTextValue(text, 'lineup', 'pretitle')}
        title={slideTextValue(text, 'lineup', 'title')}
        tone="text-cyan-200/80"
      />
      <div className="relative z-10 w-full flex-1 min-h-0 flex">
        {count === 0 ? (
          <p className="m-auto text-white/60 text-lg">No teams yet.</p>
        ) : (
          <FitBoard canvasMin={width} canvasMax={width} zoom={1}>
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${cols}, ${LINEUP_CELL}px)`, gap: `${LINEUP_GAP}px`, justifyContent: 'center' }}
            >
              {sorted.map((t, i) => (
                <div
                  key={t.id}
                  className="flex flex-col items-center gap-3"
                  style={{ animation: `pop-bounce-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.45 + i * 0.05}s both` }}
                >
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: 170,
                      height: 170,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #67e8f9 0%, #a5f3fc 35%, #ecfeff 55%, #a5f3fc 75%, #67e8f9 100%)',
                      padding: '5px',
                      boxShadow: '0 0 28px rgba(165,243,252,0.5), inset 0 0 14px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                      {t.photo_url ? (
                        <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-5xl text-white/40">👥</div>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-white/90 leading-tight text-xl">{t.name}</p>
                </div>
              ))}
            </div>
          </FitBoard>
        )}
      </div>
    </div>
  )
}

// ── Scoreboard slide: full ranked list of every team ──────────────────────
// Column range and the two-column switch mirror the projector: one column is
// bound by height, two by width, and two win from eight teams on wide screens.
const SB_COL_MIN = 760
const SB_COL_MAX = 1000
const SB_COL_GAP = 40
const SB_TWO_COL_FROM = 8
const SB_TWO_COL_MIN_WIDTH = 1024

function ScoreboardSlide({ slideIdx, ranked, decimals, text }: { slideIdx: number; ranked: RankedTeam[]; decimals: boolean; text: SlideText }) {
  const viewportWidth = useViewportWidth()
  const count = ranked.length
  const two = viewportWidth >= SB_TWO_COL_MIN_WIDTH && count >= SB_TWO_COL_FROM
  const half = Math.ceil(count / 2)
  const columns = two ? [ranked.slice(0, half), ranked.slice(half)] : [ranked]
  const cols = columns.length
  const canvasMin = cols * SB_COL_MIN + (cols - 1) * SB_COL_GAP
  const canvasMax = cols * SB_COL_MAX + (cols - 1) * SB_COL_GAP

  return (
    <div key={slideIdx} className={`absolute inset-0 flex flex-col items-center text-center px-6 ${CHROME_TOP} ${CHROME_BOTTOM} award-slide-enter`}>
      <Spotlight color="#86efac22" speed={28} />
      <SlideHeading
        pretitle={slideTextValue(text, 'scoreboard', 'pretitle')}
        title={slideTextValue(text, 'scoreboard', 'title')}
        tone="text-emerald-200/80"
      />
      <div className="relative z-10 w-full flex-1 min-h-0 flex">
        {count === 0 ? (
          <p className="m-auto text-white/60 text-lg">No teams yet.</p>
        ) : (
          <FitBoard canvasMin={canvasMin} canvasMax={canvasMax} zoom={1}>
            <div className="flex" style={{ gap: `${SB_COL_GAP}px` }}>
              {columns.map((col, ci) => (
                <div key={ci} className="flex-1 min-w-0 flex flex-col gap-3">
                  {col.map((r, j) => {
                    const i = ci * half + j
                    const rank = i + 1
                    const isPodium = rank <= 3
                    const podiumIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                    return (
                      <div
                        key={r.team.id}
                        className="flex items-center gap-4 rounded-2xl py-4 px-6"
                        style={{
                          background: isPodium
                            ? 'linear-gradient(90deg, rgba(253,224,71,0.18) 0%, rgba(253,224,71,0.05) 100%)'
                            : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isPodium ? 'rgba(253,224,71,0.45)' : 'rgba(255,255,255,0.1)'}`,
                          animation: `slide-up-fade 0.45s ease-out ${0.45 + i * 0.04}s both`,
                        }}
                      >
                        <span
                          className="font-black tabular-nums shrink-0 text-right text-[2rem]"
                          style={{ width: '2.4em', color: isPodium ? '#fde047' : 'rgba(255,255,255,0.55)' }}
                        >
                          {podiumIcon ?? `#${rank}`}
                        </span>
                        <div
                          className="rounded-full overflow-hidden bg-gray-900 shrink-0"
                          style={{
                            width: 68,
                            height: 68,
                            border: `3px solid ${isPodium ? '#fde047' : 'rgba(255,255,255,0.2)'}`,
                            boxShadow: isPodium ? '0 0 18px rgba(253,224,71,0.4)' : 'none',
                          }}
                        >
                          {r.team.photo_url ? (
                            <img src={r.team.photo_url} alt={r.team.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/40 text-2xl">👥</div>
                          )}
                        </div>
                        <p className="font-black text-white leading-tight flex-1 min-w-0 text-left truncate text-[2rem]">
                          {r.team.name}
                        </p>
                        <p
                          className="font-black tabular-nums shrink-0 text-[2rem]"
                          style={{
                            color: isPodium ? '#fde047' : '#fff',
                            textShadow: isPodium ? '0 0 18px rgba(253,224,71,0.5)' : 'none',
                          }}
                        >
                          {formatScore(r.total, decimals)}
                          <span className="text-white/50 font-light text-[0.6em] ml-1.5">pts</span>
                        </p>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </FitBoard>
        )}
      </div>
    </div>
  )
}

// ── Closing slide (ceremony end) ─────────────────────────────────────────
function ClosingSlide({ slideIdx, config, text }: { slideIdx: number; config: BingoAwardConfig | null; text: SlideText }) {
  // Its own text now; the title alone still defaults to the main slide's.
  const title = slideTextValue(text, 'closing', 'title', config?.main_title?.trim() || '')
  const subtitle = slideTextValue(text, 'closing', 'subtitle')
  const tagline = slideTextValue(text, 'closing', 'tagline')

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

      <SlideLogo logo={text.logo} bg={text.logo_bg} />

      <p
        className="relative z-10 text-white/80 font-bold uppercase mb-4"
        style={{
          fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)',
          letterSpacing: '0.4em',
          animation: 'slide-down-fade 0.7s ease-out 0.4s both',
        }}
      >
        {slideTextValue(text, 'closing', 'pretitle')}
      </p>

      {title && (
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
      )}

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
  slideIdx, descriptor, ranked, decimals,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  ranked: RankedTeam | null
  decimals: boolean
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
              {formatScore(ranked!.total, decimals)} <span className="text-white/70 font-light">pts</span>
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

// ── Place slides: 1st - 5th ──────────────────────────────────
//
// The five place slides ARE the artwork in public/award/<n>-place.png: a
// finished 1672x941 composition with four empty slots. So this renders the
// image and drops four values into it - no headline, laurels, stat boxes,
// spotlight or confetti are drawn in code, because the PNG already has them.
//
// The slots are measured from the artwork's own pixels and are identical in
// all five files, so one table serves every place. Everything is authored in
// those same artwork pixels and the whole canvas is scaled to fit, so a
// laptop and the ballroom projector show the same composition at different
// sizes rather than a reflowed one.

const CANVAS_W = 1672
const CANVAS_H = 941

/**
 * Slot rectangles in artwork pixels. Measured from the PNG, not eyeballed.
 *
 * The artwork ships with placeholder content baked in ("00", "0000",
 * "YOUR TEAM PHOTO HERE"), so a value slot must COVER its panel rather than
 * just draw on top of it - hence `fill`, sampled from the panel's interior.
 * Each panel is flat to within two levels, so a solid colour is invisible.
 */
const SLOTS = {
  // Measured to the artwork's white panel, inside the glowing frame.
  photo:  { left: 125, top: 317, width: 675, height: 430, radius: 14 },
  group:  { left: 871, top: 550, width: 295, height: 106, fill: 'rgb(233,232,237)', radius: 14 },
  points: { left: 1217, top: 550, width: 371, height: 106, fill: 'rgb(249,229,221)', radius: 14 },
  slogan: { left: 917, top: 736, width: 623, height: 70, fill: 'rgb(254,247,230)', radius: 10 },
}

/** The photo slot as CSS: rounded to match the panel's own corners. */
const photoBox = {
  left: SLOTS.photo.left, top: SLOTS.photo.top,
  width: SLOTS.photo.width, height: SLOTS.photo.height,
  borderRadius: SLOTS.photo.radius,
}

/** The artwork's own numeral colour, sampled from the placeholder digits. */
const INK = '#05132c'

/** Numerals do not inherit the ceremony's serif stack: 'Cinzel' is not loaded
 *  anywhere, so it resolves to Georgia on some machines and not others. */
const NUM_FONT = `system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

const PLACE_FILE: Record<PlaceKind, string> = {
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
}

function SlideCanvas({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center bg-black">
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          flex: '0 0 auto',
          position: 'relative',
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Photo precedence: per-place override -> the team's own photo. With neither,
 * the slide shows the ceremony logo instead (see PlaceSlide); a board whose
 * logo is set to "none" falls through to the artwork's own placeholder panel.
 */
function placePhoto(
  config: BingoAwardConfig | null,
  slideId: string,
  team: BingoTeam | null | undefined,
): string | null {
  const overrides = config?.slide_photos ?? {}
  return overrides[slideId] || team?.photo_url || null
}

/** Shrinks to stay on one line: a wrapped numeral in a fixed slot looks
 *  broken. 0.62 approximates the digit advance of NUM_FONT at weight 900. */
function fitText(value: string, slotWidth: number, max: number): number {
  return Math.max(18, Math.min(max, Math.floor((slotWidth - 24) / (value.length * 0.62))))
}

function SlotText({
  slot, value, max, weight = 900,
}: {
  slot: { left: number; top: number; width: number; height: number; fill: string; radius: number }
  value: string
  max: number
  weight?: number
}) {
  const { fill, radius, ...rect } = slot
  return (
    <div
      style={{
        position: 'absolute',
        ...rect,
        background: fill,
        borderRadius: radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: NUM_FONT,
        fontWeight: weight,
        color: INK,
        fontSize: fitText(value, slot.width, max),
        lineHeight: 1,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}
    >
      {value}
    </div>
  )
}

function PlaceSlide({
  slideIdx, descriptor, ranked, config, decimals,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  ranked: RankedTeam | null
  config: BingoAwardConfig | null
  decimals: boolean
}) {
  const kind = descriptor.kind as PlaceKind
  const team = ranked?.team
  const photo = placePhoto(config, descriptor.id, team)
  const logo = customLogo(readSlideText(config?.slide_text).logo)
  const slogan = config?.award_slogan?.trim() || ''

  return (
    <div key={slideIdx} className="absolute inset-0 award-slide-enter">
      <SlideCanvas>
        <img
          src={`/award/${PLACE_FILE[kind]}-place.png`}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {photo ? (
          <img
            src={photo}
            alt={team?.name ?? ''}
            style={{ position: 'absolute', ...photoBox, objectFit: 'cover' }}
          />
        ) : logo && (
          // No team photo: the ceremony logo on the main slide's colour.
          <div
            style={{
              position: 'absolute', ...photoBox, overflow: 'hidden',
              background: readSlideText(config?.slide_text).logo_bg || DEFAULT_LOGO_BG,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img src={logo} alt="" style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
          </div>
        )}

        {team && <SlotText slot={SLOTS.group} value={groupLabel(team.name)} max={88} />}
        {team && (
          <SlotText
            slot={SLOTS.points}
            value={formatScore(ranked!.total, decimals)}
            max={88}
          />
        )}
        {slogan && <SlotText slot={SLOTS.slogan} value={slogan} max={38} weight={800} />}
      </SlideCanvas>
    </div>
  )
}

// ── Consolation group slide (3 teams revealed together) ──────────────────
function ConsolationGroupSlide({
  slideIdx, descriptor, teamsForSlide, decimals,
}: {
  slideIdx: number
  descriptor: AwardSlideDescriptor
  teamsForSlide: RankedTeam[]
  decimals: boolean
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
                  {formatScore(entry.team.total, decimals)} <span className="text-white/70 font-light text-base">pts</span>
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
