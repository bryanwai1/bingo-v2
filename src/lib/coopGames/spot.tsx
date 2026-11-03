import { useCallback, useEffect, useRef, useState } from 'react'
import {
  spotPuzzle, parseHotspots, pictureUrl, hotspotsUrl, hotspotBox, toImagePoint, judgeTap, remainingPause,
  WRONG_PAUSE_MS, type SpotAction, type SpotData, type SpotState, type TapOutcome,
} from './spotLogic.ts'
import type { CoopPuzzle } from './types.ts'

// Memory & Spot the Difference (PRD-006, DESIGN-004 sections 4 to 6).
// Player: Picture A and taps. Observer: Picture B, sees found marks, cannot tap.

const SAY: Record<TapOutcome, string> = {
  found: 'Found one!',
  wrong: 'Not a difference. Guesses are paused for a moment.',
  already: 'Already found. It does not count again.',
  paused: 'Wait for the pause to end.',
  locked: 'Locked: this game is completed.',
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: SpotData }

function useHotspots() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    setLoad({ kind: 'loading' })
    fetch(hotspotsUrl)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(j => { if (live) setLoad({ kind: 'ready', data: parseHotspots(j) }) })
      .catch(() => { if (live) setLoad({ kind: 'error' }) })
    return () => { live = false }
  }, [tries])
  return { load, retry: () => setTries(t => t + 1) }
}

const Board = ({ state, canAct, isPlayer: isPlayerProp, dispatch }: {
  state: SpotState; canAct: boolean; isPlayer?: boolean; dispatch(a: SpotAction): void
}) => {
  const { load, retry } = useHotspots()
  const isPlayer = isPlayerProp ?? canAct
  const [zoom, setZoom] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const stage = useRef<HTMLDivElement>(null)

  const left = remainingPause(state, now)
  useEffect(() => {
    if (state.wrongUntil <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [state.wrongUntil])

  const tap = useCallback((e: React.MouseEvent) => {
    if (load.kind !== 'ready') return
    if (!isPlayer) { setMsg('Only the player can move. Nothing changed.'); return }
    if (!canAct) { setMsg('Moves are paused right now.'); return }
    const rect = stage.current!.getBoundingClientRect()
    const { x, y } = toImagePoint(rect, e.clientX, e.clientY, load.data)
    const t = Date.now()
    const r = judgeTap(state, load.data, x, y, t)
    setNow(t)
    setMsg(SAY[r.outcome])
    if (r.action) dispatch(r.action)
  }, [load, isPlayer, canAct, state, dispatch])

  if (load.kind === 'loading') return <p className="text-center text-gray-300 py-8 font-bold" role="status">Loading the picture...</p>
  if (load.kind === 'error' || imgFailed) {
    return (
      <div role="alert" className="rounded-2xl p-4 text-center bg-red-400/10 border-2 border-red-300/40 text-red-300 font-bold">
        The picture could not load.
        <button type="button" onClick={() => { setImgFailed(false); retry() }} className="block mx-auto mt-2 min-h-[44px] px-4 underline">Try again</button>
      </div>
    )
  }

  const { data } = load
  const total = data.hotspots.length
  const solved = spotPuzzle.isSolved(state)
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-white font-black" aria-live="polite">{state.found.length} of {total} found</p>
        {isPlayer && !solved && (
          <button type="button" onClick={() => setZoom(z => !z)} aria-pressed={zoom}
            className="min-h-[44px] px-4 rounded-xl bg-white/15 border-2 border-white/30 text-white text-sm font-black">
            {zoom ? 'Zoom out' : 'Zoom in'}
          </button>
        )}
      </div>

      <div className={`relative rounded-2xl border-2 border-white/20 bg-black/40 ${zoom ? 'overflow-auto max-h-[70dvh]' : 'overflow-hidden'}`}>
        <div ref={stage} onClick={tap} className="relative select-none"
          style={{ width: zoom ? '250%' : '100%', touchAction: 'manipulation', cursor: isPlayer && !solved ? 'crosshair' : 'default' }}>
          <img src={pictureUrl(isPlayer ? 'player' : 'observer')} alt={isPlayer ? 'Picture A' : 'Picture B'}
            draggable={false} onError={() => setImgFailed(true)} className="block w-full h-auto pointer-events-none" />
          {data.hotspots.filter(h => state.found.includes(h.id)).map(h => (
            <span key={h.id} aria-label={`Difference ${h.id} found`} className="absolute rounded-full pointer-events-none"
              style={{ ...hotspotBox(h, data), aspectRatio: '1', transform: 'translate(-50%, -50%)',
                border: '4px solid #34d399', boxShadow: '0 0 0 3px #fff, 0 0 0 5px rgba(255,255,255,0.5)' }} />
          ))}
        </div>
        {left > 0 && isPlayer && (
          <div role="alert" className="absolute inset-x-0 top-0 p-3 bg-red-600/85 text-white text-center font-black">
            Wrong spot. Guesses paused.
            <div className="h-2 mt-2 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-white" style={{ width: `${(left / WRONG_PAUSE_MS) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-sm font-bold text-gray-200 min-h-[1.5rem]" role="status" aria-live="polite">
        {left > 0 && !isPlayer ? 'The player tapped a wrong spot. Guesses are paused.'
          : msg ?? (isPlayer ? 'Tap where Picture A differs. Your observers see Picture B.' : 'Tell the player where the differences are. Only the player can move.')}
      </p>
    </div>
  )
}

export const spot: CoopPuzzle<SpotState, SpotAction> = { ...spotPuzzle, View: Board }
