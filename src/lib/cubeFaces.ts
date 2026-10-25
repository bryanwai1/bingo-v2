// Cube board geometry.
//
// A session opens 1, 2 or 6 faces. Each face is an ordinary 5x5 with the
// existing bingo line rules — deliberately unchanged, so a cube board is
// "more board", not a different game nobody can explain to a room. Points
// scale simply because there are more faces to complete.
//
//   slot 0..24    -> face 0
//   slot 25..49   -> face 1
//   ...
//   slot 125..149 -> face 5

export const TILES_PER_FACE = 25

export type FaceCount = 1 | 2 | 3 | 4 | 5 | 6

// Ordered so each added face is ADJACENT to the previous one. With the old
// Front/Back-first order, a two-face board rendered as two opposite panels
// floating apart rather than a corner — it did not read as a cube at all.
//   2 faces -> a corner
//   3 faces -> an open box
//   4 faces -> a ring you can spin right round
//   5 adds the top, 6 closes it
export const FACE_NAMES = [
  'Front', 'Right', 'Back', 'Left', 'Top', 'Bottom',
] as const

/** Colour per face so a player can tell at a glance which one they are on. */
export const FACE_COLORS = [
  '#2dd4bf', '#fbbf24', '#a78bfa', '#38bdf8', '#f472b6', '#4ade80',
] as const

export function slotFor(face: number, position: number): number {
  return face * TILES_PER_FACE + position
}

export function normaliseFaceCount(n: number | null | undefined): FaceCount {
  const v = Math.round(Number(n ?? 1))
  return (v >= 1 && v <= 6 ? v : 1) as FaceCount
}

/** The face indices actually in play for a board. */
export function activeFaces(faceCount: number | null | undefined): number[] {
  return Array.from({ length: normaliseFaceCount(faceCount) }, (_, i) => i)
}

export function faceName(i: number): string {
  return FACE_NAMES[i] ?? `Face ${i + 1}`
}

export function faceColor(i: number): string {
  return FACE_COLORS[i] ?? '#6b7280'
}

/**
 * CSS transform placing a face of a cube of the given size. Used by the
 * projector's rotating cube; the admin and player use flat grids because
 * hunting for a tile by rotating a cube on a phone is slower than scanning.
 */
export function faceTransform(i: number, size: number): string {
  const d = size / 2
  switch (i) {
    case 0: return `translateZ(${d}px)`                        // front
    case 1: return `rotateY(90deg) translateZ(${d}px)`         // right
    case 2: return `rotateY(180deg) translateZ(${d}px)`        // back
    case 3: return `rotateY(-90deg) translateZ(${d}px)`        // left
    case 4: return `rotateX(90deg) translateZ(${d}px)`         // top
    default: return `rotateX(-90deg) translateZ(${d}px)`       // bottom
  }
}
