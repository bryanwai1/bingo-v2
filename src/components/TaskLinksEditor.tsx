import { useState } from 'react'
import { useTaskLinks, type TaskLinksTable } from '../hooks/useTaskLinks'
import type { TaskLink } from '../types/database'

interface Props {
  taskId: string
  hexCode: string
  table?: TaskLinksTable
  title?: string
  description?: string
}

export function TaskLinksEditor({
  taskId,
  hexCode,
  table = 'task_links',
  title = 'Task Links',
  description = 'Add URLs players can tap to open external tools or resources while doing this task. Each link appears as a button.',
}: Props) {
  const { links, createLink, updateLink, deleteLink, reorderLinks } = useTaskLinks(taskId, table)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    setError(null)
    if (!newLabel.trim() || !newUrl.trim()) {
      setError('Both label and URL are required.')
      return
    }
    setAdding(true)
    try {
      await createLink(newLabel, newUrl)
      setNewLabel('')
      setNewUrl('')
    } catch (e) {
      setError((e as Error).message || 'Failed to add link')
    } finally {
      setAdding(false)
    }
  }

  const move = (index: number, delta: number) => {
    const next = [...links]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    reorderLinks(next)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">{links.length} {links.length === 1 ? 'link' : 'links'}</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">{description}</p>

      {links.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              hexCode={hexCode}
              isFirst={i === 0}
              isLast={i === links.length - 1}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onSave={(updates) => updateLink(link.id, updates)}
              onDelete={() => deleteLink(link.id)}
            />
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="grid grid-cols-[1fr_2fr_auto] gap-2 items-start">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Button label"
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newLabel.trim() || !newUrl.trim()}
            className="px-4 py-2 bg-blue-600 a-text rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding...' : '+ Add'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 font-medium mt-2">{error}</p>}
      </div>
    </div>
  )
}

function LinkRow({
  link, hexCode, isFirst, isLast, onMoveUp, onMoveDown, onSave, onDelete,
}: {
  link: TaskLink
  hexCode: string
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onSave: (updates: Partial<Pick<TaskLink, 'label' | 'url'>>) => Promise<void>
  onDelete: () => void
}) {
  const [label, setLabel] = useState(link.label)
  const [url, setUrl] = useState(link.url)
  const [saving, setSaving] = useState(false)

  const dirty = label !== link.label || url !== link.url

  const handleSave = async () => {
    if (!dirty || !label.trim() || !url.trim()) return
    setSaving(true)
    try { await onSave({ label: label.trim(), url: url.trim() }) } finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold a-text shrink-0" style={{ backgroundColor: hexCode }}>🔗</span>
      <input
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Button label"
        className="w-36 px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://..."
        className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="px-3 py-1.5 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-30 transition-colors"
        title="Save"
      >
        {saving ? '...' : 'Save'}
      </button>
      <button onClick={onMoveUp} disabled={isFirst} className="px-1.5 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30" title="Move up">↑</button>
      <button onClick={onMoveDown} disabled={isLast} className="px-1.5 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30" title="Move down">↓</button>
      <button onClick={onDelete} className="px-1.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100" title="Delete">✕</button>
    </div>
  )
}
