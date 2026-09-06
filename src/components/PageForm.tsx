import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { InstructionPage } from './InstructionPage'
import type { TaskPage } from '../types/database'

interface PageFormProps {
  page: TaskPage
  index: number
  hexCode: string
  onSave: (id: string, updates: Partial<TaskPage>) => Promise<void>
  onDelete: (id: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

export function PageForm({ page, index, hexCode, onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: PageFormProps) {
  const [mediaUrl, setMediaUrl] = useState(page.media_url || '')
  const [mediaType, setMediaType] = useState<'image' | 'video' | ''>(page.media_type || '')
  const [pointers, setPointers] = useState([
    page.pointer_1 || '',
    page.pointer_2 || '',
    page.pointer_3 || '',
    page.pointer_4 || '',
    page.pointer_5 || '',
    page.pointer_6 || '',
  ])
  const [examples, setExamples] = useState([
    page.example_1 || '',
    page.example_2 || '',
    page.example_3 || '',
    page.example_4 || '',
    page.example_5 || '',
    page.example_6 || '',
  ])
  const [icons, setIcons] = useState([
    page.icon_1 || '',
    page.icon_2 || '',
    page.icon_3 || '',
    page.icon_4 || '',
    page.icon_5 || '',
    page.icon_6 || '',
  ])
  const [iconPickerOpen, setIconPickerOpen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingExample, setUploadingExample] = useState<number | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const exampleFileRefs = useRef<(HTMLInputElement | null)[]>([])

  const updatePointer = (i: number, val: string) => {
    const next = [...pointers]
    next[i] = val
    setPointers(next)
  }

  const updateIcon = (i: number, val: string) => {
    const next = [...icons]
    next[i] = val
    setIcons(next)
    setIconPickerOpen(null)
  }

  const EMOJI_PAGES = [
    { label: 'Activity', emojis: [
      '📱', '🏃', '⏱️', '➕', '🏆', '📸',
      '👀', '🎯', '🔥', '💪', '🤝', '✅',
      '📏', '✂️', '🧩', '🎨', '🎵', '🎮',
      '📝', '💡', '🔍', '📦', '🪑', '🧊',
      '🏠', '🌊', '🌳', '⭐', '❤️', '🎪',
      '🏅', '🥇', '🎖️', '🏋️', '🤸', '🧗',
      '🚴', '⛹️', '🤾', '🏊', '🤽', '🎽',
      '🎬', '🎭', '🪅', '🎠', '🎡', '🎢',
    ]},
    { label: 'People', emojis: [
      '👋', '🙌', '👆', '👇', '🤳', '🗣️',
      '🙋', '🤔', '😄', '😎', '🥳', '🤩',
      '👏', '🤲', '✋', '👊', '🫶', '🫡',
      '🧑‍🤝‍🧑', '👥', '🧑‍💻', '🧑‍🎨', '🧑‍🔧', '🧑‍🏫',
      '🚶', '🧍', '💃', '🕺', '🧘', '🏋️',
      '😂', '😅', '🤗', '😤', '🥵', '😩',
      '🫠', '🤯', '😱', '🥺', '😭', '😡',
      '👦', '👧', '👨', '👩', '🧔', '🧕',
    ]},
    { label: 'Objects', emojis: [
      '⚽', '🏀', '🎾', '🏐', '🎳', '🏓',
      '🎲', '🃏', '🧸', '🪄', '🎁', '🎈',
      '🔔', '📣', '🎤', '🖊️', '📎', '🔑',
      '🧲', '🔧', '🪣', '🧹', '🪜', '🗑️',
      '📐', '🧮', '🖼️', '🪞', '🛒', '💰',
      '🎒', '👜', '🧳', '☂️', '🕶️', '🥾',
      '📷', '🔭', '🧪', '🧫', '🔬', '💊',
      '🪙', '💎', '🏺', '🗝️', '🔐', '🧰',
    ]},
    { label: 'Nature', emojis: [
      '🌸', '🌺', '🌻', '🌹', '🌷', '🌼',
      '🍀', '🌿', '🌱', '🌾', '🍃', '🍂',
      '🌲', '🌴', '🎋', '🎍', '🪨', '🪵',
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊',
      '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
      '🐸', '🐵', '🦝', '🐺', '🦄', '🐲',
      '🦅', '🦆', '🦋', '🐝', '🐛', '🐞',
      '🌈', '☀️', '🌙', '⛅', '🌧️', '❄️',
    ]},
    { label: 'Symbols', emojis: [
      '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣',
      '7️⃣', '8️⃣', '9️⃣', '🔟', '🅰️', '🅱️',
      '❌', '⭕', '✔️', '❓', '❗', '‼️',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
      '⬆️', '⬇️', '⬅️', '➡️', '↩️', '🔄',
      '⏩', '⏪', '⏫', '⏬', '⏺️', '⏹️',
      '🔊', '🔇', '💬', '📢', '🚨', '⚠️',
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🔰',
    ]},
  ]
  const [emojiPage, setEmojiPage] = useState(0)

  const updateExample = (i: number, val: string) => {
    const next = [...examples]
    next[i] = val
    setExamples(next)
  }

  const handleExampleUpload = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxMB = 2
    if (file.size > maxMB * 1024 * 1024) {
      alert(`File too large! Max ${maxMB} MB for example images.`)
      if (exampleFileRefs.current[i]) exampleFileRefs.current[i]!.value = ''
      return
    }
    setUploadingExample(i)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const filePath = `task-media/examples/${fileName}`
      const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file)
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(filePath)
      updateExample(i, urlData.publicUrl)
    } catch (err: unknown) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploadingExample(null)
      if (exampleFileRefs.current[i]) exampleFileRefs.current[i]!.value = ''
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const maxMB = isVideo ? 20 : 5
    if (file.size > maxMB * 1024 * 1024) {
      alert(`File too large! Max ${maxMB} MB for ${isVideo ? 'videos' : 'images'}.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const filePath = `task-media/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath)

      const url = urlData.publicUrl
      setMediaUrl(url)

      // Auto-detect media type
      const isVideo = file.type.startsWith('video/')
      setMediaType(isVideo ? 'video' : 'image')
    } catch (err: unknown) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await onSave(page.id, {
        media_url: mediaUrl || null,
        media_type: (mediaType || null) as TaskPage['media_type'],
        pointer_1: pointers[0] || null,
        pointer_2: pointers[1] || null,
        pointer_3: pointers[2] || null,
        pointer_4: pointers[3] || null,
        pointer_5: pointers[4] || null,
        pointer_6: pointers[5] || null,
        example_1: examples[0] || null,
        example_2: examples[1] || null,
        example_3: examples[2] || null,
        example_4: examples[3] || null,
        example_5: examples[4] || null,
        example_6: examples[5] || null,
        icon_1: icons[0] || null,
        icon_2: icons[1] || null,
        icon_3: icons[2] || null,
        icon_4: icons[3] || null,
        icon_5: icons[4] || null,
        icon_6: icons[5] || null,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err)
          ? String((err as { message: unknown }).message)
          : 'Save failed'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  // Build a preview page object from current form state
  const previewPage: TaskPage = {
    ...page,
    media_url: mediaUrl || null,
    media_type: (mediaType || null) as TaskPage['media_type'],
    pointer_1: pointers[0] || null,
    pointer_2: pointers[1] || null,
    pointer_3: pointers[2] || null,
    pointer_4: pointers[3] || null,
    pointer_5: pointers[4] || null,
    pointer_6: pointers[5] || null,
    example_1: examples[0] || null,
    example_2: examples[1] || null,
    example_3: examples[2] || null,
    example_4: examples[3] || null,
    example_5: examples[4] || null,
    example_6: examples[5] || null,
    icon_1: icons[0] || null,
    icon_2: icons[1] || null,
    icon_3: icons[2] || null,
    icon_4: icons[3] || null,
    icon_5: icons[4] || null,
    icon_6: icons[5] || null,
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900">Page {index + 1}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1 text-sm rounded font-medium transition-colors ${showPreview ? 'bg-blue-600 a-text' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
          >
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
          <button onClick={onMoveUp} disabled={isFirst} className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30" title="Move up">↑</button>
          <button onClick={onMoveDown} disabled={isLast} className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30" title="Move down">↓</button>
          <button onClick={() => onDelete(page.id)} className="px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100">Delete</button>
        </div>
      </div>

      {/* Live Preview */}
      {showPreview && (
        <div className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Participant View Preview</p>
          <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <InstructionPage page={previewPage} hexCode={hexCode} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Media Section */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <label className="block text-sm font-bold text-gray-700 mb-1">Media (Photo/Video)</label>
          <p className="text-xs text-gray-400 mb-3">Images: max 5 MB, best 800×600px · Videos: max 20 MB</p>

          {/* Upload button */}
          <div className="flex gap-3 items-start mb-3">
            <div className="flex-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"
              />
              {uploading && <p className="text-sm text-blue-600 font-medium mt-1 animate-pulse">Uploading...</p>}
            </div>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as 'image' | 'video' | '')}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No media</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>

          {/* URL input */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-400 shrink-0">or URL:</span>
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Media thumbnail preview */}
          {mediaUrl && mediaType && (
            <div className="mt-3 rounded-lg overflow-hidden bg-gray-100 max-h-[150px] relative">
              {mediaType === 'video' ? (
                <video src={mediaUrl} className="w-full max-h-[150px] object-contain" controls />
              ) : (
                <img src={mediaUrl} alt="Preview" className="w-full max-h-[150px] object-contain" />
              )}
              <button
                onClick={() => { setMediaUrl(''); setMediaType('') }}
                className="absolute top-2 right-2 w-6 h-6 bg-red-500 a-text rounded-full text-xs font-bold hover:bg-red-600"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Pointers */}
        <div className="grid grid-cols-2 gap-3">
          {pointers.map((val, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Pointer {i + 1} {i >= 3 && <span className="text-gray-300">(optional)</span>}
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(iconPickerOpen === i ? null : i)}
                  className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-lg hover:bg-gray-50 shrink-0 transition-colors"
                  title="Pick icon"
                >
                  {icons[i] || '🔢'}
                </button>
                <input type="text" value={val} onChange={(e) => updatePointer(i, e.target.value)} placeholder={`Enter pointer ${i + 1}...`} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {iconPickerOpen === i && (
                <div className="mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {/* Tabs */}
                  <div className="flex border-b border-gray-100">
                    {EMOJI_PAGES.map((pg, pi) => (
                      <button
                        key={pg.label}
                        type="button"
                        onClick={() => setEmojiPage(pi)}
                        className={`flex-1 px-2 py-1.5 text-xs font-bold transition-colors ${emojiPage === pi ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        {pg.label}
                      </button>
                    ))}
                  </div>
                  {/* Emoji grid */}
                  <div className="p-2 grid grid-cols-6 gap-1">
                    {EMOJI_PAGES[emojiPage].emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => updateIcon(i, emoji)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-gray-100 transition-colors ${icons[i] === emoji ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {icons[i] && (
                    <button
                      type="button"
                      onClick={() => updateIcon(i, '')}
                      className="w-full px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 font-medium border-t border-gray-100"
                    >
                      Remove icon (use number)
                    </button>
                  )}
                </div>
              )}
              {val && (
                <div className="mt-1.5">
                  {examples[i] ? (
                    <div className="flex items-center gap-2">
                      <img src={examples[i]} alt="" className="w-10 h-10 rounded object-cover border border-gray-200" />
                      <span className="text-xs text-green-600 font-medium">Example attached</span>
                      <button
                        type="button"
                        onClick={() => updateExample(i, '')}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={(el) => { exampleFileRefs.current[i] = el }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleExampleUpload(i, e)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => exampleFileRefs.current[i]?.click()}
                        disabled={uploadingExample === i}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {uploadingExample === i ? 'Uploading...' : '+ Example image'}
                      </button>
                      <span className="text-[10px] text-gray-300">Max 2 MB · 600×400px</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="self-start px-5 py-2 bg-blue-600 a-text rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
            {saving ? 'Saving...' : 'Save Page'}
          </button>
          {saveSuccess && <span className="text-sm text-green-600 font-medium">Saved ✓</span>}
          {saveError && <span className="text-sm text-red-600 font-medium">Error: {saveError}</span>}
        </div>
      </div>
    </div>
  )
}
