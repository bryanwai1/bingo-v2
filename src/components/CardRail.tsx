import { useState, type ReactNode } from 'react'
import { RAIL_ITEMS, type RailKey } from '../lib/cardRail'

/** A floating column of icons at the right edge. "+" adds a component that is not on the rail yet. */
export function CardRail({ keys, inUse, open, onOpen, onAdd }: {
  keys: RailKey[]
  inUse: Partial<Record<RailKey, boolean>>
  open: RailKey | null
  onOpen: (k: RailKey | null) => void
  onAdd: (k: RailKey) => void
}) {
  const [picker, setPicker] = useState(false)
  const rest = RAIL_ITEMS.filter(i => !keys.includes(i.key))
  const btn = 'relative w-11 h-11 rounded-xl border-2 flex items-center justify-center text-xl shadow-md transition-colors'
  return (
    <div className="fixed right-2 top-1/3 z-50 flex flex-col items-center gap-2" data-testid="card-rail">
      {keys.map(k => {
        const item = RAIL_ITEMS.find(i => i.key === k)!
        const active = open === k
        return (
          <button
            key={k} type="button" title={item.label} aria-label={item.label} aria-pressed={active}
            onClick={() => onOpen(active ? null : k)}
            className={`${btn} ${active ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-gray-300 hover:border-violet-400'}`}
          >
            <span aria-hidden>{item.icon}</span>
            {inUse[k] && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border-2 border-white" title="In use" />}
          </button>
        )
      })}
      {rest.length > 0 && (
        <div className="relative">
          <button
            type="button" title="Add a component" aria-label="Add a component" aria-expanded={picker}
            onClick={() => setPicker(p => !p)}
            className={`${btn} bg-white border-dashed border-gray-400 text-gray-500 font-black hover:border-violet-400 hover:text-violet-600`}
          >+</button>
          {picker && (
            <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white shadow-xl p-1.5">
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-gray-400">Add to this card</p>
              {rest.map(i => (
                <button
                  key={i.key} type="button"
                  onClick={() => { onAdd(i.key); onOpen(i.key); setPicker(false) }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-700 hover:bg-violet-50 text-left"
                >
                  <span aria-hidden>{i.icon}</span>{i.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Slide-out panel for one component. Closing it never clears the component's saved data. */
export function RailDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside
      role="dialog" aria-label={title}
      className="fixed inset-y-0 right-0 z-40 w-[28rem] max-w-full bg-gray-50 border-l border-gray-200 shadow-2xl overflow-y-auto"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 text-xl">×</button>
      </div>
      <div className="p-4 pr-16">{children}</div>
    </aside>
  )
}
