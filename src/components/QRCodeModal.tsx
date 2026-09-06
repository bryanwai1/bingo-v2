import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { Task } from '../types/database'

interface QRCodeModalProps {
  task: Task
  onClose: () => void
}

export function QRCodeModal({ task, onClose }: QRCodeModalProps) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin
  const url = `${base}/task/${task.id}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', zIndex: 2147483000 }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-8 text-white/70 hover:text-white text-5xl font-light transition-colors"
      >
        &times;
      </button>

      <div className="absolute top-6 left-0 right-0 text-center text-white/60 text-lg">
        Tap anywhere to go back
      </div>

      <div
        className="bg-white rounded-3xl p-10 flex flex-col items-center gap-6 max-w-lg mx-4 animate-bounce-in cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl"
            style={{ backgroundColor: task.hex_code }}
          />
          <h2 className="text-3xl font-black text-gray-900">{task.title}</h2>
        </div>
        <p className="text-gray-500 font-medium uppercase tracking-wider text-sm">
          {task.color} Flag — Scan with your phone camera
        </p>
        <div className="rounded-2xl" style={{ background: '#fff', padding: 40 }}>
          <QRCodeSVG value={url} size={400} level="H" bgColor="#ffffff" fgColor="#000000" />
        </div>
        <button
          onClick={onClose}
          className="px-8 py-4 bg-gray-900 text-white rounded-2xl hover:bg-gray-700 transition-all text-lg font-bold hover:scale-105 active:scale-95"
        >
          &larr; Back to Cards
        </button>
      </div>
    </div>,
    document.body
  )
}
