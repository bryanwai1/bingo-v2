import { useEffect, useRef, useState } from 'react'
import { createIconMatching, cardLabel, iconSrc, VIEW_MS, type IconState, type IconAction } from './iconMatchingLogic.ts'
import type { CoopPuzzle } from './types.ts'

const NOTE_MS = 3500 // design note-ms

// The player never sees an icon (AC-5): icons are drawn only when !isPlayer.
const View: CoopPuzzle<IconState, IconAction>['View'] = ({ state, canAct, isPlayer = true, mySlot, dispatch }) => {
  const send = useRef(dispatch)
  send.current = dispatch // a new function each parent render must not restart the timer
  const [note, setNote] = useState(false)
  const [refused, setRefused] = useState('')
  const slot = mySlot === 1 ? 1 : 0
  const picks = state.picks ?? {}
  const mine = picks[String(slot)]
  const theirs = picks[String(1 - slot)]
  const missed = state.flipped.length === 2

  // The player's screen ends the viewing period; the new state reaches everyone through the session.
  useEffect(() => {
    if (!isPlayer || !canAct || !missed) return
    const t = setTimeout(() => send.current({ type: 'hide' }), VIEW_MS)
    return () => clearTimeout(t)
  }, [isPlayer, canAct, missed, state])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(false), NOTE_MS)
    return () => clearTimeout(t)
  }, [note])

  useEffect(() => {
    if (!refused) return
    const t = setTimeout(() => setRefused(''), NOTE_MS)
    return () => clearTimeout(t)
  }, [refused])

  const tap = (i: number) => {
    if (!isPlayer) { setNote(true); return }
    if (!canAct || missed || state.flipped.includes(i) || state.matched.includes(i)) return
    if (mine !== undefined) { setRefused('You already picked. Wait for the other player.'); return }
    if (theirs === i) { setRefused('The other player already picked that card. Choose another.'); return }
    dispatch({ type: 'pick', index: i, slot })
  }

  const msg = !isPlayer
    ? (state.last === 'match' ? 'The player found a match.' : missed ? 'No match. The player is looking at your answer.' : 'Tell the player what you see.')
    : state.last === 'match' ? 'It is a match!'
    : missed ? 'No match... ask your observers what they saw.'
    : mine !== undefined && theirs !== undefined ? 'Both picked.'
    : mine !== undefined ? `You picked ${cardLabel(mine, state.cols)}. Waiting for the other player.`
    : theirs !== undefined ? `The other player picked ${cardLabel(theirs, state.cols)}. Pick your card.`
    : 'Pick one card.'

  return (
    <div>
      <p className="text-center text-lg font-black text-white mb-3" aria-live="polite">{msg}</p>
      <div role="group" aria-label={`Icon Matching board, positions A1 to ${cardLabel(state.cards.length - 1, state.cols)}`}
        className="grid gap-2 mx-auto max-w-[440px]" style={{ gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))` }}>
        {state.cards.map((id, i) => {
          const matched = state.matched.includes(i)
          const up = state.flipped.includes(i)
          const label = cardLabel(i, state.cols)
          const pickTag = !isPlayer ? '' : mine === i ? ', your pick' : theirs === i ? ", other player's pick" : ''
          const picked = pickTag !== ''
          const face = !isPlayer && (up || matched)
          return (
            <button key={i} type="button" onClick={() => tap(i)} aria-disabled={!canAct}
              aria-label={`${label}${matched ? ', matched' : up ? ', flipped' : ''}${pickTag}`}
              className="relative aspect-square min-h-[44px] rounded-xl border-2 grid place-items-center overflow-hidden active:scale-95 transition-transform focus-visible:outline-[3px] focus-visible:outline-yellow-300"
              style={{
                borderColor: matched ? '#34d399' : up || mine === i && isPlayer ? '#fde047' : picked ? '#93c5fd' : 'rgba(255,255,255,.22)',
                background: face ? 'rgba(255,255,255,.94)' : '#00B14F',
                boxShadow: up || picked ? '0 0 0 3px rgba(253,224,71,.35)' : undefined,
              }}>
              {!isPlayer && (up || matched) && <img src={iconSrc(id)} alt="" className="w-[70%] h-[70%] object-contain" />}
              <span className={face ? 'absolute left-1.5 top-0.5 text-xs font-black text-gray-700' : 'text-lg font-black text-white'}>{label}</span>
              {picked && <span className="absolute right-1 bottom-1 text-[10px] font-black text-white/90">{mine === i ? 'You' : 'Other'}</span>}
              {matched && <span className="absolute right-1 bottom-1 w-5 h-5 rounded-full bg-emerald-400 text-emerald-950 text-xs font-black grid place-items-center">✓</span>}
            </button>
          )
        })}
      </div>
      {isPlayer && refused && <p className="mt-3 text-center text-sm text-gray-200" role="status">{refused}</p>}
      {!isPlayer && note && <p className="mt-3 text-center text-sm text-gray-200" role="status">Only the player can move. Nothing changed. You are watching.</p>}
    </div>
  )
}

export const iconMatching: CoopPuzzle<IconState, IconAction> = { ...createIconMatching(), View }
