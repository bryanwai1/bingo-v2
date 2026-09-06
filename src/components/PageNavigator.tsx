import { T } from './T'

interface PageNavigatorProps {
  current: number
  total: number
  onPrev: () => void
  onNext: () => void
  hexCode: string
}

export function PageNavigator({ current, total, onPrev, onNext, hexCode }: PageNavigatorProps) {
  const hasMore = total > 1 && current < total - 1
  return (
    <>
      {hasMore && (
        <div
          className="mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold select-none"
          style={{
            backgroundColor: `${hexCode}18`,
            color: hexCode,
            border: `1.5px dashed ${hexCode}55`,
          }}
        >
          <T>Swipe to see more instructions</T>
          <span aria-hidden className="animate-swipe-nudge inline-block">👉</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={onPrev}
          disabled={current === 0}
          className="px-6 py-3 rounded-2xl font-bold transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105 active:scale-95"
        >
          <T>Back</T>
        </button>
        <div className="flex gap-2">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i === current ? hexCode : '#e5e7eb',
                transform: i === current ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        <button
          onClick={onNext}
          disabled={current === total - 1}
          className="px-6 py-3 rounded-2xl font-bold a-text transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          style={{ backgroundColor: hexCode }}
        >
          <T>Next</T>
        </button>
      </div>
    </>
  )
}
