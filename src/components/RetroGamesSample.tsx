// Retro Game Speed Build — the three sample games teams must rebuild with AI.
//
// Hosts the ported canvas games from lib/retroGames.js. Teams play them first
// so they know the rules and the target quality before racing to rebuild
// Mario, Pac-Man and Donkey Kong with an AI builder.
//
// The player is portalled to <body>: the AI Team Building card wraps its
// contents in .animate-slide-up, and a transformed ancestor becomes the
// containing block for position:fixed, which would trap this inside the card.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gameChomp, gameBarrel, gameJump, type ArcadeGame, type ArcadeHandle } from '../lib/retroGames'

type Entry = {
  key: string
  emoji: string
  name: string
  sub: string
  col: string
  run: ArcadeGame
}

const GAMES: Entry[] = [
  { key: 'jump', emoji: '🍄', name: 'Super Jumpman', sub: 'the Mario one', col: '#ef4444', run: gameJump },
  { key: 'chomp', emoji: '👻', name: 'Chomp Maze', sub: 'the Pac-Man one', col: '#fbbf24', run: gameChomp },
  { key: 'barrel', emoji: '🦍', name: 'Barrel Climb', sub: 'the Donkey Kong one', col: '#a78bfa', run: gameBarrel },
]

export function RetroGamesSample() {
  const [playing, setPlaying] = useState<Entry | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<HTMLParagraphElement>(null)
  const handleRef = useRef<ArcadeHandle | null>(null)

  const close = useCallback(() => setPlaying(null), [])

  // Start the chosen game once its canvas is on screen, and always stop the
  // previous one — each game binds its own window key listeners.
  useEffect(() => {
    if (!playing) return
    const cv = canvasRef.current, hud = hudRef.current, keys = keysRef.current
    if (!cv || !hud || !keys) return
    handleRef.current = playing.run(cv, hud, keys)

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      handleRef.current?.stop()
      handleRef.current = null
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [playing, close])

  return (
    <div className="mb-5">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🕹️ Play the 3 games — this is what your team must rebuild
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {GAMES.map(g => (
          <button
            key={g.key}
            onClick={() => setPlaying(g)}
            className="glow-card rounded-2xl px-3 py-3 text-left active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `2px solid ${g.col}`,
              ['--tc' as string]: g.col,
            }}
          >
            <span className="text-3xl block">{g.emoji}</span>
            <span className="block font-black text-white mt-1">{g.name}</span>
            <span className="block text-white/50 text-xs">{g.sub}</span>
            <span
              className="inline-block mt-2 px-3 py-1.5 rounded-lg font-black text-xs text-black"
              style={{ background: g.col }}
            >
              ▶ Play
            </span>
          </button>
        ))}
      </div>
      <p className="text-white/40 text-[11px] font-bold text-center mt-2">
        Keyboard needed — best played on a laptop or with the projector.
      </p>

      {playing && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1220]">
          <div className="min-h-full p-3 max-w-5xl mx-auto flex flex-col">
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <h1 className="font-black text-white text-lg leading-tight">
                  {playing.emoji} {playing.name}
                </h1>
                <div
                  ref={hudRef}
                  className="flex gap-3 text-xs font-black text-white/70 mt-0.5 [&>span]:whitespace-nowrap"
                />
              </div>
              <button
                onClick={close}
                aria-label="Close the game"
                className="px-3 py-2 rounded-xl text-xs font-black text-black bg-white flex-shrink-0"
              >
                ✕ Close
              </button>
            </div>

            <canvas
              ref={canvasRef}
              className="w-full h-auto rounded-2xl block bg-black"
              style={{ border: `2px solid ${playing.col}`, imageRendering: 'pixelated' }}
            />

            <p ref={keysRef} className="text-white/50 text-xs font-bold text-center mt-2 pb-4" />

            <div className="flex gap-2 justify-center pb-6">
              {GAMES.filter(g => g.key !== playing.key).map(g => (
                <button
                  key={g.key}
                  onClick={() => setPlaying(g)}
                  className="px-3 py-2 rounded-xl text-xs font-black text-white bg-white/10 border border-white/25"
                >
                  {g.emoji} {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
