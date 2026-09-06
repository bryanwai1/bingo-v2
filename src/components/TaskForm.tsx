import { useState } from 'react'
import type { Task } from '../types/database'

interface TaskFormProps {
  initial?: Partial<Task>
  onSave: (data: { color: string; hex_code: string; title: string; sort_order: number; points: number }) => Promise<void>
  onCancel: () => void
}

const PRESET_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Sky Blue', hex: '#38BDF8' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Fuchsia', hex: '#D946EF' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Dark Gray', hex: '#374151' },
  { name: 'Black', hex: '#111111' },
  { name: 'Silver', hex: '#94A3B8' },
  { name: 'White', hex: '#F1F5F9' },
]

export function TaskForm({ initial, onSave, onCancel }: TaskFormProps) {
  const [color, setColor] = useState(initial?.color || '')
  const [hexCode, setHexCode] = useState(initial?.hex_code || '#EF4444')
  const [title, setTitle] = useState(initial?.title || '')
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)
  const [points, setPoints] = useState(initial?.points ?? 0)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!color.trim() || !title.trim()) return
    setSaving(true)
    try {
      await onSave({ color: color.trim(), hex_code: hexCode, title: title.trim(), sort_order: sortOrder, points })
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message)
        : 'Unknown error'
      alert('Failed to save task: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Water Challenge"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Color Name</label>
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="e.g. Red"
          className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
        <div className="flex gap-2 flex-wrap mb-3">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => { setHexCode(c.hex); if (!color) setColor(c.name) }}
              className={`w-10 h-10 rounded-full border-2 transition-all ${hexCode === c.hex ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={hexCode}
            onChange={(e) => setHexCode(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={hexCode}
            onChange={(e) => setHexCode(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 font-mono text-sm w-28"
          />
        </div>
      </div>
      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-24 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="w-24 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={0}
          />
        </div>
      </div>
      <div className="flex gap-3 mt-2">
        <button
          type="submit"
          disabled={saving || !color.trim() || !title.trim()}
          className="px-6 py-2 bg-blue-600 a-text rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : initial?.id ? 'Update Task' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
