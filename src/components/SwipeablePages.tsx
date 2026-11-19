import { useRef, type ReactNode, type TouchEvent } from 'react'

interface SwipeablePagesProps {
  currentPage: number
  total: number
  onChange: (next: number) => void
  children: ReactNode
  /** Called when the player touches the content, so auto-play can stop. */
  onInteract?: () => void
}

const SWIPE_THRESHOLD_PX = 50
const VERTICAL_TOLERANCE_PX = 60

export function SwipeablePages({ currentPage, total, onChange, children, onInteract }: SwipeablePagesProps) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
  }

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (startX.current === null || startY.current === null) return
    const t = e.changedTouches[0]
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current
    startX.current = null
    startY.current = null
    if (Math.abs(dy) > VERTICAL_TOLERANCE_PX) return
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
    if (dx < 0 && currentPage < total - 1) onChange(currentPage + 1)
    else if (dx > 0 && currentPage > 0) onChange(currentPage - 1)
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onPointerDownCapture={onInteract}>
      {children}
    </div>
  )
}
