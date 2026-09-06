import { useState, useRef } from 'react'
import type { TaskPhoto } from '../types/database'
import { T, useT } from './T'

interface PhotoGalleryViewProps {
  photos: TaskPhoto[]
  hexCode: string
}

export function PhotoGalleryView({ photos, hexCode }: PhotoGalleryViewProps) {
  const [current, setCurrent] = useState(0)
  const [found, setFound] = useState<Set<number>>(new Set())
  const [celebrating, setCelebrating] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const total = photos.length
  const photo = photos[current]

  const goNext = () => setCurrent(c => Math.min(c + 1, total - 1))
  const goPrev = () => setCurrent(c => Math.max(c - 1, 0))

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) goNext()
      else goPrev()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  const handleFound = () => {
    if (found.has(current)) return
    setCelebrating(current)
    setTimeout(() => {
      setFound(prev => new Set([...prev, current]))
      setCelebrating(null)
      if (current < total - 1) setCurrent(c => c + 1)
    }, 700)
  }

  const handleUndo = () => {
    setFound(prev => {
      const next = new Set(prev)
      next.delete(current)
      return next
    })
  }

  const isCurrentFound = found.has(current)
  const isCelebrating = celebrating === current

  const doneLabel = useT('done')
  const alreadyDoneLabel = useT('✓ Already Done')
  const celebrateLabel = useT('Done! 🎯')
  const defaultDoneLabel = useT('📍 Done!')

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-black a-text text-lg"><T>Photo Clues</T></h2>
        <span className="text-sm font-bold a-text-3">
          {found.size} / {total} {doneLabel}
        </span>
      </div>

      {/* Photo card — fixed 4:3 crop frame */}
      <div
        className="relative rounded-3xl overflow-hidden a-surface select-none"
        style={{ aspectRatio: '4 / 3', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={current}
          src={photo.photo_url}
          alt={`Clue ${current + 1}`}
          className="w-full h-full object-cover transition-opacity duration-200"
          style={{ objectPosition: `${photo.position_x ?? 50}% ${photo.position_y ?? 50}%` }}
          draggable={false}
        />

        {/* Found overlay */}
        {isCurrentFound && !isCelebrating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl animate-bounce-in"
              style={{ backgroundColor: hexCode }}
            >
              <span className="text-4xl">✓</span>
            </div>
          </div>
        )}

        {/* Celebrating flash */}
        {isCelebrating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 animate-pulse">
            <div className="text-6xl animate-bounce-in">🎯</div>
            <p className="a-text font-black text-2xl mt-2 animate-slide-up"><T>Done!</T></p>
          </div>
        )}

        {/* Counter badge */}
        <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/50 a-text text-xs font-black backdrop-blur-sm">
          {current + 1} / {total}
        </div>

        {isCurrentFound && (
          <div
            className="absolute top-3 right-3 px-3 py-1 rounded-full a-text text-xs font-black"
            style={{ backgroundColor: hexCode }}
          >
            ✓ <T>Done</T>
          </div>
        )}

        {current > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 a-text flex items-center justify-center text-lg hover:bg-black/60 transition-colors backdrop-blur-sm"
          >‹</button>
        )}
        {current < total - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 a-text flex items-center justify-center text-lg hover:bg-black/60 transition-colors backdrop-blur-sm"
          >›</button>
        )}
      </div>

      {/* Caption */}
      {photo.caption && (
        <p className="text-center a-text text-sm font-medium px-2 -mt-1">
          <T>{photo.caption}</T>
        </p>
      )}

      {/* Dot navigation */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className="rounded-full transition-all duration-200"
            style={{
              width: i === current ? 20 : 8,
              height: 8,
              backgroundColor: found.has(i) ? hexCode : i === current ? hexCode : '#d1d5db',
              opacity: i === current ? 1 : 0.7,
            }}
          />
        ))}
      </div>

      {/* Found It button */}
      <button
        onClick={handleFound}
        disabled={isCurrentFound || isCelebrating}
        className="w-full py-4 rounded-2xl a-text text-xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
        style={{
          backgroundColor: isCurrentFound ? '#9ca3af' : hexCode,
          boxShadow: isCurrentFound ? 'none' : `0 6px 0 ${hexCode}88, 0 8px 20px ${hexCode}44`,
        }}
      >
        {isCurrentFound ? alreadyDoneLabel : isCelebrating ? celebrateLabel : defaultDoneLabel}
      </button>

      {isCurrentFound && !isCelebrating && (
        <button
          onClick={handleUndo}
          className="w-full py-2 rounded-xl text-sm font-bold a-text-3 hover:text-red-400 transition-colors"
        >
          <T>Undo Done</T>
        </button>
      )}

      {total > 1 && (
        <p className="text-center text-xs a-text-3 font-medium">
          <T>Swipe left / right to browse photos</T>
        </p>
      )}
    </div>
  )
}
