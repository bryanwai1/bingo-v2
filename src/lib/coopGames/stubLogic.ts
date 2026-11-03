import type { CoopPuzzleLogic } from './session.ts'

// Slice 1 stand-in puzzle: a counter that is solved after STUB_TAPS taps.
export const STUB_TAPS = 5
export interface StubState { v: 1; taps: number }
export type StubAction = { type: 'tap' }

export const stubPuzzle: CoopPuzzleLogic<StubState, StubAction> = {
  key: 'stub',
  initState: () => ({ v: 1, taps: 0 }),
  reduce: (s) => ({ ...s, taps: Math.min(STUB_TAPS, s.taps + 1) }),
  isSolved: (s) => s.taps >= STUB_TAPS,
}
