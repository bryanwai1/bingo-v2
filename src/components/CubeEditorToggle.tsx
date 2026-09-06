import { useState } from 'react'
import { CubeBoard } from './CubeBoard'
import type { BingoTask } from '../types/database'
import { TILES_PER_FACE, activeFaces } from '../lib/cubeFaces'

// Flat / cube switch for the board editor.
//
// Flat stays the default because dropping a card onto a rotating face is
// genuinely harder than dropping it on a grid — the 3D view is for checking
// the shape of a multi-face board, not for building it. Tapping a tile in cube
// view jumps you back to the flat editor on that face, so the two views work
// together rather than competing.

export function CubeEditorToggle({ faceCount, tasks, completedSlots, onPickFace, children }: {
  faceCount: number
  /** Every placed card, with sort_order carrying the raw slot number. */
  tasks: BingoTask[]
  completedSlots: Set<number>
  onPickFace: (face: number) => void
  /** The existing flat grid editor. */
  children: React.ReactNode
}) {
  const [view, setView] = useState<'flat' | 'cube'>('flat')

  const faces = activeFaces(faceCount).map(f =>
    Array.from({ length: TILES_PER_FACE }, (_, i) =>
      tasks.find(t => t.sort_order === f * TILES_PER_FACE + i) ?? null))

  return (
    <div>
      {faceCount > 1 && (
        <div className="flex gap-1 mb-3 p-1 rounded-xl w-fit" style={{ background: 'var(--a-surface-2)' }}>
          {(['flat', 'cube'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${
                view === v ? 'a-text' : 'a-text-2 hover:a-text'
              }`}
              style={view === v ? { background: 'var(--a-brand)' } : undefined}
            >
              {v === 'flat' ? '▦ Flat' : '🧊 Cube'}
            </button>
          ))}
        </div>
      )}

      {view === 'flat' || faceCount <= 1 ? children : (
        <div className="rounded-2xl p-4" style={{ background: '#0a1414' }}>
          <CubeBoard
            faces={faces}
            completedSlots={completedSlots}
            size={300}
            onTileClick={slot => {
              onPickFace(Math.floor(slot / TILES_PER_FACE))
              setView('flat')
            }}
          />
          <p className="text-center text-[11px] a-text-3 mt-3">
            Drag to spin · tap a tile to edit that face
          </p>
        </div>
      )}
    </div>
  )
}
