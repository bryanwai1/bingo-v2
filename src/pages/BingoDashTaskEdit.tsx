import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { BingoAdminPhotoUpload } from '../components/BingoAdminPhotoUpload'
import { SignSpliceAdminPanel } from '../components/SignSpliceAdminPanel'
import { BreakoutHuntAdminPanel } from '../components/BreakoutHuntAdminPanel'
import { CardDrawAdminPanel } from '../components/CardDrawAdminPanel'
import { PageForm } from '../components/PageForm'
import { InstructionPage } from '../components/InstructionPage'
import { TaskLinksEditor } from '../components/TaskLinksEditor'
import { TaskLinkButtons } from '../components/TaskLinkButtons'
import { ParticleBackground } from '../components/ParticleBackground'
import { CardDrawEditor } from '../components/CardDrawEditor'
import { AitbMissionModule } from '../components/AitbMissionModule'
import { BonusBar } from '../components/AitbBonusBar'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { aitbByName, AITB_POINTS, aitbToolUrl, aitbToolCaption } from '../lib/aitbActivities'
import { useCardDrawConfig } from '../hooks/useCardDrawConfig'
import type { BingoTask, BingoTaskPage } from '../types/database'

export function BingoDashTaskEdit() {
  const { taskId } = useParams<{ taskId: string }>()
  const { workingOwnerValue, isOwner } = useBingoAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // ?from= records where the editor was opened from, so Back returns there
  // rather than dropping the user on the admin's default Run Event tab.
  const from = searchParams.get('from')
  const ADMIN_TABS = ['run', 'board', 'library', 'teams', 'submissions', 'settings']
  const backPath =
    from === 'snake-ladder' ? '/snake-ladder/admin'
    : from && ADMIN_TABS.includes(from) ? `/bingo-dash/admin?tab=${from}`
    : '/bingo-dash/admin?tab=library'
  const [task, setTask] = useState<BingoTask | null>(null)
  const { reload: reloadDraw } = useCardDrawConfig(taskId)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<'instructions' | 'answer'>('instructions')
  // Answer tab state
  const [taskType, setTaskType] = useState<'standard' | 'answer' | 'photo'>('standard')
  const [answerQuestion, setAnswerQuestion] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [answerSaving, setAnswerSaving] = useState(false)
  const [completionWarning, setCompletionWarning] = useState('')
  const [warningSaving, setWarningSaving] = useState(false)
  const [mapsUrl, setMapsUrl] = useState('')
  const [mapsLabel, setMapsLabel] = useState('')
  const [mapsUrlSaving, setMapsUrlSaving] = useState(false)
  // AITB preview state — ephemeral, mirrors the demo's "nothing is saved"
  // approach, so previewing never writes into real team progress.
  const [previewAitbWords, setPreviewAitbWords] = useState<string[]>([])
  const [previewStepsDone, setPreviewStepsDone] = useState<number[]>([])
  const [previewStartedAt] = useState(() => Date.now())
  const [previewNow, setPreviewNow] = useState(Date.now())
  const { pages, createPage, updatePage, deletePage, reorderPages } = useBingoTaskPages(taskId)
  const { photos, reload: reloadPhotos } = useBingoTaskPhotos(taskId)
  const { links } = useTaskLinks(taskId, 'bingo_task_links')

  useEffect(() => {
    if (!taskId) return
    supabase.from('bingo_tasks').select('*').eq('id', taskId).single().then(({ data }) => {
      if (data) {
        setTask(data)
        setTitleValue(data.title)
        setTaskType((data.task_type ?? 'standard') as 'standard' | 'answer' | 'photo')
        setAnswerQuestion(data.answer_question ?? '')
        setAnswerText(data.answer_text ?? '')
        setCompletionWarning(data.completion_warning ?? '')
        setMapsUrl(data.maps_url ?? '')
        setMapsLabel(data.maps_label ?? '')
      }
    })
  }, [taskId])

  const previewActivity = task ? aitbByName(task.title) : undefined

  useEffect(() => {
    if (!previewMode || !previewActivity) return
    const t = setInterval(() => setPreviewNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [previewMode, previewActivity])

  const handleTitleSave = async () => {
    if (!task || !titleValue.trim() || titleValue.trim() === task.title) {
      setEditingTitle(false)
      setTitleValue(task?.title || '')
      return
    }
    setTitleSaving(true)
    const { error } = await supabase.from('bingo_tasks').update({ title: titleValue.trim() }).eq('id', task.id)
    setTitleSaving(false)
    if (error) { alert('Failed to save title: ' + error.message); return }
    setTask({ ...task, title: titleValue.trim() })
    setEditingTitle(false)
  }

  const handleAnswerSave = async () => {
    if (!task) return
    setAnswerSaving(true)
    const cleanedAnswerText = answerText.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    const payload = {
      task_type: taskType,
      answer_question: taskType === 'answer' ? answerQuestion.trim() || null : null,
      answer_text: taskType === 'answer' ? cleanedAnswerText || null : null,
    }
    const { error } = await supabase.from('bingo_tasks').update(payload).eq('id', task.id)
    setAnswerSaving(false)
    if (error) { alert('Failed to save: ' + error.message); return }
    setAnswerText(cleanedAnswerText)
    setTask({ ...task, ...payload })
  }

  const handleAddPage = async () => {
    if (!task) return
    await createPage({
      task_id: task.id,
      page_order: pages.length,
      media_url: null,
      media_type: null,
      pointer_1: null,
      pointer_2: null,
      pointer_3: null,
      pointer_4: null,
      pointer_5: null,
      pointer_6: null,
      example_1: null,
      example_2: null,
      example_3: null,
      example_4: null,
      example_5: null,
      example_6: null,
      icon_1: null,
      icon_2: null,
      icon_3: null,
      icon_4: null,
      icon_5: null,
      icon_6: null,
    })
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const r = [...pages]
    ;[r[index - 1], r[index]] = [r[index], r[index - 1]]
    reorderPages(r)
  }

  const handleMoveDown = (index: number) => {
    if (index === pages.length - 1) return
    const r = [...pages]
    ;[r[index], r[index + 1]] = [r[index + 1], r[index]]
    reorderPages(r)
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading task...</p>
      </div>
    )
  }

  // Hub model: cards owned by another account are copy-on-use only for subs.
  // The owner account has full write access (bingo_can_write / is_bingo_owner
  // allows it in RLS), so it edits any card in the shared library directly.
  const isMineTask = isOwner || (task.owner_id ?? null) === workingOwnerValue
  if (!isMineTask) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-gray-900 border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-3">🔒</p>
          <h1 className="text-white font-black text-xl mb-2">Shared card — read only</h1>
          <p className="text-gray-400 text-sm mb-6">
            "{task.title}" belongs to another account. To use it, add it to your board from
            the library — that creates your own independent copy you can edit.
          </p>
          <button
            onClick={() => navigate(backPath)}
            className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 transition-colors"
          >
            ← Back to admin
          </button>
        </div>
      </div>
    )
  }

  if (previewMode) {
    return (
      <div
        className="min-h-screen relative overflow-x-hidden"
        style={{ backgroundColor: `color-mix(in srgb, ${task.hex_code} 25%, #0f0f0f)` }}
      >
        <ParticleBackground hexCode={task.hex_code} />

        <button
          onClick={() => { setPreviewMode(false); setPreviewPage(0) }}
          className="fixed top-4 right-4 z-50 px-4 py-2 bg-black/60 backdrop-blur-sm text-white rounded-lg hover:bg-black/80 text-sm font-bold border border-white/20 transition-colors"
        >
          ✕ Exit Preview
        </button>

        <header className="px-6 py-5 text-white relative z-10 overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: task.hex_code, opacity: 0.35 }} />
          <div className="absolute inset-0 bg-black/30" />
          <div className={`${previewActivity ? 'max-w-lg sm:max-w-2xl lg:max-w-4xl' : 'max-w-lg'} mx-auto relative z-10`}>
            <p className="text-sm font-bold opacity-80 uppercase tracking-wider">Team: Preview Team</p>
            <h1 className="text-3xl font-black tracking-tight">{task.title}</h1>
            <div className="text-sm opacity-70 mt-1 uppercase tracking-wider">{task.color} Challenge</div>
          </div>
        </header>

        <main className={`${previewActivity ? 'max-w-lg sm:max-w-2xl lg:max-w-4xl' : 'max-w-lg'} mx-auto px-6 py-8 relative z-10`}>
          {/* Photo carousel — mirrors the participant page */}
          {photos.length > 0 && (
            <div className="rounded-2xl overflow-hidden mb-6 shadow-xl animate-slide-up">
              <div className="relative">
                <img
                  src={photos[carouselIdx]?.photo_url}
                  alt={`${task.title} ${carouselIdx + 1}`}
                  className="w-full max-h-72 object-cover"
                  style={{ objectPosition: `${photos[carouselIdx]?.position_x ?? 50}% ${photos[carouselIdx]?.position_y ?? 50}%` }}
                />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setCarouselIdx(i => (i - 1 + photos.length) % photos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm active:scale-90 transition-transform"
                    >‹</button>
                    <button
                      onClick={() => setCarouselIdx(i => (i + 1) % photos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm active:scale-90 transition-transform"
                    >›</button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCarouselIdx(i)}
                          className={`w-2 h-2 rounded-full transition-all ${i === carouselIdx ? 'bg-white scale-125' : 'bg-white/50'}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {photos[carouselIdx]?.caption && (
                <div className="px-4 py-2 text-xs text-white/70 font-medium" style={{ backgroundColor: `${task.hex_code}cc` }}>
                  {photos[carouselIdx].caption}
                </div>
              )}
            </div>
          )}

          {previewActivity ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-1 rounded-lg text-xs font-black uppercase" style={{ background: `${previewActivity.color}22`, color: previewActivity.color }}>
                  {previewActivity.difficulty}
                </span>
              </div>
              <BonusBar elapsedMs={previewNow - previewStartedAt} activity={previewActivity} completed={false} bankedBonus={0} />
              <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
                <h2 className="text-white font-black text-lg mb-2">{previewActivity.tagline}</h2>
                <p className="text-gray-300 text-sm leading-relaxed">{previewActivity.description}</p>
                <p className="text-gray-500 text-xs font-black uppercase tracking-wide mt-3">{previewActivity.skillTag}</p>
              </div>

              {previewActivity.module && (
                <div className="mb-6">
                  <AitbMissionModule activity={previewActivity} savedWords={previewAitbWords}
                    disabled={false} onSave={setPreviewAitbWords} progressId="admin-preview" />
                </div>
              )}

              <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
                ✅ Your mission — +{AITB_POINTS.step} pts per step
              </div>
              <div className="flex flex-col gap-2 mb-5">
                {previewActivity.steps.map((s, i) => {
                  const ticked = previewStepsDone.includes(i)
                  return (
                    <button key={i}
                      onClick={() => setPreviewStepsDone(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]))}
                      className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                      style={{
                        background: ticked ? `${previewActivity.color}1e` : 'rgba(255,255,255,0.05)',
                        border: `2px solid ${ticked ? previewActivity.color : 'rgba(255,255,255,0.1)'}`,
                      }}>
                      <span className="text-3xl">{previewActivity.stepEmojis[i]}</span>
                      <span className={`flex-1 font-bold text-white ${ticked ? 'line-through opacity-70' : ''}`}>{s}</span>
                      <span className="text-2xl">{ticked ? '✅' : i + 1}</span>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-2xl p-3 mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.1)' }}>
                <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">🤖 Your AI tools — tap to open</div>
                <div className="flex flex-wrap gap-2">
                  {previewActivity.apps.map(a => {
                    const url = aitbToolUrl(a)
                    const caption = aitbToolCaption(a)
                    const cls = "px-3 py-2 rounded-xl text-sm font-bold transition-transform active:scale-95"
                    const style = { background: `${previewActivity.color}18`, border: `1.5px solid ${previewActivity.color}55`, color: previewActivity.color }
                    const content = (
                      <>
                        <span className="flex items-center gap-1">{a}{url && ' ↗'}</span>
                        {caption && <span className="block text-[10px] font-bold opacity-70 normal-case">{caption}</span>}
                      </>
                    )
                    return url
                      ? <a key={a} href={url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{content}</a>
                      : <span key={a} className={cls} style={style}>{content}</span>
                  })}
                </div>
              </div>
              <p className="text-center text-xs text-gray-500 font-bold">🧪 Preview only — nothing here is saved.</p>
            </>
          ) : pages.length > 0 ? (
            <>
              <InstructionPage page={pages[previewPage]} hexCode={task.hex_code} />
              {pages.length > 1 && (
                <div className="flex justify-between items-center mt-6">
                  <button
                    onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                    disabled={previewPage === 0}
                    className="px-4 py-2 bg-white/20 text-white rounded-xl disabled:opacity-30 font-bold transition-opacity"
                  >
                    ← Prev
                  </button>
                  <span className="text-white/50 text-sm">{previewPage + 1} / {pages.length}</span>
                  <button
                    onClick={() => setPreviewPage(p => Math.min(pages.length - 1, p + 1))}
                    disabled={previewPage === pages.length - 1}
                    className="px-4 py-2 bg-white/20 text-white rounded-xl disabled:opacity-30 font-bold transition-opacity"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              No instruction pages yet.
            </div>
          )}

          {/* Helpful links — mirrors the participant page */}
          {links.length > 0 && (
            <div className="mt-8">
              <TaskLinkButtons links={links} hexCode={task.hex_code} heading="Use these links to complete your tasks" />
            </div>
          )}

          {/* Static complete button preview */}
          {!previewActivity && <div className="mt-8">
            <button
              disabled
              className="w-full py-4 rounded-2xl text-white text-xl font-black uppercase tracking-wider opacity-50 cursor-default"
              style={{ backgroundColor: task.hex_code, boxShadow: `0 6px 0 ${task.hex_code}88` }}
            >
              Complete Challenge ✅
            </button>
          </div>}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(backPath)} className="text-gray-400 hover:text-gray-600 transition-colors">
              ← Back
            </button>
            <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: task.hex_code }} />
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave()
                  if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(task.title) }
                }}
                disabled={titleSaving}
                className="text-xl font-bold text-gray-900 border-b-2 border-violet-500 outline-none bg-transparent px-1 min-w-0 w-64"
              />
            ) : (
              <button
                onClick={() => { setEditingTitle(true); setTitleValue(task.title) }}
                className="text-xl font-bold text-gray-900 hover:text-violet-600 text-left group flex items-center gap-1.5"
                title="Click to edit title"
              >
                {task.title}
                <span className="text-gray-300 group-hover:text-violet-400 text-sm font-normal">✏️</span>
              </button>
            )}
            <span className="text-sm text-gray-400">{task.color}</span>
          </div>
          <button
            onClick={() => { setPreviewMode(true); setPreviewPage(0); setCarouselIdx(0); reloadPhotos() }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 text-sm transition-colors"
          >
            Preview
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero photos */}
        <div className="mb-6">
          <BingoAdminPhotoUpload taskId={task.id} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('instructions')}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'instructions'
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            📄 Instructions ({pages.length})
          </button>
          <button
            onClick={() => setActiveTab('answer')}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
              activeTab === 'answer'
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            ✏️ Answer Input
            {taskType === 'answer' && <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">ON</span>}
          </button>
        </div>

        {/* Instructions tab */}
        {activeTab === 'instructions' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Instruction Pages ({pages.length})</h2>
              <button
                onClick={handleAddPage}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm transition-colors"
              >
                + Add Page
              </button>
            </div>

            {pages.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                No instruction pages yet. Click "Add Page" to create the first one.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {pages.map((page: BingoTaskPage, index: number) => (
                  <PageForm
                    key={page.id}
                    page={page}
                    index={index}
                    hexCode={task.hex_code}
                    onSave={updatePage}
                    onDelete={deletePage}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    isFirst={index === 0}
                    isLast={index === pages.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Answer tab */}
        {activeTab === 'answer' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Answer Input Settings</h2>

            {/* Task type toggle */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Completion Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button
                  onClick={async () => {
                    setTaskType('standard')
                    if (task) await supabase.from('bingo_tasks').update({ task_type: 'standard', answer_question: null, answer_text: null }).eq('id', task.id)
                  }}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                    taskType === 'standard' ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  👮 Marshal
                </button>
                <button
                  onClick={async () => {
                    setTaskType('photo')
                    if (task) await supabase.from('bingo_tasks').update({ task_type: 'photo', answer_question: null, answer_text: null }).eq('id', task.id)
                  }}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors border-l border-gray-200 ${
                    taskType === 'photo' ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  📸 Photo
                </button>
                <button
                  onClick={async () => {
                    setTaskType('answer')
                    if (task) await supabase.from('bingo_tasks').update({ task_type: 'answer' }).eq('id', task.id)
                  }}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors border-l border-gray-200 ${
                    taskType === 'answer' ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  ✏️ Answer
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {taskType === 'standard'
                  ? 'Participants complete via marshal password.'
                  : taskType === 'photo'
                  ? 'Participants submit a photo — marshal approves in admin.'
                  : 'Participants type the answer — auto-completes when correct.'}
              </p>
            </div>

            {taskType === 'answer' && (
              <>
                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question / Prompt</label>
                  <input
                    type="text"
                    value={answerQuestion}
                    onChange={e => setAnswerQuestion(e.target.value)}
                    placeholder="e.g. Guess the word from the images!"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Answers (one per line)</label>
                  <textarea
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    placeholder={"APPLE\nBANANA\nCHERRY"}
                    rows={4}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Each line becomes a separate text input for the participant.</p>
                </div>

                {/* Live preview */}
                {answerText.trim() && (
                  <div className="mb-5 p-4 rounded-xl border border-dashed border-gray-300 bg-gray-50">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Preview</p>
                    {answerQuestion && <p className="text-sm font-bold text-gray-700 mb-3 text-center">{answerQuestion}</p>}
                    <div className="flex flex-col gap-2">
                      {answerText.trim().split('\n').filter(Boolean).map((line, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                          <div className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-300 font-mono tracking-widest">
                            {line.toUpperCase()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <button
              onClick={handleAnswerSave}
              disabled={answerSaving}
              className="px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
            >
              {answerSaving ? 'Saving...' : 'Save Answer Settings'}
            </button>
          </div>
        )}

        {/* Sign Splice cards carry their own game settings. */}
        {task.task_type === 'sign_splice' && (
          <SignSpliceAdminPanel
            task={task}
            onChange={patch => setTask(prev => (prev ? { ...prev, ...patch } : prev))}
          />
        )}

        {task.task_type === 'breakout_hunt' && <BreakoutHuntAdminPanel taskId={task.id} />}

        {/* The older stand-alone per-team draw. A card that uses one of the
            draw designs deals through its slots instead, so this shows only
            for a card that has no design chosen. */}
        {(task.draw_style === 'list' || (!task.draw_style && (task.draw_count ?? 0) > 0)) && (
        <CardDrawAdminPanel
          task={task}
          onChange={patch => setTask(prev => (prev ? { ...prev, ...patch } : prev))}
        />
        )}

        {/* Completion Warning (for Standard/Marshal mode) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Completion Warning</h2>
          <p className="text-xs text-gray-400 mb-4">Shown above the "Complete Challenge" button in Standard (Marshal) mode.</p>
          <textarea
            value={completionWarning}
            onChange={e => setCompletionWarning(e.target.value)}
            placeholder="e.g. Only tap Complete AFTER receiving your Completion Card from the Marshal!"
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={async () => {
              if (!task) return
              setWarningSaving(true)
              const { error } = await supabase.from('bingo_tasks').update({
                completion_warning: completionWarning.trim() || null,
              }).eq('id', task.id)
              setWarningSaving(false)
              if (error) { alert('Failed to save: ' + error.message); return }
              setTask({ ...task, completion_warning: completionWarning.trim() || null })
            }}
            disabled={warningSaving}
            className="mt-3 px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
          >
            {warningSaving ? 'Saving...' : 'Save Warning'}
          </button>
        </div>

        {/* Maps URL */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Google Maps Link</h2>
          <p className="text-xs text-gray-400 mb-4">If set, participants see a button on this task that opens the location in Google Maps. The link can be a Google Maps URL, a Plus Code, an address, or a place name.</p>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Button label</label>
          <input
            type="text"
            value={mapsLabel}
            onChange={e => setMapsLabel(e.target.value)}
            placeholder="e.g. Petronas Twin Towers"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 mb-3"
          />
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">URL or Plus Code</label>
          <input
            type="text"
            value={mapsUrl}
            onChange={e => setMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/?q=...  or  4MWW+R3 Kuala Lumpur"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={async () => {
              if (!task) return
              setMapsUrlSaving(true)
              const url = mapsUrl.trim() || null
              const label = mapsLabel.trim() || null
              const { error } = await supabase.from('bingo_tasks').update({ maps_url: url, maps_label: label }).eq('id', task.id)
              setMapsUrlSaving(false)
              if (error) { alert('Failed to save: ' + error.message); return }
              setTask({ ...task, maps_url: url, maps_label: label })
            }}
            disabled={mapsUrlSaving}
            className="mt-3 px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
          >
            {mapsUrlSaving ? 'Saving...' : 'Save Maps Link'}
          </button>
        </div>

        {/* Helpful links */}
        <div className="mt-6">
          <TaskLinksEditor
            taskId={task.id}
            hexCode={task.hex_code}
            table="bingo_task_links"
            title="Helpful Links"
            description='Shown to participants below the instructions as "Use these links to complete your tasks". Each link opens in a new tab.'
          />
        </div>

        {/* Draw — style, slots and every option a team can land on. Any card
            can carry one; an AITB card's wheels and cups are the same thing. */}
        <CardDrawEditor
          taskId={task.id}
          style={task.draw_style ?? null}
          spins={task.draw_spins ?? 1}
          images={task.draw_images ?? false}
          onTaskChange={async changes => {
            setTask(prev => (prev ? { ...prev, ...changes } : prev))
            const { error } = await supabase.from('bingo_tasks').update(changes).eq('id', task.id)
            if (error) alert('Failed to save draw settings: ' + error.message)
            void reloadDraw()
          }}
          onSlotsChange={() => { void reloadDraw() }}
        />
      </main>
    </div>
  )
}
