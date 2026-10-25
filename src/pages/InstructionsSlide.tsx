import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { decks, getDeck, type Deck, type Point } from '../lib/instructionDecks'
import { useSetting } from '../hooks/useSettings'

export function InstructionsSlide() {
  const { deckId } = useParams<{ deckId: string }>()
  const deck = getDeck(deckId ?? 'flag-retrieval')
  if (!deck) return <Navigate to="/instructions" replace />
  // Keyed so switching decks starts the slide state fresh, and the hooks
  // below always run in the same order whether or not the deck exists.
  return <DeckSlides key={deck.id} deck={deck} />
}

function DeckSlides({ deck }: { deck: Deck }) {
  const effectiveId = deck.id

  const slides = deck.slides

  // Synced state — persisted in Supabase settings table, realtime across all devices
  const [syncedSlide, setSyncedSlide] = useSetting(`briefing-${effectiveId}-slide`, '0')
  const [syncedPoints, setSyncedPoints] = useSetting(`briefing-${effectiveId}-points`, '0')

  const currentSlide = Math.min(Number(syncedSlide) || 0, slides.length - 1)
  const visiblePoints = Math.min(Number(syncedPoints) || 0, slides[currentSlide]?.points.length ?? 0)

  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [slideKey, setSlideKey] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Track previous slide to detect direction for animation
  const prevSlideRef = useRef(currentSlide)
  useEffect(() => {
    if (currentSlide !== prevSlideRef.current) {
      setDirection(currentSlide > prevSlideRef.current ? 'right' : 'left')
      setSlideKey(k => k + 1)
      prevSlideRef.current = currentSlide
    }
  }, [currentSlide])

  const slide = slides[currentSlide]
  const isLastSlide = currentSlide === slides.length - 1

  const advance = useCallback(() => {
    if (isTransitioning) return
    if (visiblePoints < slide.points.length) {
      setSyncedPoints(String(visiblePoints + 1))
    } else if (!isLastSlide) {
      setIsTransitioning(true)
      setDirection('right')
      setTimeout(() => {
        setSyncedSlide(String(currentSlide + 1))
        setSyncedPoints('0')
        setSlideKey(k => k + 1)
        setIsTransitioning(false)
      }, 80)
    }
  }, [isTransitioning, visiblePoints, slide.points.length, isLastSlide, currentSlide, setSyncedSlide, setSyncedPoints])

  const goBack = useCallback(() => {
    if (isTransitioning) return
    if (visiblePoints > 0) {
      setSyncedPoints(String(visiblePoints - 1))
    } else if (currentSlide > 0) {
      setIsTransitioning(true)
      setDirection('left')
      const prevPoints = slides[currentSlide - 1].points.length
      setTimeout(() => {
        setSyncedSlide(String(currentSlide - 1))
        setSyncedPoints(String(prevPoints))
        setSlideKey(k => k + 1)
        setIsTransitioning(false)
      }, 80)
    }
  }, [isTransitioning, visiblePoints, currentSlide, slides, setSyncedSlide, setSyncedPoints])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') {
        e.preventDefault()
        advance()
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
        e.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [advance, goBack])

  const allPointsVisible = visiblePoints >= slide.points.length
  const progressPct = ((currentSlide + (allPointsVisible ? 1 : visiblePoints / slide.points.length)) / slides.length) * 100

  return (
    <div
      className="h-screen w-screen overflow-hidden select-none cursor-pointer relative flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${slide.gradientFrom}, ${slide.gradientVia}, ${slide.gradientTo})`,
        transition: 'background 0.5s ease',
      }}
      onClick={advance}
    >
      {/* Glow orb background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${slide.glowColor}, transparent)`,
          transition: 'background 0.6s ease',
        }}
      />

      {/* Top-left: Hub link + deck switcher */}
      <div className="absolute top-4 left-5 z-30 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <a
          href="/instructions"
          className="px-3 py-1.5 rounded-lg text-white/30 hover:text-white/70 text-sm font-medium transition-all"
        >
          ← Decks
        </a>
        <span className="text-white/10 text-sm">·</span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="px-3 py-1.5 rounded-lg text-white/40 hover:text-white text-sm font-bold transition-all flex items-center gap-1.5"
            style={{
              background: `${deck.accent}15`,
              border: `1.5px solid ${deck.accent}44`,
            }}
          >
            <span>{deck.icon}</span>
            <span>{deck.label}</span>
            <span className="text-xs opacity-60">▾</span>
          </button>
          {menuOpen && (
            <div
              className="absolute top-full left-0 mt-2 w-60 rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(12,12,20,0.96)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div className="px-3 py-2 text-white/30 text-[10px] font-black tracking-[0.2em] uppercase border-b border-white/10">
                Instruction Slides
              </div>
              {decks.map(d => (
                <a
                  key={d.id}
                  href={`/instructions/${d.id}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${
                    d.id === deck.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                  style={{
                    borderLeft: d.id === deck.id ? `3px solid ${d.accent}` : '3px solid transparent',
                  }}
                >
                  <span className="text-lg">{d.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-bold leading-tight">{d.label}</div>
                    <div className="text-white/40 text-[10px] leading-tight truncate">{d.tagline}</div>
                  </div>
                  {d.id === deck.id && (
                    <span className="text-white/40 text-xs">●</span>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide counter top-right */}
      <div className="absolute top-4 right-5 z-30 flex items-center gap-2">
        {slides.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === currentSlide ? 24 : 8,
              height: 8,
              background: i === currentSlide ? slide.accent : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div
        key={slideKey}
        className="relative z-10 flex flex-col items-center justify-center flex-1 px-8 pb-24"
        style={{
          animation: `${direction === 'right' ? 'slide-in-right' : 'slide-in-left'} 0.4s ease-out forwards`,
        }}
      >
        {/* Step label */}
        <div
          className="text-sm font-black tracking-[0.25em] uppercase mb-3 px-4 py-1.5 rounded-full"
          style={{
            color: slide.stepColor,
            background: `${slide.accent}22`,
            border: `1.5px solid ${slide.accent}55`,
          }}
        >
          {slide.stepLabel}
        </div>

        {/* Big icon */}
        <div
          className="text-8xl mb-4 animate-icon-entrance"
          style={{ filter: `drop-shadow(0 0 24px ${slide.glowColor})` }}
        >
          {slide.icon}
        </div>

        {/* Title */}
        <h1
          className="text-5xl md:text-7xl font-black text-center mb-8 animate-title-slam leading-none"
          style={{
            color: slide.titleColor,
            textShadow: `0 0 40px ${slide.glowColor}, 0 2px 0 rgba(0,0,0,0.5)`,
          }}
        >
          {slide.title}
        </h1>

        {/* QR note banner */}
        {slide.qrNote && (
          <div
            className="mb-6 px-6 py-3 rounded-2xl text-center animate-pulse-glow"
            style={{
              background: 'rgba(167,139,250,0.15)',
              border: '2px solid rgba(167,139,250,0.5)',
              color: '#e9d5ff',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            📌 Scan the QR code displayed on this screen to get started
          </div>
        )}

        {/* Points */}
        <div className="flex flex-col gap-3 w-full max-w-2xl">
          {slide.points.map((point, i) => (
            <div
              key={`${slideKey}-${i}`}
              className="animate-pop-in"
              style={{
                animationDelay: `0s`,
                animationFillMode: 'both',
                opacity: i < visiblePoints ? 1 : 0,
                pointerEvents: 'none',
                display: i < visiblePoints ? 'block' : 'none',
              }}
            >
              <PointCard point={point} accent={slide.accent} glowColor={slide.glowColor} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-5 gap-3">
        {/* Clicker hint */}
        <div className="flex items-center gap-2 text-white/40 text-sm font-medium">
          {allPointsVisible && !isLastSlide ? (
            <>
              <span className="animate-shimmer font-bold" style={{ color: slide.accent }}>
                Click or press SPACE to continue →
              </span>
            </>
          ) : isLastSlide && allPointsVisible ? (
            <span className="font-bold animate-shimmer" style={{ color: slide.accent }}>
              🎉 That's everything! Good luck out there!
            </span>
          ) : (
            <>
              <ClickIcon color={slide.accent} />
              <span>Click to reveal next step</span>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-2xl h-1.5 bg-white/10 rounded-full overflow-hidden mx-8">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${slide.accent}, ${slide.accent}88)`,
              boxShadow: `0 0 8px ${slide.accent}`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function PointCard({ point, accent, glowColor }: { point: Point; accent: string; glowColor: string }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${accent}44`,
        backdropFilter: 'blur(12px)',
        boxShadow: `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      <div
        className="text-3xl flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-xl"
        style={{
          background: `${accent}22`,
          border: `1.5px solid ${accent}44`,
          boxShadow: `0 0 12px ${glowColor}`,
        }}
      >
        {point.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-black text-xl leading-tight">{point.text}</div>
        {point.sub && (
          <div className="text-white/50 text-sm font-medium mt-0.5 leading-snug">{point.sub}</div>
        )}
      </div>
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
      />
    </div>
  )
}

function ClickIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 2C9 2 9 12 9 14C9 14 7 12 5.5 11.5C4 11 3 12 3.5 13C4 14 9 20 12 20C15 20 19 17 19 12V8L16 6V14M16 6L13 4M16 6V2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
