import { stub } from './stub.tsx'
import { iconMatching } from './iconMatching.tsx'
import { spot } from './spot.tsx'
import type { CoopPuzzle } from './types.ts'

// One line per game key (see gameCards.ts); any other key falls back to the stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PUZZLES: Record<string, CoopPuzzle<any, any>> = {
  'icon-matching': iconMatching,
  'memory-spot': spot,
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FALLBACK: CoopPuzzle<any, any> = stub
export const getPuzzle = (key?: string): CoopPuzzle => (key && PUZZLES[key]) || FALLBACK
