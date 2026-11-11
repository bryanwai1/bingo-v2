import type { FC } from 'react'
import type { CoopPuzzleLogic } from './session.ts'

export interface CoopPuzzle<S = unknown, A = unknown> extends CoopPuzzleLogic<S, A> {
  /** Same component for player and observer; observers get canAct=false. */
  View: FC<{ state: S; canAct: boolean; isPlayer?: boolean; mySlot?: number | null; dispatch(a: A): void }>
}
