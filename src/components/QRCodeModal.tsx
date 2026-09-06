import { QRCodeSVG } from 'qrcode.react'
import type { Task } from '../types/database'

interface QRCodeModalProps {
  task: Task
  onClose: () => void
}

export function QRCodeModal({ task, onClose }: QRCodeModalProps) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin
  const url = `${base}/task/${task.id}`

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center z-50 cursor-pointer"
      onClick={onClose}
    >
      {/* Big X close button - top right */}
      <button
        onClick={onClose}
        className="absolute top-6 right-8 a-text-2 hover:a-text text-5xl font-light transition-colors z-10"
      >
        &times;
      </button>

      {/* Hint text at top */}
      <div className="absolute top-6 left-0 right-0 text-center a-text-3 text-lg">
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
        <p className="text-gray-400 font-medium uppercase tracking-wider text-sm">
          {task.color} Flag — Scan with your phone camera
        </p>
        <div className="bg-white p-4 rounded-2xl">
          <QRCodeSVG value={url} size={400} level="H" />
        </div>
        <button
          onClick={onClose}
          className="px-8 py-4 a-surface a-text rounded-2xl hover:bg-gray-700 transition-all text-lg font-bold hover:scale-105 active:scale-95"
        >
          &larr; Back to Cards
        </button>
      </div>
    </div>
  )
}
