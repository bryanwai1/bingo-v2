import { stubPuzzle, STUB_TAPS, type StubState, type StubAction } from './stubLogic.ts'
import type { CoopPuzzle } from './types.ts'

// Placeholder puzzle for slice 1. Slices 2 and 3 replace it with the real ones.
export const stub: CoopPuzzle<StubState, StubAction> = {
  ...stubPuzzle,
  View: ({ state, canAct, dispatch }) => (
    <div className="text-center">
      <p className="text-5xl font-black text-white mb-1" aria-live="polite">{state.taps} / {STUB_TAPS}</p>
      <p className="text-sm text-gray-300 mb-4">
        {canAct ? 'Tap the button. Your observers can see every tap.' : 'Only the player can move. You are watching.'}
      </p>
      {canAct && (
        <button type="button" onClick={() => dispatch({ type: 'tap' })}
          className="min-h-[60px] w-full rounded-2xl bg-white/15 border-2 border-white/30 text-white font-black uppercase tracking-wide active:scale-95">
          Tap
        </button>
      )}
    </div>
  ),
}
