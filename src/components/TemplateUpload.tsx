import { useState, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AI_PROMPT = `Read this file and convert each activity into a JSON template for my Flag Retrieval app.

Rules:
- Simplify all instructions like explaining to a 5 year old
- Each activity gets 1 task with 1+ pages
- Each page has max 6 pointers
- If an activity has lots of steps, split into multiple pages
- Ask me what flag color to assign to each activity before generating

Available colors:
Red (#EF4444), Blue (#3B82F6), Green (#22C55E), Yellow (#EAB308),
Purple (#A855F7), Orange (#F97316), Pink (#EC4899), Teal (#14B8A6),
Black (#1F2937), Light Blue (#38BDF8), White (#94A3B8), Amber (#F59E0B),
Indigo (#6366F1), Rose (#F43F5E), Lime (#84CC16), Cyan (#06B6D4)

Output this exact JSON format:
{
  "tasks": [
    {
      "color": "Red",
      "hex_code": "#EF4444",
      "title": "Activity Name",
      "sort_order": 1,
      "pages": [
        {
          "media_url": "",
          "media_type": null,
          "pointers": [
            "Simple step 1",
            "Simple step 2",
            "Simple step 3"
          ]
        }
      ]
    }
  ]
}`

interface TemplateTask {
  color: string
  hex_code: string
  title: string
  sort_order: number
  pages: {
    media_url?: string
    media_type?: 'image' | 'video' | null
    pointers: string[]
  }[]
}

interface TemplateData {
  tasks: TemplateTask[]
}

interface TemplateUploadProps {
  onComplete: () => void
  ownerValue?: string | null
}

export function TemplateUpload({ onComplete, ownerValue = null }: TemplateUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<TemplateData | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(AI_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as TemplateData
        if (!data.tasks || !Array.isArray(data.tasks)) {
          setStatus('Invalid template: must have a "tasks" array')
          return
        }
        setPreview(data)
        setStatus(`Found ${data.tasks.length} tasks ready to import`)
      } catch {
        setStatus('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const handleUpload = async () => {
    if (!preview || !isSupabaseConfigured) return
    setUploading(true)
    setStatus('Importing tasks...')

    try {
      for (const task of preview.tasks) {
        setStatus(`Creating: ${task.title}...`)
        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert({
            color: task.color,
            hex_code: task.hex_code,
            title: task.title,
            sort_order: task.sort_order,
            owner_id: ownerValue,
          })
          .select()
          .single()

        if (taskError) throw taskError

        for (let pi = 0; pi < task.pages.length; pi++) {
          const page = task.pages[pi]
          const pointers = page.pointers || []
          const { error: pageError } = await supabase
            .from('task_pages')
            .insert({
              task_id: newTask.id,
              page_order: pi,
              media_url: page.media_url || null,
              media_type: page.media_type || null,
              pointer_1: pointers[0] || null,
              pointer_2: pointers[1] || null,
              pointer_3: pointers[2] || null,
              pointer_4: pointers[3] || null,
              pointer_5: pointers[4] || null,
              pointer_6: pointers[5] || null,
            })
          if (pageError) throw pageError
        }
      }

      setStatus(`Successfully imported ${preview.tasks.length} tasks!`)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      onComplete()
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Import failed'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl border-2 border-dashed border-purple-300 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900 mb-1">Import from Template</h3>
          <p className="text-sm text-gray-500">Upload a JSON template to auto-create all task cards and instruction pages</p>
        </div>
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="shrink-0 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-sm font-bold transition-colors"
        >
          {showPrompt ? 'Hide Prompt' : 'How to Convert Files'}
        </button>
      </div>

      {showPrompt && (
        <div className="mb-6 bg-white rounded-xl border border-amber-200 p-5">
          <h4 className="font-bold text-gray-900 mb-2">How to turn your PDF/PPT into a JSON template</h4>
          <div className="text-sm text-gray-600 mb-3 space-y-1">
            <p><strong>Step 1:</strong> Copy the prompt below</p>
            <p><strong>Step 2:</strong> Open Claude Code or any AI chat</p>
            <p><strong>Step 3:</strong> Paste the prompt + attach your PDF/PPT file</p>
            <p><strong>Step 4:</strong> The AI will ask you which color for each activity</p>
            <p><strong>Step 5:</strong> Save the output as a .json file and upload it here</p>
          </div>
          <div className="relative">
            <pre className="a-surface text-gray-100 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">{AI_PROMPT}</pre>
            <button
              onClick={copyPrompt}
              className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                copied
                  ? 'bg-green-500 a-text'
                  : 'bg-white/90 text-gray-700 hover:bg-white'
              }`}
            >
              {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        onChange={handleFile}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 cursor-pointer"
      />

      {status && (
        <p className={`mt-3 text-sm font-medium ${status.startsWith('Error') ? 'text-red-600' : status.startsWith('Success') ? 'text-green-600' : 'text-blue-600'}`}>
          {status}
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {preview.tasks.map((t, i) => (
              <div
                key={i}
                className="px-3 py-1.5 rounded-full a-text text-sm font-bold"
                style={{ backgroundColor: t.hex_code }}
              >
                {t.title}
              </div>
            ))}
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-6 py-3 bg-purple-600 a-text rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
          >
            {uploading ? 'Importing...' : `Import ${preview.tasks.length} Tasks`}
          </button>
        </div>
      )}
    </div>
  )
}
