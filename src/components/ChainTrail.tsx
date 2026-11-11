// "Step 2 of 6" for a chained card: every card in the chain in order, with the
// ones this team has finished ticked and the current one marked, so a player
// opening any card in the chain can see where they are and how far there is to go.

export interface TrailStep { id: string; title: string; done: boolean }

export function ChainTrail({ steps, currentId, onOpen }: {
  steps: TrailStep[]
  currentId: string
  onOpen: (id: string) => void
}) {
  if (steps.length < 2) return null
  const at = steps.findIndex(s => s.id === currentId)
  return (
    <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-[11px] font-black uppercase tracking-widest text-white/60 mb-3">
        Step {at + 1} of {steps.length}
        {at === steps.length - 1 && ' · the treasure'}
      </p>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const current = s.id === currentId
          const last = i === steps.length - 1
          return (
            <li key={s.id}>
              <button
                onClick={() => { if (!current) onOpen(s.id) }}
                className={`w-full min-h-11 flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${current ? 'bg-emerald-400/20 ring-1 ring-emerald-300' : 'hover:bg-white/5'}`}
              >
                <span className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-xs font-black ${s.done ? 'bg-emerald-400 text-black' : current ? 'bg-white text-black' : 'bg-white/15 text-white/70'}`}>
                  {s.done ? '✓' : last ? '★' : i + 1}
                </span>
                <span className={`min-w-0 flex-1 text-sm font-bold leading-snug ${current ? 'text-white' : s.done ? 'text-white/70' : 'text-white/80'}`}>
                  {s.title}
                </span>
                {current && <span className="text-[10px] font-black uppercase text-emerald-300 shrink-0">You are here</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
