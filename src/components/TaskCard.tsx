import type { Task } from '../types/database'

interface TaskCardProps {
  task: Task
  size?: 'large' | 'small'
  equal?: boolean
  onClick?: () => void
  children?: React.ReactNode
  showQrHint?: boolean
}

export function TaskCard({ task, size = 'large', equal, onClick, children, showQrHint = true }: TaskCardProps) {
  const isLarge = size === 'large'

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-3xl a-text cursor-pointer
        transition-all duration-300 hover:scale-105 hover:-rotate-1
        animate-pulse-glow flex flex-col justify-center items-center text-center
        ${isLarge ? 'p-6' : 'p-4'}
        ${equal ? 'h-full' : ''}
      `}
      style={{
        backgroundColor: task.hex_code,
        textShadow: '0 2px 8px rgba(0,0,0,0.4)',
        boxShadow: `0 8px 32px ${task.hex_code}66`,
      }}
    >
      <div className="absolute inset-0 rounded-3xl a-surface-2 opacity-0 hover:opacity-100 transition-opacity duration-300" />
      <div className={`font-black ${isLarge ? 'text-xl xl:text-3xl' : 'text-lg'} tracking-tight relative z-10 leading-tight`}>
        {task.title}
      </div>
      <div className={`mt-2 font-bold uppercase tracking-[0.15em] relative z-10 ${isLarge ? 'text-sm opacity-90' : 'text-xs opacity-80'}`}>
        {task.color} FLAG
      </div>
      {isLarge && showQrHint && (
        <div className="mt-3 text-xs opacity-60 relative z-10">
          Tap to show QR
        </div>
      )}
      {children && <div className="mt-3 relative z-10">{children}</div>}
    </div>
  )
}
