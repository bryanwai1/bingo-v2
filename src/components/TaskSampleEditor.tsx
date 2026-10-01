// Admin editor for a card's samples (bingo_task_samples): photos, videos, and
// links (a web page or an uploaded .html file) shown like Mission Control Budget's tool.
// Uploads go to the same 'media' bucket as the card's own photos.

import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { removeMediaIfUnused } from '../lib/mediaCleanup'
import { useTaskSamples, type TaskSample } from '../hooks/useTaskSamples'

const MAX_IMAGE = 5 * 1024 * 1024
const MAX_VIDEO = 50 * 1024 * 1024
const MAX_HTML = 2 * 1024 * 1024
const isHtml = (f: File) => /\.html?$/i.test(f.name) || f.type === 'text/html'

export function TaskSampleEditor({ taskId }: { taskId: string }) {
  const { samples, loading, reload } = useTaskSamples(taskId)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const nextOrder = () => (samples.length ? Math.max(...samples.map(s => s.sort_order)) + 1 : 0)

  const addLink = async () => {
    let url = linkUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    const { error } = await supabase.from('bingo_task_samples').insert({
      task_id: taskId, sort_order: nextOrder(), media_url: url, media_type: 'link', caption: linkLabel.trim() || null,
    })
    if (error) { alert(`Could not save link: ${error.message}`); return }
    setLinkUrl(''); setLinkLabel(''); setLinkOpen(false)
    reload()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      let order = nextOrder()
      for (const file of files) {
        const isVideo = file.type.startsWith('video/')
        const html = isHtml(file)
        const max = html ? MAX_HTML : isVideo ? MAX_VIDEO : MAX_IMAGE
        if (file.size > max) {
          alert(`${file.name} too large (max ${max / 1024 / 1024} MB). Skipped.`); continue
        }
        const ext = file.name.split('.').pop()
        const path = `bingo-media/samples/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('media').upload(path, file, { contentType: html ? 'text/html' : file.type })
        if (error) { alert(`Upload failed: ${error.message}`); continue }
        const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
        const { error: insErr } = await supabase.from('bingo_task_samples').insert({
          task_id: taskId, sort_order: order++, media_url: url, media_type: html ? 'link' : isVideo ? 'video' : 'image',
          caption: html ? 'Open the sample' : null,
        })
        if (insErr) alert(`Could not save sample: ${insErr.message}`)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      reload()
    }
  }

  const saveCaption = async (s: TaskSample, caption: string) => {
    if ((s.caption ?? '') === caption) return
    await supabase.from('bingo_task_samples').update({ caption: caption || null }).eq('id', s.id)
    reload()
  }

  const remove = async (s: TaskSample) => {
    if (!confirm('Delete this sample?')) return
    await supabase.from('bingo_task_samples').delete().eq('id', s.id)
    await removeMediaIfUnused(s.media_url)
    reload()
  }

  const move = async (i: number, dir: -1 | 1) => {
    const a = samples[i], b = samples[i + dir]
    if (!a || !b) return
    await Promise.all([
      supabase.from('bingo_task_samples').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('bingo_task_samples').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    reload()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sample</h2>
          <p className="text-xs text-gray-400 mt-0.5">Photos, videos, or a link / .html page showing what a finished submission looks like. Teams see them open by default and can hide them.</p>
          <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Samples save the moment they upload</p>
        </div>
        <div className="shrink-0 flex gap-2">
          <button
            onClick={() => setLinkOpen(v => !v)}
            className="px-4 py-2 border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 text-sm transition-colors"
          >
            + Add Link
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '+ Add Sample'}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*,.html,.htm,text/html" multiple className="hidden" onChange={handleUpload} />
      </div>

      {linkOpen && (
        <div className="mb-4 p-4 border border-violet-200 bg-violet-50/50 rounded-xl flex flex-col gap-2">
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://… (a web page, tool or app)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Button label, e.g. Open the sample tool"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setLinkOpen(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
            <button onClick={addLink} disabled={!linkUrl.trim()} className="px-4 py-1.5 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50">Save link</button>
          </div>
          <p className="text-[11px] text-gray-400">Or click “Add Sample” and pick an .html file to upload a page.</p>
        </div>
      )}

      {loading ? null : samples.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          No samples yet. Upload a photo, video or .html page, or add a link.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {samples.map((s, i) => (
            <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {s.media_type === 'video'
                ? <video src={s.media_url} controls playsInline preload="metadata" className="w-full aspect-video bg-black" />
                : s.media_type === 'link'
                  ? <div className="w-full aspect-video bg-violet-50 flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <span className="text-3xl">🔗</span>
                      <a href={s.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-700 underline break-all line-clamp-2">
                        {/\.html?(\?|$)/i.test(s.media_url) ? 'Uploaded .html page' : s.media_url}
                      </a>
                      <span className="text-[11px] text-gray-400">Shown embedded, with an Open button</span>
                    </div>
                  : <img src={s.media_url} alt="" className="w-full aspect-video object-cover bg-gray-100" />}
              <div className="p-3 flex flex-col gap-2">
                <input
                  defaultValue={s.caption ?? ''}
                  onBlur={e => saveCaption(s, e.target.value.trim())}
                  placeholder={s.media_type === 'link' ? 'Button label, e.g. Open the sample tool' : 'Caption (optional)'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 text-gray-400 disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === samples.length - 1} className="px-2 py-1 text-gray-400 disabled:opacity-30">↓</button>
                  <button onClick={() => remove(s)} className="px-3 py-1 text-sm text-red-600 bg-red-50 rounded-lg">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
