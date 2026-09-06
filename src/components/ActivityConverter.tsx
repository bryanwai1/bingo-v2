import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const FLAG_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Black', hex: '#1F2937' },
  { name: 'Light Blue', hex: '#38BDF8' },
  { name: 'White', hex: '#94A3B8' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Cyan', hex: '#06B6D4' },
]

interface PageDraft {
  media_url: string
  media_type: '' | 'image' | 'video'
  pointers: string[]
}

interface ActivityDraft {
  title: string
  color: string
  hex_code: string
  pages: PageDraft[]
}

function emptyPage(): PageDraft {
  return { media_url: '', media_type: '', pointers: ['', '', '', '', '', ''] }
}

function emptyActivity(): ActivityDraft {
  return { title: '', color: '', hex_code: '#EF4444', pages: [emptyPage()] }
}

interface ActivityConverterProps {
  onComplete: () => void
  existingTaskCount: number
  ownerValue?: string | null
}

export function ActivityConverter({ onComplete, existingTaskCount, ownerValue = null }: ActivityConverterProps) {
  const [activities, setActivities] = useState<ActivityDraft[]>([emptyActivity()])
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState('')
  const [rawText, setRawText] = useState('')
  const [showRawInput, setShowRawInput] = useState(false)

  const updateActivity = (ai: number, updates: Partial<ActivityDraft>) => {
    const next = [...activities]
    next[ai] = { ...next[ai], ...updates }
    setActivities(next)
  }

  const updatePage = (ai: number, pi: number, updates: Partial<PageDraft>) => {
    const next = [...activities]
    next[ai].pages[pi] = { ...next[ai].pages[pi], ...updates }
    setActivities(next)
  }

  const updatePointer = (ai: number, pi: number, idx: number, val: string) => {
    const next = [...activities]
    const pointers = [...next[ai].pages[pi].pointers]
    pointers[idx] = val
    next[ai].pages[pi].pointers = pointers
    setActivities(next)
  }

  const addPage = (ai: number) => {
    const next = [...activities]
    next[ai].pages.push(emptyPage())
    setActivities(next)
  }

  const removePage = (ai: number, pi: number) => {
    const next = [...activities]
    next[ai].pages.splice(pi, 1)
    setActivities(next)
  }

  const addActivity = () => {
    setActivities([...activities, emptyActivity()])
  }

  const removeActivity = (ai: number) => {
    setActivities(activities.filter((_, i) => i !== ai))
  }

  const selectColor = (ai: number, color: typeof FLAG_COLORS[number]) => {
    updateActivity(ai, { color: color.name, hex_code: color.hex })
  }

  const parseRawText = () => {
    if (!rawText.trim()) return
    // Split by double newlines or lines starting with a number/dash
    const lines = rawText.split('\n').filter(l => l.trim())
    const pointers = lines.slice(0, 6).map(l => l.replace(/^[\d\.\-\*\•\>]+\s*/, '').trim())

    const newActivity = emptyActivity()
    newActivity.pages[0].pointers = [...pointers, ...Array(6 - pointers.length).fill('')]
    setActivities([...activities.slice(0, -1), newActivity, ...activities.slice(-1).filter(a => a.title)])
    setRawText('')
    setShowRawInput(false)
  }

  const handleImport = async () => {
    if (!isSupabaseConfigured) return
    const valid = activities.filter(a => a.title.trim() && a.color)
    if (valid.length === 0) {
      setStatus('Add at least one activity with a title and color')
      return
    }
    setImporting(true)
    setStatus('Importing...')

    try {
      for (let i = 0; i < valid.length; i++) {
        const act = valid[i]
        setStatus(`Creating: ${act.title}...`)

        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert({
            color: act.color,
            hex_code: act.hex_code,
            title: act.title.trim(),
            sort_order: existingTaskCount + i + 1,
            owner_id: ownerValue,
          })
          .select()
          .single()

        if (taskError) throw taskError

        for (let pi = 0; pi < act.pages.length; pi++) {
          const page = act.pages[pi]
          const p = page.pointers
          const { error: pageError } = await supabase
            .from('task_pages')
            .insert({
              task_id: newTask.id,
              page_order: pi,
              media_url: page.media_url || null,
              media_type: page.media_type || null,
              pointer_1: p[0] || null,
              pointer_2: p[1] || null,
              pointer_3: p[2] || null,
              pointer_4: p[3] || null,
              pointer_5: p[4] || null,
              pointer_6: p[5] || null,
            })
          if (pageError) throw pageError
        }
      }

      setStatus(`Imported ${valid.length} activities!`)
      setActivities([emptyActivity()])
      onComplete()
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Import failed'}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Activity Converter</h3>
          <p className="text-sm text-gray-500">Create cards from your activity details — no flag tag needed, pick any color!</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRawInput(!showRawInput)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            {showRawInput ? 'Hide' : 'Paste Raw Text'}
          </button>
          <button
            onClick={addActivity}
            className="px-4 py-2 bg-blue-600 a-text rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            + Add Activity
          </button>
        </div>
      </div>

      {/* Raw text paste area */}
      {showRawInput && (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paste your activity instructions (one per line, up to 6 will be used as pointers)
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            placeholder={"Paste your instructions here...\nEach line becomes a pointer\n1. First step\n2. Second step\n3. Third step"}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
          />
          <button
            onClick={parseRawText}
            className="mt-2 px-4 py-2 bg-purple-600 a-text rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
          >
            Convert to Pointers
          </button>
        </div>
      )}

      {/* Activity cards */}
      <div className="flex flex-col gap-6">
        {activities.map((act, ai) => (
          <div key={ai} className="border border-gray-200 rounded-xl p-5 relative">
            {activities.length > 1 && (
              <button
                onClick={() => removeActivity(ai)}
                className="absolute top-3 right-3 text-red-400 hover:text-red-600 text-sm"
              >
                Remove
              </button>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Activity Title</label>
                <input
                  type="text"
                  value={act.title}
                  onChange={(e) => updateActivity(ai, { title: e.target.value })}
                  placeholder="e.g. Water Balloon Toss"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flag Color {act.color && <span className="text-gray-400">— {act.color}</span>}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {FLAG_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => selectColor(ai, c)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${act.hex_code === c.hex ? 'border-gray-900 scale-110 ring-2 ring-gray-300' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Preview bar */}
            {act.title && act.color && (
              <div
                className="rounded-xl px-4 py-2 mb-4 a-text font-bold text-sm flex items-center gap-2"
                style={{ backgroundColor: act.hex_code }}
              >
                <span>{act.title}</span>
                <span className="opacity-70 uppercase text-xs tracking-wider">— {act.color} Flag</span>
              </div>
            )}

            {/* Pages */}
            {act.pages.map((page, pi) => (
              <div key={pi} className="mb-4 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-gray-600">Page {pi + 1}</span>
                  <div className="flex gap-2">
                    {act.pages.length > 1 && (
                      <button onClick={() => removePage(ai, pi)} className="text-xs text-red-500 hover:text-red-700">Remove page</button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input
                    type="text"
                    value={page.media_url}
                    onChange={(e) => updatePage(ai, pi, { media_url: e.target.value })}
                    placeholder="Image/video URL (optional)"
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={page.media_type}
                    onChange={(e) => updatePage(ai, pi, { media_type: e.target.value as PageDraft['media_type'] })}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No media</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {page.pointers.map((ptr, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={ptr}
                      onChange={(e) => updatePointer(ai, pi, idx, e.target.value)}
                      placeholder={`Pointer ${idx + 1}${idx >= 3 ? ' (optional)' : ''}`}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={() => addPage(ai)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add another page
            </button>
          </div>
        ))}
      </div>

      {/* Import button */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          {status && (
            <p className={`text-sm font-medium ${status.startsWith('Error') ? 'text-red-600' : status.startsWith('Imported') ? 'text-green-600' : 'text-blue-600'}`}>
              {status}
            </p>
          )}
        </div>
        <button
          onClick={handleImport}
          disabled={importing || activities.every(a => !a.title.trim() || !a.color)}
          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 a-text rounded-xl font-bold hover:from-purple-700 hover:to-blue-700 disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-lg"
        >
          {importing ? 'Importing...' : 'Create Cards'}
        </button>
      </div>
    </div>
  )
}
