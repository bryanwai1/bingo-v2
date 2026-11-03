import type { CoopPuzzleLogic } from './session.ts'

// Memory & Spot the Difference (PRD-006). Pure logic: no React, no fetch.
// The session state is shared by everyone, so found marks, the count and the
// wrong-tap pause (an absolute time) reach observers and late joiners as is.

export const WRONG_PAUSE_MS = 3000   // DESIGN-004 section 4
export const TAP_TOLERANCE_PX = 22   // in image pixels, so it shrinks with the picture on a phone

export interface Hotspot { id: number; x: number; y: number; radius: number }
export interface SpotData { imageWidth: number; imageHeight: number; hotspots: Hotspot[] }

// encodeURI, not encodeURIComponent: a %26 in the path is not matched to the folder's "&" by the dev server.
const DIR = encodeURI('/grab/Memory & Spot the Difference')
export const hotspotsUrl = `${DIR}/hotspots.json`
/** Player sees A, observers see B. No other picture is ever requested. */
export const pictureUrl = (role: 'player' | 'observer') => `${DIR}/Picture_${role === 'player' ? 'A' : 'B'}.png`

/** Checks the shape of hotspots.json so a bad edit shows an error instead of a broken board. */
export function parseHotspots(json: unknown): SpotData {
  const j = json as Partial<SpotData> | null
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (!j || !num(j.imageWidth) || !num(j.imageHeight) || !Array.isArray(j.hotspots) || j.hotspots.length === 0
    || !j.hotspots.every(h => num(h?.id) && num(h?.x) && num(h?.y) && num(h?.radius))) {
    throw new Error('hotspots.json is not valid')
  }
  return { imageWidth: j.imageWidth!, imageHeight: j.imageHeight!, hotspots: j.hotspots.map(({ id, x, y, radius }) => ({ id, x, y, radius })) }
}

/** Position and size as percentages of the image, so it sits on the same spot at any display size. */
export const hotspotBox = (h: Hotspot, d: SpotData) => ({
  left: `${(h.x / d.imageWidth) * 100}%`,
  top: `${(h.y / d.imageHeight) * 100}%`,
  width: `${((h.radius * 2) / d.imageWidth) * 100}%`,
})

/** Screen tap -> image pixels, from the picture's own displayed rectangle (so zoom and scroll cancel out). */
export const toImagePoint = (
  rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number, d: SpotData,
) => ({ x: ((clientX - rect.left) / rect.width) * d.imageWidth, y: ((clientY - rect.top) / rect.height) * d.imageHeight })

export const hitTest = (d: SpotData, x: number, y: number, tolerance = TAP_TOLERANCE_PX): Hotspot | null =>
  d.hotspots.find(h => Math.hypot(x - h.x, y - h.y) <= h.radius + tolerance) ?? null

export interface SpotState { v: 1; found: number[]; need: number; wrongUntil: number }
export type SpotAction =
  | { type: 'hit'; id: number; need: number; now: number }
  | { type: 'miss'; now: number }

// A pause further away than the pause length came from a skewed clock: ignore it, so nobody is blocked longer than 3 s.
export const remainingPause = (s: SpotState, now: number) => {
  const d = s.wrongUntil - now
  return d > 0 && d <= WRONG_PAUSE_MS ? d : 0
}

const isSolved = (s: SpotState) => s.need > 0 && s.found.length >= s.need

export const spotPuzzle: CoopPuzzleLogic<SpotState, SpotAction> = {
  key: 'memory-spot',
  initState: () => ({ v: 1, found: [], need: 0, wrongUntil: 0 }),
  // Returns the same object when nothing changes (pause running, already found, solved).
  reduce: (s, a) => {
    if (isSolved(s) || remainingPause(s, a.now) > 0) return s
    if (a.type === 'miss') return { ...s, wrongUntil: a.now + WRONG_PAUSE_MS }
    if (s.found.includes(a.id)) return s
    return { ...s, found: [...s.found, a.id], need: a.need }
  },
  isSolved,
}

export type TapOutcome = 'found' | 'wrong' | 'already' | 'paused' | 'locked'

/** What a player's tap means. `action` is set only when the shared state should change. */
export function judgeTap(s: SpotState, d: SpotData, x: number, y: number, now: number): { outcome: TapOutcome; action?: SpotAction } {
  if (isSolved(s)) return { outcome: 'locked' }
  if (remainingPause(s, now) > 0) return { outcome: 'paused' }
  const h = hitTest(d, x, y)
  if (!h) return { outcome: 'wrong', action: { type: 'miss', now } }
  if (s.found.includes(h.id)) return { outcome: 'already' }
  return { outcome: 'found', action: { type: 'hit', id: h.id, need: d.hotspots.length, now } }
}
