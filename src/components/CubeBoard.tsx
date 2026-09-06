import { useCallback, useEffect, useRef, useState } from 'react'
import { faceName, faceColor, TILES_PER_FACE } from '../lib/cubeFaces'
import type { BingoTask } from '../types/database'

// An interactive cube board.
//
// Drag to spin it freely, or press a face button to rotate that face to the
// front. Free rotation is the point — a board you can only watch is decoration,
// and the earlier auto-spinning version was exactly that. Momentum is
// deliberately absent: this gets grabbed mid-conversation in front of a room,
// so it should stop where it is let go.
//
// Faces are laid out on a cube of N sides even when N < 6; the unused sides
// are simply not rendered, so a 3-face board reads as an open shape rather
// than a cube with blank walls.

type Vec = { x: number; y: number }

const FACE_ANGLES: Vec[] = [
  { x: 0,   y: 0    },  // front
  { x: 0,   y: -90  },  // right
  { x: 0,   y: -180 },  // back
  { x: 0,   y: 90   },  // left
  { x: -90, y: 0    },  // top
  { x: 90,  y: 0    },  // bottom
]

function faceTransform(i: number, size: number): string {
  const d = size / 2
  switch (i) {
    case 0: return `translateZ(${d}px)`
    case 1: return `rotateY(180deg) translateZ(${d}px)`
    case 2: return `rotateY(-90deg) translateZ(${d}px)`
    case 3: return `rotateY(90deg) translateZ(${d}px)`
    case 4: return `rotateX(90deg) translateZ(${d}px)`
    default: return `rotateX(-90deg) translateZ(${d}px)`
  }
}

export function CubeBoard({
  faces, size = 380, completedSlots, onTileClick, showLabels = true,
}: {
  faces: (BingoTask | null)[][]
  size?: number
  completedSlots: Set<number>
  onTileClick?: (slot: number) => void
  showLabels?: boolean
}) {
  const [rot, setRot] = useState<Vec>({ x: -20, y: -28 })
  const [snapping, setSnapping] = useState(false)
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null)

  const onDown = (e: React.PointerEvent) => {
    setSnapping(false)
    drag.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  // Yaw limits for partial cubes: 1 face is nearly fixed, 2 sweeps one corner,
  // 3 sweeps an open box. From 4 faces on it is a closed ring, so free spin.
  // Faces sit at 0, -90, -180, 90 (front, right, back, left). The viewer may
  // swing to either side of the outermost face by a little, and no further.
  // Faces sit at 0, -90, -180, 90. Allow a little overshoot past the outermost
  // face so it can be viewed square-on, but not so far that you are staring
  // into the empty side of a partial cube.
  const MARGIN = 40
  const limitY: [number, number] | null =
    faces.length >= 4 ? null
    : faces.length === 3 ? [-180 - MARGIN, MARGIN]
    : faces.length === 2 ? [-90 - MARGIN, MARGIN]
    : [-MARGIN, MARGIN]

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    // Clamped on X so the cube cannot be tumbled upside down, which is
    // disorienting and makes the labels unreadable.
    const nx = Math.max(-80, Math.min(80, d.rx - (e.clientY - d.y) * 0.4))
    let ny = d.ry + (e.clientX - d.x) * 0.4
    // With fewer than four faces the far side is open, so free rotation just
    // spins you into empty space. Clamp to the arc that actually has faces.
    if (limitY) ny = Math.max(limitY[0], Math.min(limitY[1], ny))
    setRot({ x: nx, y: ny })
  }, [limitY])

  const onUp = useCallback(() => { drag.current = null }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMove, onUp])

  const snapTo = (i: number) => {
    setSnapping(true)
    const a = FACE_ANGLES[i]
    // Travel to the nearest equivalent angle rather than unwinding the whole
    // way round — spinning 340 degrees to move 20 looks broken.
    setRot(() => {
      // Snap to the face's own angle rather than the nearest multiple: with a
      // clamped arc there is only ever one valid position per face.
      const y = limitY ? Math.max(limitY[0], Math.min(limitY[1], a.y)) : a.y
      return { x: a.x, y }
    })
  }

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <div
        className="grid place-items-center touch-none cursor-grab active:cursor-grabbing"
        style={{ perspective: size * 3.5, width: size * 1.6, height: size * 1.6 }}
        onPointerDown={onDown}
      >
        <div
          className="relative"
          style={{
            width: size, height: size, transformStyle: 'preserve-3d',
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            transition: snapping ? 'transform .7s cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        >
          {faces.map((tiles, f) => (
            <div
              key={f}
              className="absolute inset-0 rounded-2xl overflow-hidden"
              style={{
                transform: faceTransform(f, size),
                background: 'rgba(8,18,18,0.96)',
                border: `2px solid ${faceColor(f)}77`,
                boxShadow: `0 0 50px ${faceColor(f)}44, inset 0 0 60px rgba(0,0,0,.5)`,
              }}
            >
              {showLabels && (() => {
                // Angle between this face and the camera; past 90 degrees we
                // are looking at its reverse and the text would read mirrored.
                const facing = ((FACE_ANGLES[f].y - rot.y) % 360 + 540) % 360 - 180
                if (Math.abs(facing) > 88) return null
                return (
                  <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest"
                       style={{ color: faceColor(f), background: `${faceColor(f)}1a` }}>
                    {faceName(f)}
                  </div>
                )
              })()}
              <div className="grid grid-cols-5 gap-1 p-2"
                   style={{ height: showLabels ? size - 28 : size }}>
                {Array.from({ length: TILES_PER_FACE }, (_, i) => {
                  const t = tiles?.[i]
                  const slot = f * TILES_PER_FACE + i
                  const done = completedSlots.has(slot)
                  return (
                    <button
                      key={i}
                      onClick={() => onTileClick?.(slot)}
                      disabled={!onTileClick}
                      className="rounded-md grid place-items-center text-[7px] font-black leading-none text-center px-0.5 overflow-hidden transition-transform hover:scale-105"
                      style={{
                        background: !t ? 'rgba(255,255,255,0.03)'
                          : done ? t.hex_code : `${t.hex_code}2e`,
                        border: `1px solid ${t ? `${t.hex_code}88` : 'rgba(255,255,255,0.07)'}`,
                        color: done ? '#fff' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {done ? '✓' : t ? t.title.slice(0, 12) : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {faces.map((tiles, f) => {
          const filled = tiles.filter(Boolean).length
          const doneOnFace = tiles.filter((t, i) =>
            t && completedSlots.has(f * TILES_PER_FACE + i)).length
          return (
            <button
              key={f}
              onClick={() => snapTo(f)}
              className="px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
              style={{
                background: `${faceColor(f)}1f`,
                border: `1.5px solid ${faceColor(f)}66`,
                color: faceColor(f),
              }}
            >
              {faceName(f)}
              <span className="opacity-60 ml-1.5">{doneOnFace}/{filled}</span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-white/30">Drag the cube to spin · tap a face to turn to it</p>
    </div>
  )
}
