// "Step 2 of 6" for a chained card: every card in the chain in order. Only the
// next card the team can actually do is a button; every other step is locked
// (with the reason) until the one before it is finished, so nobody taps a card
// that will refuse them.

export interface TrailStep { id: string; title: string; done: boolean }

const LockIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

export function ChainTrail({ steps, currentId, onOpen, hex = '#f59e0b' }: {
  /** The card's colour, so the open step matches the link buttons. */
  hex?: string
  steps: TrailStep[]
  currentId: string
  onOpen: (id: string) => void
}) {
  if (steps.length < 2) return null
  const at = steps.findIndex(s => s.id === currentId)
  // The one step that can be done now: the first that is not finished.
  const next = steps.findIndex(s => !s.done)
  return (
    <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-[11px] font-black uppercase tracking-widest text-white/60 mb-3">
        Step {at + 1} of {steps.length}
        {at === steps.length - 1 && ' · the treasure'}
      </p>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => {
          const current = s.id === currentId
          const last = i === steps.length - 1
          const badge = 'w-8 h-8 shrink-0 rounded-xl grid place-items-center text-sm font-black'

          if (current) return (
            <li key={s.id}>
              <div aria-current="step" className="w-full min-h-11 flex items-center gap-3 rounded-xl px-3 py-2 bg-emerald-400/20 ring-1 ring-emerald-300">
                <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-black bg-white text-black">{s.done ? '✓' : last ? '★' : i + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-white [overflow-wrap:anywhere]">{s.title}</span>
                <span className="text-[10px] font-black uppercase text-emerald-300 shrink-0">You are here</span>
              </div>
            </li>
          )

          if (s.done) return (
            <li key={s.id}>
              <div className="w-full min-h-11 flex items-center gap-3 rounded-xl px-3 py-2">
                <span className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-black bg-emerald-400 text-black">✓</span>
                <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-white/70 [overflow-wrap:anywhere]">{s.title}</span>
                <span className="text-[10px] font-black uppercase text-emerald-300 shrink-0">Done</span>
              </div>
            </li>
          )

          // The next card to do: the only tappable one.
          if (i === next) return (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s.id)}
                aria-label={`${s.title}: complete this first. Open this card`}
                className="group w-full rounded-2xl p-[2px] text-left transition-transform active:scale-[0.98]"
                style={{ background: `linear-gradient(145deg, ${hex}, ${hex}99)`, boxShadow: `0 4px 0 ${hex}77, 0 6px 16px ${hex}44` }}
              >
                <span className="rounded-[14px] px-3 py-2.5 flex items-center gap-3"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.88) 100%)' }}>
                  <span className={badge} style={{ background: `linear-gradient(135deg, ${hex}, ${hex}bb)`, color: '#111827' }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-gray-900 font-black text-base leading-tight [overflow-wrap:anywhere]">{s.title}</span>
                    <span className="block text-[11px] font-black uppercase tracking-wider" style={{ color: hex }}>Complete this first</span>
                  </span>
                  <span aria-hidden className="shrink-0 w-10 h-10 rounded-full grid place-items-center transition-transform group-hover:translate-x-0.5"
                    style={{ background: `linear-gradient(135deg, ${hex}, ${hex}bb)`, boxShadow: `0 2px 6px ${hex}66` }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                  </span>
                </span>
              </button>
            </li>
          )

          // Everything else is locked until the step before it is finished.
          return (
            <li key={s.id}>
              <div aria-disabled="true" aria-label={`${s.title}: locked. Complete step ${next + 1} first`}
                className="w-full rounded-2xl border border-white/15 bg-black/20 px-3 py-2.5 flex items-center gap-3 select-none">
                <span className={`${badge} bg-white/10 text-white/60`}><LockIcon size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-white/55 font-bold text-base leading-tight [overflow-wrap:anywhere]">{s.title}</span>
                  <span className="block text-[11px] font-black uppercase tracking-wider text-white/45">Complete step {next + 1} first</span>
                </span>
                <span aria-hidden className="shrink-0 w-10 h-10 rounded-full grid place-items-center bg-white/10 text-white/50"><LockIcon size={20} /></span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
