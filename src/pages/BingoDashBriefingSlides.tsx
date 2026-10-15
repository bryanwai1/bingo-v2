import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { useFullscreen } from '../hooks/useFullscreen'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { ParticleBackground } from '../components/ParticleBackground'
import type { BingoSection } from '../types/database'
import { bonusCheckpoints, bonusPoints, resolveBonusWindow, type BonusWindow } from '../lib/timeBonus'

/**
 * BINGO DASH — Participant briefing deck.
 * Opener + dark holding slide + how-to-play content slides (rules, line bonus,
 * speed bonus, submissions), a sample-board link, the player-join QR, and the
 * Observer QR closer. Only this account's own boards are listed.
 * Route: /bingo-dash/slides/briefing                       (section picker)
 *        /bingo-dash/slides/briefing/:sectionSlug          (deck for that section)
 */
export function BingoDashBriefingSlides() {
  const { sectionSlug } = useParams<{ sectionSlug?: string }>()
  if (!sectionSlug) return <SectionPicker />
  return <BriefingShow key={sectionSlug} sectionSlug={sectionSlug} />
}

// ── Section picker ───────────────────────────────────────────────────────
function SectionPicker() {
  const [sections, setSections] = useState<BingoSection[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const navigate = useNavigate()
  const { workingOwnerValue } = useBingoAuth()

  useEffect(() => {
    // Every board is readable, so keep only this account's own.
    supabase.from('bingo_sections').select('*').order('sort_order').then(({ data }) => {
      if (data) setSections(data.filter(s => (s.owner_id ?? null) === workingOwnerValue))
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
          📣 BRIEFING SLIDES
        </h1>
        <p className="text-gray-400 text-lg sm:text-xl mt-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
          Pick a compartment — Observer QR is section-specific
        </p>
      </div>

      <div className="relative z-10 flex flex-row flex-wrap gap-6 justify-center max-w-5xl">
        {sections.length === 0 ? (
          <p className="text-gray-500 text-sm">No compartments yet. Create one in the Bingo Dash admin first.</p>
        ) : sections.map((s, i) => {
          const isActive = s.id === activeId
          return (
            <button
              key={s.id}
              onClick={() => navigate(`/bingo-dash/slides/briefing/${s.slug}`)}
              className="animate-bounce-in flex flex-col items-center gap-4 px-10 py-10 rounded-3xl w-72 hover:scale-105 transition-transform"
              style={{
                animationDelay: `${0.25 + i * 0.08}s`,
                opacity: 0,
                animationFillMode: 'forwards',
                background: 'rgba(255,255,255,0.04)',
                border: `2px solid ${isActive ? '#a855f7' : '#a855f733'}`,
                boxShadow: isActive ? '0 0 32px rgba(168,85,247,0.25)' : 'none',
              }}
            >
              <div className="text-6xl animate-float" style={{ filter: isActive ? 'drop-shadow(0 0 20px #a855f7aa)' : 'none' }}>
                📣
              </div>
              <div className="text-center w-full">
                <h2 className="text-xl font-black text-white tracking-tight">{s.name}</h2>
                {isActive && (
                  <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#c084fc' }}>
                    ● Active now
                  </span>
                )}
              </div>
              <div className="w-full py-3 rounded-xl text-center text-sm font-black tracking-wider" style={{ background: '#a855f7', color: '#fff' }}>
                ▶ RUN BRIEFING
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Slide deck ───────────────────────────────────────────────────────────
type SlideKind =
  | 'main'
  | 'holding'
  | 'step1-roam'
  | 'step2-card'
  | 'step3-bingo'
  | 'step4-speed'
  | 'step5-time'
  | 'roles'
  | 'submissions'
  | 'how-to-submit'
  | 'preview-clue'
  | 'join-qr'
  | 'qr-wish'

const SLIDES: SlideKind[] = [
  'main',
  'holding',
  'step1-roam',
  'step2-card',
  'step3-bingo',
  'step4-speed',
  'step5-time',
  'roles',
  'submissions',
  'how-to-submit',
  'preview-clue',
  'join-qr',
  'qr-wish',
]

function BriefingShow({ sectionSlug }: { sectionSlug: string }) {
  const navigate = useNavigate()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [slideIdx, setSlideIdx] = useState(0)
  const { workingOwnerValue } = useBingoAuth()

  useEffect(() => {
    supabase.from('bingo_sections').select('*').eq('slug', sectionSlug).maybeSingle()
      .then(({ data }) => {
        // Someone else's board is treated as not found.
        setSection(data && (data.owner_id ?? null) === workingOwnerValue ? data : null)
        setLoaded(true)
      })
    // Live-sync board edits (timer, name, …) made in admin while the deck is open
    const channel = supabase
      .channel(`bingo-briefing-${sectionSlug}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `slug=eq.${sectionSlug}` }, ({ new: row }) => {
        setSection(row as BingoSection)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sectionSlug])

  const totalSlides = SLIDES.length
  const safeIdx = Math.min(slideIdx, totalSlides - 1)
  const kind = SLIDES[safeIdx]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setSlideIdx(i => Math.min(totalSlides - 1, i + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        setSlideIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Escape') {
        navigate('/bingo-dash/slides/briefing')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, totalSlides])

  if (!loaded) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading…</div>
  if (!section) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
        <p className="text-2xl font-black">Compartment not found.</p>
        <a href="/bingo-dash/slides/briefing" className="text-red-400 hover:text-red-300 underline">Pick another</a>
      </div>
    )
  }

  const isAccentSlide = kind === 'main'
  const slideStyle = isAccentSlide
    ? {
        background: 'linear-gradient(135deg, #7c3aed 0%, #3b0764 100%)',
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
      <SlideRenderer key={safeIdx} kind={kind} slideIdx={safeIdx} sectionSlug={sectionSlug} sectionName={section.name} timerSeconds={section.timer_seconds ?? 0} bonusWindow={resolveBonusWindow(null, section)} />

      {/* Top nav */}
      <div className="absolute top-5 left-6 right-6 flex items-center justify-between text-[11px] text-white/60 font-semibold uppercase tracking-[0.25em] z-40">
        <a
          href="/bingo-dash/slides/briefing"
          onClick={e => e.stopPropagation()}
          className="hover:text-white transition-colors"
        >
          ← Briefing Home
        </a>
        <span className="hidden sm:inline">{section.name} · Slide {safeIdx + 1} / {totalSlides}</span>
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
              background: i <= safeIdx ? (isAccentSlide ? '#fff' : '#fbbf24') : 'rgba(255,255,255,0.18)',
              boxShadow: i === safeIdx ? `0 0 10px ${isAccentSlide ? '#fff' : '#fbbf24'}` : 'none',
              transform: i === safeIdx ? 'scale(1.4)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* Back button */}
      {safeIdx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setSlideIdx(i => Math.max(0, i - 1)) }}
          className="absolute bottom-10 left-8 z-40 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-[0.3em] font-bold"
        >
          ← Back
        </button>
      )}

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-white/40 uppercase tracking-[0.35em] z-40 font-semibold pointer-events-none">
        {safeIdx < totalSlides - 1 ? '▶ Click / Space / → to continue' : '✦ End of Briefing · Esc to exit'}
      </div>
    </div>
  )
}

// ── Slide router ─────────────────────────────────────────────────────────
function SlideRenderer({ kind, slideIdx, sectionSlug, sectionName, timerSeconds, bonusWindow }: {
  kind: SlideKind; slideIdx: number; sectionSlug: string; sectionName: string; timerSeconds: number; bonusWindow: BonusWindow
}) {
  switch (kind) {
    case 'main':           return <MainSlide slideIdx={slideIdx} sectionName={sectionName} sectionSlug={sectionSlug} />
    case 'holding':        return <HoldingSlide slideIdx={slideIdx} />
    case 'step1-roam':     return <Step1RoamSlide slideIdx={slideIdx} />
    case 'step2-card':     return <Step2CardSlide slideIdx={slideIdx} />
    case 'step3-bingo':    return <Step3BingoSlide slideIdx={slideIdx} />
    case 'step4-speed':    return <Step4SpeedSlide slideIdx={slideIdx} window={bonusWindow} />
    case 'step5-time':     return <Step5TimeSlide slideIdx={slideIdx} timerSeconds={timerSeconds} />
    case 'roles':          return <RolesSlide slideIdx={slideIdx} />
    case 'submissions':    return <SubmissionTypesSlide slideIdx={slideIdx} />
    case 'how-to-submit':  return <HowToSubmitSlide slideIdx={slideIdx} />
    case 'preview-clue':   return <PreviewClueSlide slideIdx={slideIdx} />
    case 'join-qr':        return <JoinQrSlide slideIdx={slideIdx} sectionSlug={sectionSlug} sectionName={sectionName} />
    case 'qr-wish':        return <QrWishSlide slideIdx={slideIdx} sectionSlug={sectionSlug} sectionName={sectionName} />
  }
}

// ── 1. Main slide (opener) ───────────────────────────────────────────────
// Boards with a client logo in public/logos get it on the opener; others 🎯.
const SECTION_LOGOS: Record<string, string> = {
  dexcom: '/logos/dexcom.png',
}

function MainSlide({ slideIdx, sectionName, sectionSlug }: { slideIdx: number; sectionName: string; sectionSlug: string }) {
  const logo = SECTION_LOGOS[sectionSlug]
  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      {/* Soft animated blobs */}
      <div className="absolute pointer-events-none z-0" style={{
        top: '-10%', left: '-15%', width: '60vw', height: '60vw',
        background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
        filter: 'blur(40px)', animation: 'medal-pulse 6s ease-in-out infinite',
      }} />
      <div className="absolute pointer-events-none z-0" style={{
        bottom: '-15%', right: '-10%', width: '55vw', height: '55vw',
        background: 'radial-gradient(circle, rgba(255,184,28,0.16) 0%, transparent 70%)',
        filter: 'blur(48px)', animation: 'medal-pulse 8s ease-in-out 1s infinite',
      }} />

      {logo ? (
        <div className="relative z-10 mb-8 bg-white rounded-3xl px-10 py-7 shadow-2xl" style={{
          animation: 'pop-bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}>
          <img src={logo} alt={sectionName} style={{ width: 'min(60vw, 420px)', height: 'auto', display: 'block' }} />
        </div>
      ) : (
        <div className="relative z-10 mb-6 text-8xl" style={{
          animation: 'pop-bounce-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both',
          filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.55))',
        }}>
          🎯
        </div>
      )}

      <h1 className="relative z-10 font-black leading-[0.92] text-white" style={{
        fontSize: 'clamp(2.4rem, 8.5vw, 7rem)',
        letterSpacing: '0.035em',
        textShadow: '0 4px 30px rgba(0,0,0,0.45)',
        animation: 'title-slam 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both',
      }}>
        BINGO DASH
      </h1>

      {!logo && (
        <p className="relative z-10 mt-6 text-white/95 font-black uppercase" style={{
          fontSize: 'clamp(1.4rem, 3.4vw, 2.6rem)',
          letterSpacing: '0.35em',
          animation: 'slide-up-fade 0.7s ease-out 0.85s both',
        }}>
          {sectionName}
        </p>
      )}

      <div className="relative z-10 mt-6 mx-auto" style={{
        width: 60, height: 2, background: 'rgba(255,255,255,0.65)',
        animation: 'slide-up-fade 0.6s ease-out 1.05s both',
      }} />

      <p className="relative z-10 mt-6 text-white/85 font-bold uppercase" style={{
        fontSize: 'clamp(0.85rem, 1.4vw, 1.05rem)',
        letterSpacing: '0.4em',
        animation: 'slide-up-fade 0.7s ease-out 1.25s both',
      }}>
        Participant Briefing
      </p>
    </div>
  )
}

// ── 2. Holding slide (gold animated) ─────────────────────────────────────
function HoldingSlide({ slideIdx }: { slideIdx: number }) {
  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 award-slide-enter">
      <div className="absolute top-1/2 left-1/2 pointer-events-none z-0" style={{
        width: '160vmax', height: '160vmax',
        background: `conic-gradient(from 0deg, transparent 0deg, #fcd34d22 18deg, transparent 40deg, transparent 170deg, #fcd34d22 200deg, transparent 230deg, transparent 360deg)`,
        animation: 'award-spotlight 26s linear infinite',
        opacity: 0.55,
      }} />

      <p className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] text-amber-200/80"
         style={{ animation: 'slide-down-fade 0.55s ease-out 0.15s both' }}>
        Welcome, Players
      </p>

      <h1 className="relative z-10 mt-3 font-black leading-none animate-gold-title" style={{
        fontSize: 'clamp(3rem, 11vw, 9rem)',
        letterSpacing: '0.05em',
        animation: 'title-slam 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both, gold-sweep 6s linear 0.3s infinite',
      }}>
        Briefing
      </h1>

      <p className="relative z-10 mt-10 text-white/40 text-xs uppercase tracking-[0.4em]"
         style={{ animation: 'slide-up-fade 0.6s ease-out 1.0s both' }}>
        ▶ Continue for the rules
      </p>
    </div>
  )
}

// ── Step 1 · Roam the route ──────────────────────────────────────────────
function Step1RoamSlide({ slideIdx }: { slideIdx: number }) {
  const cards = [
    {
      icon: '📍',
      tint: '#22c55e',
      label: 'Anchored tasks',
      pill: 'Go to the spot',
      body: 'A specific location around the route. You scan the QR there to unlock the task.',
      examples: ['Statue · Bridge · Plaza'],
    },
    {
      icon: '🌐',
      tint: '#38bdf8',
      label: 'Anywhere tasks',
      pill: 'Do it from any spot',
      body: 'No location required. Open the tile, do the activity, submit — wherever you are.',
      examples: ['Group selfie · Trivia · Word puzzle'],
    },
  ]
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step 1" title="Roam the Route" beam="#86efac">
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full mx-auto">
        {cards.map((c, i) => (
          <div key={c.label}
               className="p-7 rounded-3xl border-2 flex flex-col gap-4 text-left"
               style={{
                 borderColor: `${c.tint}55`,
                 background: `linear-gradient(160deg, ${c.tint}22 0%, rgba(0,0,0,0.42) 100%)`,
                 boxShadow: `0 0 36px ${c.tint}26`,
                 animation: `pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) ${0.45 + i * 0.15}s both`,
               }}>
            <div className="flex items-center gap-4">
              <div className="text-6xl leading-none" style={{ filter: `drop-shadow(0 0 14px ${c.tint}aa)` }}>{c.icon}</div>
              <div>
                <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.25em]"
                      style={{ background: `${c.tint}33`, color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {c.pill}
                </span>
                <h3 className="text-white font-black text-3xl tracking-tight leading-none mt-2">{c.label}</h3>
              </div>
            </div>
            <p className="text-white/85 text-base sm:text-lg leading-snug"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {c.body}
            </p>
            <p className="text-white/55 text-xs sm:text-sm italic"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {c.examples[0]}
            </p>
          </div>
        ))}

        <div className="md:col-span-2 mt-2 px-5 py-3.5 rounded-2xl border border-amber-300/40 bg-amber-300/10 text-amber-100 text-sm sm:text-base text-center"
             style={{ fontFamily: 'system-ui, -apple-system, sans-serif',
                      animation: 'slide-up-fade 0.6s ease-out 0.95s both' }}>
          <span className="font-black mr-2">🗺 Your team map</span>
          shows every anchored task. Anywhere tasks just appear on your bingo card.
        </div>
      </div>
    </ContentShell>
  )
}

// ── Step 2 · Pick a tile, play the task ──────────────────────────────────
function Step2CardSlide({ slideIdx }: { slideIdx: number }) {
  /**
   * 5x5 card pick & play animation.
   * Tiles transition through: locked → scanned → done in a wave, with one tile
   * highlighted as the "currently playing" tile. Loops continuously.
   */
  // Sequence each tile's start moment (seconds) so the play wave looks natural.
  const seq: number[] = [
    0.0, 1.4, 0.4, 2.6, 1.0,
    0.7, 2.1, 1.7, 0.2, 2.4,
    1.9, 0.9, 2.8, 1.3, 0.5,
    2.3, 1.6, 0.3, 2.0, 1.1,
    0.8, 2.5, 1.5, 0.6, 2.2,
  ]
  const cycle = 4.5
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step 2" title="Pick a Tile · Play the Task" beam="#a5f3fc">
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-center gap-10 max-w-6xl w-full mx-auto">
        {/* 5x5 animated grid */}
        <div className="grid grid-cols-5 gap-2 p-4 rounded-2xl bg-black/30 border border-white/10"
             style={{ animation: 'pop-bounce-in 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s both' }}>
          {seq.map((delay, i) => (
            <div key={i} className="relative flex items-center justify-center rounded-md border-2"
                 style={{
                   width: 64, height: 64,
                   background: 'rgba(255,255,255,0.04)',
                   borderColor: 'rgba(255,255,255,0.12)',
                   animation: `tile-cycle ${cycle}s linear ${delay}s infinite`,
                   fontFamily: 'system-ui, -apple-system, sans-serif',
                   fontWeight: 900, fontSize: 24, color: 'transparent',
                 }}>
              ✓
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-3 max-w-sm w-full">
          {[
            { kind: 'locked' as const,  label: 'Not visited', desc: 'A tile you have not opened yet' },
            { kind: 'scanned' as const, label: 'In progress', desc: 'You opened it — finish the task' },
            { kind: 'done' as const,    label: 'Done',      desc: 'Task completed' },
            { kind: 'bingo' as const,   label: 'Bingo Line', desc: 'Part of a 5-in-a-row line — earns a line bonus' },
          ].map((l, i) => (
            <div key={l.kind} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10"
                 style={{ animation: `slide-up-fade 0.5s ease-out ${0.65 + i * 0.1}s both` }}>
              <DemoTile kind={l.kind} small />
              <div className="text-left">
                <p className="text-white font-black text-base leading-tight">{l.label}</p>
                <p className="text-white/60 text-xs mt-0.5" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {l.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ContentShell>
  )
}

// ── Step 3 · Form Bingo lines ────────────────────────────────────────────
function Step3BingoSlide({ slideIdx }: { slideIdx: number }) {
  /**
   * Animated line-bonus ladder. The grid fills row → row → diagonal in waves,
   * and the card on the side ticks up: +100 · +200 · +300 · +400 · +500
   */
  // Map each tile (row*5+col) to which "wave" lights it (0-3). Wave 0 = first row,
  // wave 1 = second row, wave 2 = first column, wave 3 = main diagonal.
  const waveOf: number[] = [
    0, 0, 0, 0, 0,   // row 0 → wave 0 (1st bingo line)
    1, 1, 1, 1, 1,   // row 1 → wave 1 (2nd bingo line)
    2, 3, 4, 4, 4,   // partial row 2
    2, 4, 3, 4, 4,   // partial
    2, 4, 4, 4, 3,   // bottom-left col + diag end
  ]
  const ladder = [
    { lines: 1, mult: '+100', tint: '#fbbf24' },
    { lines: 2, mult: '+200', tint: '#fb923c' },
    { lines: 3, mult: '+300', tint: '#f97316' },
    { lines: 4, mult: '+400', tint: '#ef4444' },
    { lines: 5, mult: '+500', tint: '#dc2626' },
  ]
  const period = 6 // seconds per full cycle
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step 3" title="Form Bingo Lines" beam="#fcd34d">
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-center gap-8 max-w-6xl w-full mx-auto">
        {/* 5x5 grid that fills + flashes lines */}
        <div className="relative grid grid-cols-5 gap-2 p-4 rounded-2xl bg-black/30 border border-white/10"
             style={{ animation: 'pop-bounce-in 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s both' }}>
          {waveOf.map((wave, i) => {
            const baseDelay = wave * 1.2
            return (
              <div key={i} className="rounded-md border-2"
                   style={{
                     width: 60, height: 60,
                     background: 'rgba(255,255,255,0.04)',
                     borderColor: 'rgba(255,255,255,0.12)',
                     animation: `tile-fill-bingo ${period}s linear ${baseDelay}s infinite`,
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     fontFamily: 'system-ui, -apple-system, sans-serif',
                     fontWeight: 900, fontSize: 22,
                   }}
              />
            )
          })}
          {/* Bingo line flashes (overlay strokes) — row 0, row 1, col 0, diag */}
          <span className="absolute pointer-events-none rounded-full"
                style={{
                  left: 14, right: 14, top: 30, height: 6,
                  background: 'linear-gradient(90deg, #fde68a, #fbbf24)',
                  boxShadow: '0 0 18px #fbbf24cc',
                  animation: `bingo-line-flash ${period}s linear 1.0s infinite`,
                }} />
          <span className="absolute pointer-events-none rounded-full"
                style={{
                  left: 14, right: 14, top: 92, height: 6,
                  background: 'linear-gradient(90deg, #fed7aa, #fb923c)',
                  boxShadow: '0 0 18px #fb923ccc',
                  animation: `bingo-line-flash ${period}s linear 2.2s infinite`,
                }} />
          <span className="absolute pointer-events-none rounded-full"
                style={{
                  top: 14, bottom: 14, left: 30, width: 6,
                  background: 'linear-gradient(180deg, #f97316, #ef4444)',
                  boxShadow: '0 0 18px #f97316cc',
                  animation: `bingo-line-flash ${period}s linear 3.4s infinite`,
                }} />
          <span className="absolute pointer-events-none rounded-full"
                style={{
                  left: '6%', top: '6%', width: '128%', height: 6,
                  transform: 'rotate(45deg)', transformOrigin: 'top left',
                  background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                  boxShadow: '0 0 18px #dc2626cc',
                  animation: `bingo-line-flash ${period}s linear 4.6s infinite`,
                }} />
        </div>

        {/* Multiplier ladder */}
        <div className="flex flex-col gap-2.5 max-w-xs w-full">
          <p className="text-amber-200 font-black uppercase tracking-[0.3em] text-xs sm:text-sm text-center mb-1"
             style={{ fontFamily: 'system-ui, -apple-system, sans-serif',
                      animation: 'slide-up-fade 0.5s ease-out 0.5s both' }}>
            Line Bonus
          </p>
          {ladder.map((l, i) => (
            <div key={l.lines} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2"
                 style={{
                   borderColor: `${l.tint}66`,
                   background: `linear-gradient(90deg, ${l.tint}22 0%, rgba(0,0,0,0.4) 100%)`,
                   animation: `ladder-pulse ${period}s linear ${0.4 + i * 1.2}s infinite, slide-up-fade 0.5s ease-out ${0.6 + i * 0.08}s both`,
                 }}>
              <div className="flex items-center gap-2 text-left" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <span className="text-white font-black text-2xl tabular-nums">{l.lines}</span>
                <span className="text-white/65 text-xs uppercase tracking-wider">{l.lines === 1 ? 'line' : 'lines'}</span>
              </div>
              <span className="font-black text-2xl tabular-nums" style={{ color: l.tint, textShadow: `0 0 10px ${l.tint}88` }}>
                {l.mult}
              </span>
            </div>
          ))}
          <p className="text-white/55 text-[11px] text-center mt-1 italic"
             style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Every tile still scores its own points. Each new line pays a bigger bonus — up to 5 lines.
          </p>
        </div>
      </div>
    </ContentShell>
  )
}

// ── Step 4 · Speed bonus (window comes from the board's own default) ─────
const fmtClock = (mins: number) => {
  const total = Math.round(mins * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
const PCT_TINTS: Record<number, string> = { 150: '#34d399', 140: '#2dd4bf', 130: '#a3e635', 120: '#fbbf24', 110: '#fb923c' }

function Step4SpeedSlide({ slideIdx, window: w }: { slideIdx: number; window: BonusWindow }) {
  const steps = bonusCheckpoints(w)
  // A worked example that always follows this board's window, with two decimals.
  const exampleMins = Math.round(w.full + (w.timer - w.full) * 0.13)
  const examplePts = bonusPoints(100, exampleMins * 60_000, w)
  const sans = { fontFamily: 'system-ui, -apple-system, sans-serif' }
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step 4" title="Speed Bonus" beam="#6ee7b7">
      <div className="relative z-10 flex flex-col items-center gap-7 max-w-5xl w-full mx-auto">
        <div className="text-center" style={{ animation: 'pop-bounce-in 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s both' }}>
          <p className="font-black leading-none text-white"
             style={{ fontSize: 'clamp(3.5rem, 12vw, 8rem)', textShadow: '0 4px 24px rgba(52,211,153,0.55)' }}>
            150<span className="text-emerald-300" style={{ fontSize: '0.5em' }}>%</span>
          </p>
          <p className="text-white/80 text-base sm:text-xl font-black uppercase tracking-[0.2em] mt-2" style={sans}>
            Finish a tile within {w.full} min of opening it
          </p>
        </div>

        {/* The glide: 150% → base, checkpoints marked */}
        <div className="w-full px-4 py-5 rounded-3xl border-2 border-white/10 bg-black/30"
             style={{ animation: 'slide-up-fade 0.6s ease-out 0.7s both' }}>
          <div className="relative h-5 rounded-full overflow-hidden"
               style={{ background: 'linear-gradient(90deg, #34d399 0%, #34d399 ' + (w.full / w.timer) * 100 + '%, #fbbf24 70%, #f87171 100%)' }} />
          <div className="flex mt-2 text-[11px] sm:text-sm font-black" style={sans}>
            {steps.map((c, i) => {
              const from = i === 0 ? 0 : steps[i - 1].uptoMin
              return (
                <span key={c.pct} className="text-right" style={{ width: `${((c.uptoMin - from) / w.timer) * 100}%`, color: PCT_TINTS[c.pct] }}>
                  {c.pct}%
                  <span className="block text-white/50 font-bold">{i === 0 ? '≤' : ''}{fmtClock(c.uptoMin)}</span>
                </span>
              )
            })}
            <span className="flex-1 text-right text-white/80">
              Base
              <span className="block text-white/50 font-bold">{fmtClock(w.timer)}+</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {[
            { icon: '📉', title: 'It slides', body: `After ${w.full} min the bonus drops every second until ${w.timer} min.`, tint: '#fbbf24' },
            { icon: '🛟', title: 'Never below base', body: 'Run out of time? You still earn the tile’s full points.', tint: '#60a5fa' },
            { icon: '🔢', title: 'Every second counts', body: `Scores show 2 decimals — a 100-pt tile done in ${fmtClock(exampleMins)} earns ${examplePts.toFixed(2)}.`, tint: '#34d399' },
          ].map((c, i) => (
            <div key={c.title} className="p-5 rounded-2xl border-2"
                 style={{
                   borderColor: `${c.tint}55`,
                   background: `linear-gradient(160deg, ${c.tint}22 0%, rgba(0,0,0,0.4) 100%)`,
                   animation: `pop-bounce-in 0.55s cubic-bezier(0.34,1.56,0.64,1) ${0.95 + i * 0.12}s both`,
                 }}>
              <div className="text-4xl leading-none">{c.icon}</div>
              <p className="text-white font-black text-lg mt-2">{c.title}</p>
              <p className="text-white/75 text-sm mt-1 leading-snug" style={sans}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </ContentShell>
  )
}

// ── Step 5 · Beat the clock (duration comes from the board's own timer) ──
function Step5TimeSlide({ slideIdx, timerSeconds }: { slideIdx: number; timerSeconds: number }) {
  const minutes = Math.max(1, Math.round(timerSeconds / 60))
  const hours = minutes / 60
  const durationLabel = Number.isInteger(hours)
    ? `${hours} ${hours === 1 ? 'hour' : 'hours'} · one shot`
    : 'One shot · no extensions'
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step 5" title="Beat the Clock" beam="#fda4af">
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-5xl w-full mx-auto">
        {/* Big duration */}
        <div className="flex items-end justify-center gap-4 sm:gap-6"
             style={{ animation: 'pop-bounce-in 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s both' }}>
          <span className="text-7xl sm:text-8xl leading-none" style={{ filter: 'drop-shadow(0 0 18px #fda4afaa)' }}>⏱</span>
          <div className="text-left">
            <p className="text-white/65 text-xs sm:text-sm font-black uppercase tracking-[0.35em]"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>You have</p>
            <p className="font-black tabular-nums leading-[0.9] text-white"
               style={{
                 fontSize: 'clamp(4rem, 14vw, 10rem)',
                 textShadow: '0 4px 24px rgba(252,165,165,0.55)',
                 letterSpacing: '0.02em',
               }}>
              {minutes}<span className="text-amber-300 ml-3" style={{ fontSize: '0.4em', verticalAlign: 'middle' }}>MIN</span>
            </p>
            <p className="text-amber-200/85 text-base sm:text-lg font-black uppercase tracking-[0.3em] mt-1"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{durationLabel}</p>
          </div>
        </div>

        {/* What happens at zero */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          <div className="p-7 rounded-3xl border-2 text-center"
               style={{
                 borderColor: '#ef444466',
                 background: 'linear-gradient(160deg, #ef444433 0%, rgba(0,0,0,0.4) 100%)',
                 boxShadow: '0 0 40px #ef444433',
                 animation: 'pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.7s both',
               }}>
            <p className="text-red-200 text-xs sm:text-sm font-black uppercase tracking-[0.4em] mb-3"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>🛑 At zero</p>
            <p className="font-black text-white leading-none"
               style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', textShadow: '0 4px 24px rgba(239,68,68,0.55)' }}>
              Board Locks
            </p>
            <p className="text-white/70 text-sm sm:text-base mt-3"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              Submissions close. Bingo card freezes.
            </p>
          </div>

          <div className="p-7 rounded-3xl border-2 text-center"
               style={{
                 borderColor: '#fbbf2466',
                 background: 'linear-gradient(160deg, #fbbf2433 0%, rgba(0,0,0,0.4) 100%)',
                 boxShadow: '0 0 40px #fbbf2433',
                 animation: 'pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.85s both',
               }}>
            <p className="text-amber-200 text-xs sm:text-sm font-black uppercase tracking-[0.4em] mb-3"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>📣 Then</p>
            <p className="font-black text-white leading-none"
               style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', textShadow: '0 4px 24px rgba(251,191,36,0.55)' }}>
              Regroup
            </p>
            <p className="text-white/70 text-sm sm:text-base mt-3"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              A Time's Up alert appears in-app — follow it back to the meeting point.
            </p>
          </div>
        </div>

        <p className="text-white/70 text-sm sm:text-base px-5 py-3 rounded-2xl border border-white/15 bg-white/5"
           style={{ fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slide-up-fade 0.6s ease-out 1.1s both' }}>
          ⚡ Every tile also has its own speed-bonus timer — see Step 4.
        </p>
      </div>
    </ContentShell>
  )
}

function DemoTile({ kind, small = false }: { kind: 'locked' | 'scanned' | 'done' | 'bingo'; small?: boolean }) {
  const size = small ? 38 : 64
  const palette = {
    locked:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', icon: '', glow: '' },
    scanned: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.55)', icon: '•',  glow: '' },
    done:    { bg: 'rgba(255,255,255,0.92)', border: 'rgba(255,255,255,0.92)', icon: '✓',  glow: '' },
    bingo:   { bg: '#fbbf24',                 border: '#fde68a',               icon: '✓',  glow: '0 0 12px rgba(251,191,36,0.7)' },
  }[kind]
  const iconColor = kind === 'done' ? '#0a0a0a' : kind === 'bingo' ? '#1a0f00' : '#fff'
  return (
    <div
      className="rounded-md flex items-center justify-center font-black"
      style={{
        width: size, height: size,
        background: palette.bg, border: `2px solid ${palette.border}`,
        boxShadow: palette.glow, color: iconColor,
        fontSize: small ? 16 : 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {palette.icon}
    </div>
  )
}

// ── 5. Player vs Observer ────────────────────────────────────────────────
function RolesSlide({ slideIdx }: { slideIdx: number }) {
  const cards = [
    {
      icon: '🎯',
      title: 'Player',
      colour: '#a855f7',
      ringColour: '#d8b4fe',
      body: [
        'Joins a team of up to 4',
        'Enters the team\'s 4-digit password',
        'Scans, submits, and completes tasks',
        'Earns points & forms Bingo lines',
      ],
    },
    {
      icon: '👁',
      title: 'Observer',
      colour: '#2563eb',
      ringColour: '#93c5fd',
      body: [
        'Scans the Observer QR — no password',
        'Browses the live board read-only',
        'Cannot submit, scan, or complete',
        'Great for guests & facilitators',
      ],
    },
  ]
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Two Roles" title="Player vs Observer" beam="#a5f3fc">
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full mx-auto">
        {cards.map((c, i) => (
          <div key={c.title}
               className="p-7 rounded-3xl border-2 flex flex-col gap-4"
               style={{
                 borderColor: `${c.ringColour}55`,
                 background: `linear-gradient(160deg, ${c.colour}22 0%, rgba(0,0,0,0.4) 100%)`,
                 boxShadow: `0 0 40px ${c.colour}22`,
                 animation: `pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) ${0.5 + i * 0.15}s both`,
               }}>
            <div className="flex items-center gap-4">
              <div className="text-5xl" style={{ filter: `drop-shadow(0 0 12px ${c.colour}99)` }}>{c.icon}</div>
              <div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.4em]"
                   style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>Role</p>
                <h3 className="text-white font-black text-3xl tracking-tight leading-none">{c.title}</h3>
              </div>
            </div>
            <ul className="flex flex-col gap-2 text-left mt-2"
                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {c.body.map((b, j) => (
                <li key={j} className="flex items-start gap-2.5 text-white/85 text-sm sm:text-base">
                  <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: c.ringColour }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Stuck-or-logged-out escalation */}
        <div className="md:col-span-2 mt-2 px-6 py-5 rounded-2xl border-2 border-amber-300/45 bg-amber-300/10 text-left"
             style={{ fontFamily: 'system-ui, -apple-system, sans-serif',
                      animation: 'pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.95s both' }}>
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0" style={{ filter: 'drop-shadow(0 0 10px #fbbf24aa)' }}>🆘</div>
            <div className="flex-1">
              <p className="text-amber-200 font-black text-lg sm:text-xl leading-tight">
                Stuck, signed out, or something broke?
              </p>
              <p className="text-white/85 text-sm sm:text-base mt-1.5 leading-snug">
                Find the <span className="font-black text-white">nearest marshal</span> or
                <span className="font-black text-white"> tap the message button</span> on your board — we'll get you sorted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ContentShell>
  )
}

// ── 6. Submission Types ──────────────────────────────────────────────────
function SubmissionTypesSlide({ slideIdx }: { slideIdx: number }) {
  const types = [
    { icon: '📸', title: 'Photo', tint: '#f59e0b',
      body: 'Snap a photo that meets the brief and upload it. A marshal approves it before the tile turns Done.' },
    { icon: '🎥', title: 'Video', tint: '#ef4444',
      body: 'Record a short clip (up to 100 MB) and upload it. A marshal reviews it.' },
    { icon: '⌨', title: 'Text', tint: '#a855f7',
      body: 'Type your answer. A matching word or code unlocks the tile at once; a written answer is read and approved.' },
    { icon: '🔗', title: 'Link', tint: '#38bdf8',
      body: 'Paste a link to your work. A marshal opens it and approves.' },
    { icon: '👮', title: 'Marshal password', tint: '#22c55e',
      body: 'Find the marshal, enter their password in the app and tap Complete.' },
    { icon: '⚔️', title: 'Versus', tint: '#f472b6',
      body: 'Challenge another team. Pick who you faced and tap We won / We lost — the result is approved for you.' },
  ]
  return (
    <ContentShell slideIdx={slideIdx} pretitle="What You’ll Do" title="Submission Types" beam="#fcd34d">
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl w-full mx-auto">
        {types.map((t, i) => (
          <div key={t.title}
               className="p-5 rounded-3xl border-2 flex flex-col gap-2 text-left"
               style={{
                 borderColor: `${t.tint}55`,
                 background: `linear-gradient(160deg, ${t.tint}22 0%, rgba(0,0,0,0.35) 100%)`,
                 animation: `pop-bounce-in 0.55s cubic-bezier(0.34,1.56,0.64,1) ${0.5 + i * 0.12}s both`,
               }}>
            <div className="text-4xl leading-none" style={{ filter: `drop-shadow(0 0 12px ${t.tint}aa)` }}>{t.icon}</div>
            <h3 className="text-white font-black text-xl leading-tight">{t.title}</h3>
            <p className="text-white/80 text-sm sm:text-base leading-snug"
               style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {t.body}
            </p>
          </div>
        ))}
      </div>

    </ContentShell>
  )
}

// ── 7. How to Submit ─────────────────────────────────────────────────────
function HowToSubmitSlide({ slideIdx }: { slideIdx: number }) {
  const steps = [
    { n: '1', title: 'Tap a tile', body: 'Open any visible tile on your bingo card.' },
    { n: '2', title: 'Read the brief', body: 'Check what the task asks for and the points on offer.' },
    { n: '3', title: 'Do the task', body: 'Find the spot, do the activity, capture the photo, or solve the answer.' },
    { n: '4', title: 'Submit in-app', body: 'Upload the photo or video, type your answer, paste a link, or call the marshal over.' },
    { n: '5', title: 'Watch it turn Done', body: 'Once approved, the tile flips to ✓ and the score updates live.' },
  ]
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Step by Step" title="How to Submit" beam="#fcd34d">
      <div className="relative z-10 flex flex-col gap-3 max-w-4xl w-full mx-auto">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/10"
               style={{ animation: `slide-up-fade 0.5s ease-out ${0.45 + i * 0.1}s both` }}>
            <div className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl"
                 style={{
                   background: 'linear-gradient(160deg, #fbbf24 0%, #d97706 100%)',
                   color: '#1a0a00',
                   boxShadow: '0 0 18px rgba(251,191,36,0.45)',
                 }}>
              {s.n}
            </div>
            <div className="text-left">
              <p className="text-amber-200 font-black text-lg sm:text-xl leading-tight">{s.title}</p>
              <p className="text-white/80 text-sm sm:text-base mt-0.5"
                 style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ContentShell>
  )
}

// ── 7b. Preview a Clue · opens the sample board ─────────────────────────
const SAMPLE_BOARD_PATH = '/bingo-dash/sample'

function PreviewClueSlide({ slideIdx }: { slideIdx: number }) {
  const sans = { fontFamily: 'system-ui, -apple-system, sans-serif' }
  return (
    <ContentShell slideIdx={slideIdx} pretitle="Live Demo · Try It Now" title="Preview a Clue" beam="#c4b5fd">
      <div className="relative z-10 w-full max-w-md mx-auto" onClick={e => e.stopPropagation()} style={sans}>
        <a
          href={SAMPLE_BOARD_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-3xl border-2 px-8 py-10 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            borderColor: '#a855f788',
            background: 'linear-gradient(160deg, #a855f733 0%, rgba(0,0,0,0.45) 100%)',
            boxShadow: '0 0 36px #a855f755',
            animation: 'pop-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.4s both, preview-tile-pulse 2.4s ease-in-out infinite',
          }}
        >
          <div className="text-6xl mb-3" style={{ filter: 'drop-shadow(0 0 14px #a855f7cc)' }}>🎯</div>
          <p className="text-white/65 text-[10px] font-bold uppercase tracking-[0.4em] mb-1">Practice board</p>
          <p className="text-white text-2xl font-black leading-tight">Open the Sample Board</p>
          <span
            className="inline-block mt-5 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.3em] text-white"
            style={{ background: '#a855f7', boxShadow: '0 4px 0 #a855f777' }}
          >
            ▶ Opens in a new tab
          </span>
        </a>
        <p className="text-white/55 text-xs mt-4 italic">
          ✦ Tap a tile, read the brief and try it — nothing here counts toward the game.
        </p>
      </div>
    </ContentShell>
  )
}

/** The white QR card and its address, shared by the join and observer slides. */
function QrBlock({ url }: { url: string }) {
  return (
    <>
      <div className="bg-white p-5 rounded-3xl shadow-2xl"
           style={{
             animation: 'pop-bounce-in 0.75s cubic-bezier(0.34,1.56,0.64,1) 0.45s both',
             boxShadow: '0 20px 60px rgba(0,0,0,0.45), 0 0 40px rgba(255,184,28,0.25)',
           }}>
        {url && <QRCodeSVG value={url} size={230} level="H" />}
      </div>
      <p className="text-white/80 text-xs sm:text-sm font-mono break-all max-w-md"
         style={{ animation: 'slide-up-fade 0.6s ease-out 0.85s both' }}>
        {url}
      </p>
    </>
  )
}

// ── 8. Scan to join (players) ───────────────────────────────────────────
// The QR is built from this board's slug every time the slide renders, so it
// always points at the board that is open — rename or switch boards and it
// follows; there is no stored image to go stale.
function JoinQrSlide({ slideIdx, sectionSlug, sectionName }: {
  slideIdx: number; sectionSlug: string; sectionName: string
}) {
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/bingo-dash/play/${sectionSlug}`
    : ''
  return (
    <ContentShell slideIdx={slideIdx} pretitle={`Players · ${sectionName}`} title="Scan to Join" beam="#fcd34d">
      <div className="relative z-10 flex flex-col items-center gap-4">
        <QrBlock url={joinUrl} />
        <p className="text-white/75 text-sm sm:text-base max-w-xl"
           style={{ fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slide-up-fade 0.6s ease-out 1.05s both' }}>
          Open the camera, scan, pick your team and enter its 4-digit password. You are in!
        </p>
      </div>
    </ContentShell>
  )
}

// ── 9. Scan to watch (observers) + wish (closer) ───────────────────────
function QrWishSlide({ slideIdx, sectionSlug, sectionName }: {
  slideIdx: number; sectionSlug: string; sectionName: string
}) {
  const observerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/bingo-dash/play/${sectionSlug}?mode=observer`
    : ''
  return (
    <ContentShell slideIdx={slideIdx} pretitle={`Observers · ${sectionName}`} title="Scan to Watch the Board" beam="#fcd34d">
      <div className="relative z-10 flex flex-col items-center gap-4">
        <QrBlock url={observerUrl} />
        <p className="text-white/75 text-sm sm:text-base max-w-xl"
           style={{ fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slide-up-fade 0.6s ease-out 1.05s both' }}>
          No password needed — watch the live board, read-only.
        </p>
        <div className="mt-2 flex items-center gap-3 max-w-xl"
             style={{ animation: 'slide-up-fade 0.7s ease-out 1.25s both' }}>
          <span className="h-px flex-1 bg-white/40" />
          <p className="text-white font-black text-lg sm:text-2xl uppercase tracking-[0.25em] whitespace-nowrap"
             style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            🍀 Stay safe · Have fun
          </p>
          <span className="h-px flex-1 bg-white/40" />
        </div>
        <p className="text-white/85 text-sm sm:text-base font-light italic max-w-2xl"
           style={{ fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slide-up-fade 0.7s ease-out 1.4s both' }}>
          Wishing you a memorable, safe, and winning game of Bingo Dash.
        </p>
      </div>
    </ContentShell>
  )
}

// ── Shared content shell (dark purple style) ─────────────────────────────
function ContentShell({ slideIdx, pretitle, title, beam, children }: {
  slideIdx: number
  pretitle: string
  title: string
  beam: string
  children: React.ReactNode
}) {
  return (
    <div key={slideIdx} className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 sm:px-10 py-20 award-slide-enter overflow-hidden">
      <div className="absolute top-1/2 left-1/2 pointer-events-none z-0" style={{
        width: '160vmax', height: '160vmax',
        background: `conic-gradient(from 0deg, transparent 0deg, ${beam}33 18deg, transparent 40deg, transparent 170deg, ${beam}22 200deg, transparent 230deg, transparent 360deg)`,
        animation: 'award-spotlight 24s linear infinite',
        opacity: 0.6,
      }} />

      <p className="relative z-10 text-[11px] sm:text-xs font-bold uppercase tracking-[0.5em] text-amber-200/80"
         style={{ animation: 'slide-down-fade 0.55s ease-out 0.1s both' }}>
        {pretitle}
      </p>

      <h1 className="relative z-10 mt-3 mb-8 font-black leading-none animate-gold-title" style={{
        fontSize: 'clamp(2rem, 6vw, 4.5rem)',
        letterSpacing: '0.05em',
        animation: 'title-slam 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both, gold-sweep 6s linear 0.25s infinite',
      }}>
        {title}
      </h1>

      {children}
    </div>
  )
}

