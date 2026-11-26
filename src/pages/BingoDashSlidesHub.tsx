import { ParticleBackground } from '../components/ParticleBackground'

type Slide = {
  href: string
  title: string
  subtitle: string
  icon: string
  accent: string
  available: boolean
}

const SLIDES: Slide[] = [
  {
    href: '/bingo-dash/colmar-intro',
    title: 'COLMAR BINGO HUNT',
    subtitle: 'Medieval town map · Team route reveal · Apr 2026',
    icon: '⚜',
    accent: '#e6b84a',
    available: true,
  },
  {
    href: '/bingo-dash/slides/briefing',
    title: 'BRIEFING SLIDES',
    subtitle: 'Participant rules · Roles · Submissions · Safety · Observer QR',
    icon: '📣',
    accent: '#DB0011',
    available: true,
  },
  {
    href: '/bingo-dash/slides/awards',
    title: 'AWARD SLIDES',
    subtitle: 'Ceremony · Consolation → Bronze → Silver → Gold',
    icon: '🏆',
    accent: '#fbbf24',
    available: true,
  },
]

export function BingoDashSlidesHub() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-x-hidden py-12">
      <ParticleBackground />

      <a href="/bingo-dash/admin" className="absolute top-6 left-6 z-20 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-widest font-semibold">
        ← Admin
      </a>

      <div className="relative z-10 text-center mb-14">
        <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tight animate-slide-up">
          EVENT SLIDES
        </h1>
        <p
          className="text-gray-400 text-lg sm:text-xl mt-3 animate-slide-up"
          style={{ animationDelay: '0.15s' }}
        >
          Bingo Dash · Pick an event intro
        </p>
      </div>

      <div className="relative z-10 flex flex-row gap-8 justify-center px-8 flex-wrap max-w-6xl">
        {SLIDES.map((s, i) => (
          <SlideCard key={s.href} slide={s} delay={`${0.25 + i * 0.1}s`} />
        ))}
      </div>
    </div>
  )
}

function SlideCard({ slide, delay }: { slide: Slide; delay: string }) {
  const { available, accent } = slide
  const CardInner = (
    <>
      <div
        className="text-6xl animate-float"
        style={{ color: accent, textShadow: `0 0 30px ${accent}66` }}
      >
        {slide.icon}
      </div>
      <div className="text-center">
        <h2 className="text-xl font-black text-white tracking-tight">{slide.title}</h2>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">{slide.subtitle}</p>
      </div>
      <div
        className="mt-2 w-full py-3 rounded-xl font-black text-center text-sm tracking-wider transition-all"
        style={{
          background: available ? accent : 'rgba(255,255,255,0.05)',
          color: available ? '#000' : '#6b7280',
          border: available ? 'none' : '1px dashed rgba(255,255,255,0.18)',
        }}
      >
        {available ? '▶ OPEN SLIDE' : 'COMING SOON'}
      </div>
    </>
  )

  const wrapperStyle: React.CSSProperties = {
    animationDelay: delay,
    opacity: 0,
    animationFillMode: 'forwards',
    background: 'rgba(255,255,255,0.04)',
    border: `2px solid ${accent}33`,
  }

  if (!available) {
    return (
      <div
        className="animate-bounce-in flex flex-col items-center gap-5 px-10 py-10 rounded-3xl w-72 opacity-60"
        style={wrapperStyle}
      >
        {CardInner}
      </div>
    )
  }

  return (
    <a
      href={slide.href}
      className="animate-bounce-in flex flex-col items-center gap-5 px-10 py-10 rounded-3xl w-72 hover:scale-105 transition-transform"
      style={wrapperStyle}
    >
      {CardInner}
    </a>
  )
}
