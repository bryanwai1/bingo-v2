import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { BingoAdminPhotoUpload } from '../components/BingoAdminPhotoUpload'
import { SignSpliceAdminPanel } from '../components/SignSpliceAdminPanel'
import { BreakoutHuntAdminPanel } from '../components/BreakoutHuntAdminPanel'
import { PageForm } from '../components/PageForm'
import { InstructionPage } from '../components/InstructionPage'
import { TaskLinksEditor } from '../components/TaskLinksEditor'
import { TaskLinkButtons } from '../components/TaskLinkButtons'
import { ParticleBackground } from '../components/ParticleBackground'
import { CardDrawEditor } from '../components/CardDrawEditor'
import {
  INPUT_KINDS, INPUT_LABELS, fileNoun, inputKinds, effectiveInputs, usesInputs,
  type CompletionInputs,
} from '../lib/completionInputs'
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
  // ?new=1: this row was just inserted blank by the library's "+ Add Challenge",
  // so the editor opens ready to name it and discards it if left untouched.
  const isNew = searchParams.get('new') === '1'
  const [task, setTask] = useState<BingoTask | null>(null)
  // ── Draft editing ──────────────────────────────────────────────────────────
  // Every field on the card used to write to the database the moment it
  // changed, so there was no way to try something and back out, and no signal
  // that anything had been saved at all. Edits now accumulate here and are
  // committed by one explicit Save.
  //
  // Only the card's OWN columns are buffered. Photos, instruction pages, links
  // and draw options are separate records with their own add/remove controls
  // (and, for photos, real uploads), so they still apply immediately.
  const [pending, setPending] = useState<Partial<BingoTask>>({})
  const [saving, setSaving] = useState(false)
  // Whether anything has been committed yet. A new card that has been saved
  // once is real content and must never be deleted by a later discard.
  const [savedOnce, setSavedOnce] = useState(false)
  const isDirty = Object.keys(pending).length > 0
  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  /** Record a change locally; it reaches the database on Save. */
  const stage = useCallback((patch: Partial<BingoTask>) => {
    setTask(prev => (prev ? { ...prev, ...patch } : prev))
    setPending(prev => ({ ...prev, ...patch }))
  }, [])

  const [saveError, setSaveError] = useState('')
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!task || Object.keys(pending).length === 0) return true
    setSaving(true)
    const { error } = await supabase.from('bingo_tasks').update(pending).eq('id', task.id)
    setSaving(false)
    if (error) { setSaveError('Could not save: ' + error.message); return false }
    setSaveError('')
    setPending({})
    setSavedOnce(true)
    return true
  }, [task, pending])

  // Covers a refresh, a closed tab or a link out of the app — the in-app Back
  // button is handled separately so it can offer to save rather than just warn.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const { reload: reloadDraw } = useCardDrawConfig(taskId)
  // Card details row (category / points / type) — the fields the old inline
  // create form collected, now editable here.
  const [categoryRows, setCategoryRows] = useState<{ name: string; sort_order: number }[]>([])
  const [siblingCards, setSiblingCards] = useState<Pick<BingoTask, 'id' | 'title' | 'category' | 'color' | 'hex_code'>[]>([])
  const [pointsValue, setPointsValue] = useState('0')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [activeTab, setActiveTab] = useState<'instructions' | 'answer'>('instructions')
  // Answer tab state
  const [taskType, setTaskType] = useState<'standard' | 'answer' | 'photo' | 'video' | 'media'>('standard')
  const [inputs, setInputs] = useState<CompletionInputs>({})

  /**
   * Save the card's completion setup. task_type stays in step with the set so
   * older code paths (and the card library's badges) still read sensibly: a
   * card collecting files is 'photo'/'video'/'media', one collecting only a
   * typed answer is 'answer', and no inputs at all means marshal.
   */
  const saveInputs = async (_hint: string, next: CompletionInputs) => {
    if (!task) return
    const kinds = inputKinds(next)
    const type = kinds.length === 0
      ? 'standard'
      : next.photo && next.video ? 'media'
      : next.video ? 'video'
      : next.photo ? 'photo'
      : 'answer'
    setInputs(next)
    setTaskType(type as typeof taskType)
    const patch: Partial<BingoTask> = { task_type: type as BingoTask['task_type'], completion_inputs: next }
    // Dropping the typed answer clears the question with it.
    if (!next.answer) { patch.answer_question = null; patch.answer_text = null; patch.answer_min = null }
    stage(patch)
  }
  const [answerQuestion, setAnswerQuestion] = useState('')
  const [answerText, setAnswerText] = useState('')
  // Number answer with a floor; '' = normal letter-box answer.
  const [answerMin, setAnswerMin] = useState('')
  const [completionWarning, setCompletionWarning] = useState('')
  // Chained cards: which card on this board has to be completed first.
  const [prereqId, setPrereqId] = useState<string>('')
  const [boardCards, setBoardCards] = useState<{ id: string; title: string }[]>([])
  const [mapsUrl, setMapsUrl] = useState('')
  const [mapsLabel, setMapsLabel] = useState('')
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
        setTitleValue(isNew ? '' : data.title)
        if (isNew) setEditingTitle(true)
        setPointsValue(String(data.points ?? 0))
        // All categories across every board, so the dropdown is the same
        // wherever the card lives.
        supabase.from('bingo_categories').select('name, sort_order').order('sort_order')
          .then(({ data: rows }) => setCategoryRows((rows ?? []) as { name: string; sort_order: number }[]))
        setTaskType((data.task_type ?? 'standard') as 'standard' | 'answer' | 'photo' | 'video' | 'media')
        setInputs(effectiveInputs(data.task_type, data.completion_inputs))
        setAnswerQuestion(data.answer_question ?? '')
        setAnswerText(data.answer_text ?? '')
        setAnswerMin(data.answer_min != null ? String(data.answer_min) : '')
        setCompletionWarning(data.completion_warning ?? '')
        setPrereqId(data.prerequisite_task_id ?? '')
        setMapsUrl(data.maps_url ?? '')
        supabase.from('bingo_tasks').select('id, title, category, color, hex_code').eq('section_id', data.section_id).neq('id', data.id).order('title')
          .then(({ data: rows }) => {
            const list = (rows ?? []) as typeof siblingCards
            setSiblingCards(list)
            setBoardCards(list.map(r => ({ id: r.id, title: r.title })))
          })
        setMapsLabel(data.maps_label ?? '')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isNew is fixed for the page's lifetime
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
    stage({ title: titleValue.trim() })
    setEditingTitle(false)
  }

  // Every category name across all boards, plus whatever text sibling cards
  // carry (a copied card can have a category with no row).
  const categoryNames = (() => {
    const names = new Set<string>()
    categoryRows.forEach(c => names.add(c.name))
    siblingCards.forEach(t => { if (t.category?.trim()) names.add(t.category.trim()) })
    if (task?.category?.trim()) names.add(task.category.trim())
    return [...names].sort((a, b) => a.localeCompare(b))
  })()

  const saveDetails = async (patch: Partial<BingoTask>) => {
    if (!task) return
    stage(patch)
  }

  // A card takes its category's colour, so changing category re-colours it
  // to match a sibling in that category (default blue when it's the first).
  const handleCategoryChange = async (name: string) => {
    if (!task) return
    const sibling = siblingCards.find(t => (t.category ?? '') === name && t.hex_code)
    await saveDetails({
      category: name,
      hex_code: sibling?.hex_code ?? '#3B82F6',
      color: sibling?.color?.trim() || name || 'Blue',
    })
  }

  const handleNewCategory = async () => {
    if (!task) return
    const raw = window.prompt('New category name:')
    const name = raw?.trim()
    if (!name) return
    if (!categoryRows.some(c => c.name === name)) {
      const maxOrder = categoryRows.reduce((m, c) => Math.max(m, c.sort_order), -1)
      const { error } = await supabase.from('bingo_categories')
        .insert({ section_id: task.section_id, name, sort_order: maxOrder + 1 })
      if (error) { alert('Failed to create category: ' + error.message); return }
      setCategoryRows(prev => [...prev, { name, sort_order: maxOrder + 1 }])
    }
    await handleCategoryChange(name)
  }

  const handlePointsSave = async () => {
    if (!task) return
    const n = Math.max(0, parseFloat(pointsValue) || 0)
    setPointsValue(String(n))
    if (n === (task.points ?? 0)) return
    await saveDetails({ points: n })
  }

  // Standard / Sign Splice / Breakout. Leaving a special type goes back to
  // 'standard'; the Answer tab's saveInputs refines it from there.
  const handleCardTypeChange = async (type: 'standard' | 'sign_splice' | 'breakout_hunt') => {
    if (!task) return
    const current = task.task_type === 'sign_splice' || task.task_type === 'breakout_hunt' ? task.task_type : 'standard'
    if (type === current) return
    await saveDetails({ task_type: type })
    if (type === 'standard') setTaskType('standard')
  }

  // Back from a fresh, still-blank card deletes it rather than leaving an
  // "Untitled challenge" behind in the library.
  // Leaving with unsaved edits asks first, rather than dropping them silently.
  const [leavePrompt, setLeavePrompt] = useState(false)

  /**
   * Remove a still-blank card created by "+ Add Challenge".
   *
   * Guarded on `savedOnce`, not on the title: the title shown may be a staged
   * edit that never reached the database, and once Save has been pressed the
   * card holds real work that must survive a later discard. Pages and photos
   * write immediately, so either one means the card is no longer a placeholder.
   */
  const discardNewCard = async (askFirst: boolean) => {
    if (!isNew || !task || savedOnce) return
    if (pages.length > 0 || photos.length > 0) return
    if (askFirst && !window.confirm('Discard this empty challenge?')) return
    const { error } = await supabase.from('bingo_tasks').delete().eq('id', task.id)
    if (error) setSaveError('Could not discard: ' + error.message)
  }

  const leaveNow = async (askBeforeDiscard: boolean) => {
    // A fresh card that was never saved is a placeholder, not content — going
    // back should not leave "Untitled challenge" behind in the library.
    await discardNewCard(askBeforeDiscard)
    navigate(backPath)
  }

  const handleBack = async () => {
    if (isDirty) { setLeavePrompt(true); return }
    await leaveNow(true)
  }

  const handleAnswerSave = async () => {
    if (!task) return
    const cleanedAnswerText = answerText.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    // Gated on the answer INPUT, not the legacy task_type: a photo + answer
    // card is typed 'photo' and still has a question to keep.
    const min = answerMin.trim() === '' ? null : Math.max(0, Math.round(Number(answerMin)))
    const payload = {
      task_type: taskType,
      answer_question: inputs.answer ? answerQuestion.trim() || null : null,
      answer_min: inputs.answer && min != null && Number.isFinite(min) ? min : null,
      answer_text: inputs.answer && min == null ? cleanedAnswerText || null : null,
    }
    setAnswerText(cleanedAnswerText)
    stage(payload)
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
            <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 transition-colors">
              ← Back
            </button>
            <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: task.hex_code }} />
            {editingTitle ? (
              <input
                autoFocus
                placeholder="Challenge name"
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave()
                  if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(task.title) }
                }}
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
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold whitespace-nowrap ${isDirty ? 'text-amber-600' : 'text-green-600'}`}>
              {isDirty ? '● Unsaved changes' : '✓ All changes saved'}
            </span>
            <button
              onClick={() => { setPreviewMode(true); setPreviewPage(0); setCarouselIdx(0); reloadPhotos() }}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 text-sm transition-colors"
            >
              Preview
            </button>
            <button
              onClick={() => { void saveNow() }}
              disabled={!isDirty || saving}
              title={isDirty
                ? 'Save your changes to this card'
                : 'Nothing to save — photos, pages and links save on their own'}
              className="px-5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {saveError && (
          <div className="max-w-4xl mx-auto mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
            {saveError}
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {isNew && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-violet-50 border border-violet-200 text-sm text-violet-800">
            <span className="font-bold">New challenge</span> — give it a name, pick a category, points and card type, then add instructions and photos below. Press <span className="font-bold">Save</span> when you are done; instructions, photos and links apply straight away.
          </div>
        )}

        {/* Card details: category / points / type */}
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              <select
                value={task.category ?? ''}
                disabled={false}
                onChange={e => {
                  if (e.target.value === '__new__') { handleNewCategory(); return }
                  handleCategoryChange(e.target.value)
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">— Uncategorized —</option>
                {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
                <option value="__new__">+ New category…</option>
              </select>
            </div>
            <div className="w-full md:w-28">
              <label className="block text-sm font-medium text-gray-600 mb-1">Points</label>
              <input
                type="number" step="0.1" min={0}
                value={pointsValue}
                disabled={false}
                onChange={e => setPointsValue(e.target.value)}
                onBlur={handlePointsSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center font-bold"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">Card Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                {([
                  ['standard', 'Standard', 'Photo, video, link, text or versus — choose the inputs in the Answer Input tab'],
                  ['sign_splice', 'Sign Splice', 'Teams hunt each letter of their movie title on a different shop sign'],
                  ['breakout_hunt', 'Breakout', 'Teams decode 10 puzzles, then photograph each object in the venue'],
                ] as const).map(([value, label, tip]) => {
                  const active = value === 'standard'
                    ? task.task_type !== 'sign_splice' && task.task_type !== 'breakout_hunt'
                    : task.task_type === value
                  return (
                    <button
                      key={value} type="button" title={tip} disabled={false}
                      onClick={() => handleCardTypeChange(value)}
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${active ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

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
              <div>
                <h2 className="text-lg font-bold text-gray-900">Instruction Pages ({pages.length})</h2>
                <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Pages save as you edit them</p>
              </div>
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

            {/* Marshal is on its own — a password vouches for the whole card.
                Everything else is a set the admin picks from, each piece either
                compulsory or optional. */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">How this card is completed</label>

              <button
                onClick={() => saveInputs('standard', {})}
                className={`w-full py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  taskType === 'standard'
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                👮 Marshal password only
              </button>

              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-4 mb-2">
                …or collect any combination of these
              </p>

              <div className="flex flex-col gap-2">
                {INPUT_KINDS.map(kind => {
                  const rule = inputs[kind]
                  return (
                    <div key={kind} className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      rule ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'
                    }`}>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!rule}
                          onChange={e => {
                            const next = { ...inputs }
                            if (e.target.checked) next[kind] = 'required'
                            else delete next[kind]
                            saveInputs(Object.keys(next).length ? 'answer' : 'standard', next)
                          }}
                        />
                        <span className="text-sm font-bold text-gray-700">
                          {INPUT_LABELS[kind].emoji} {INPUT_LABELS[kind].label}
                          {kind === 'versus' && <span className="ml-2 text-xs font-medium text-gray-400">team picks who they battled + won/lost</span>}
                        </span>
                      </label>
                      {rule && (
                        <div className="flex rounded-md overflow-hidden border border-violet-200">
                          {(['required', 'optional'] as const).map(r => (
                            <button
                              key={r}
                              onClick={() => saveInputs('answer', { ...inputs, [kind]: r })}
                              className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                                rule === r ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-violet-50'
                              }`}
                            >
                              {r === 'required' ? 'Compulsory' : 'Optional'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-gray-400 mt-2">
                {taskType === 'standard' && !usesInputs(inputs)
                  ? 'Participants complete via marshal password.'
                  : (() => {
                      const kinds = inputKinds(inputs)
                      const must = kinds.filter(k => inputs[k] === 'required').map(k => INPUT_LABELS[k].label)
                      if (kinds.length === 0) return 'Pick at least one input, or leave the card on marshal.'
                      return must.length > 0
                        ? `The tile turns green once ${must.join(' and ')} ${must.length > 1 ? 'are' : 'is'} in — a marshal approves each submission in admin.`
                        : 'Everything here is optional, so any one of them completes the card.'
                    })()}
              </p>
            </div>

            {/* Photo cards: one shot, or as many as the challenge needs. Each
                photo is reviewed on its own in the admin either way. */}
            {(inputs.photo || inputs.video) && task && (
              <label className="flex items-start gap-2.5 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={task.photo_multiple ?? false}
                  onChange={e => stage({ photo_multiple: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-700">
                    Allow multiple {fileNoun(inputs, true)}
                  </span>
                  <span className="block text-xs text-gray-400">
                    The team can keep sending {fileNoun(inputs, true)} instead of stopping after one.
                    Each arrives separately on the admin Photos page to approve or reject.
                  </span>
                </span>
              </label>
            )}

            {inputs.answer && (
              <>
                <p className="mb-4 text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 leading-relaxed">
                  <span className="font-bold text-gray-700">Three ways a Text input can work:</span>{' '}
                  save <span className="font-semibold">answers</span> below and the team fills letter boxes that check themselves;
                  set a <span className="font-semibold">minimum number</span> and one number is checked on the spot;
                  or leave both empty and the team writes <span className="font-semibold">free text</span> that goes to you to approve, like a photo.
                </p>
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
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Minimum number (auto-pass)</label>
                  <input
                    type="number" min={0} value={answerMin}
                    onChange={e => setAnswerMin(e.target.value)}
                    placeholder="e.g. 18000 - leave empty for a text answer"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Set this and the participant types one number; the server passes it when it is at least this value. The answers below are then ignored.
                  </p>
                </div>

                <div className={`mb-5${answerMin.trim() ? ' opacity-40 pointer-events-none' : ''}`}>
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
                            className="px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
            >
              Apply answer settings
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

        {/* Completion Warning / lock message, and the chain it belongs to */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Unlocks after</h2>
          <p className="text-xs text-gray-400 mb-3">
            Pick a card a team must complete before this one opens. Locked teams see the warning below and a button to that card.
            Leave as “none” for a normal card.
          </p>
          <select
            value={prereqId}
            onChange={e => setPrereqId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-6"
          >
            <option value="">— none (always open) —</option>
            {boardCards.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>

          <h2 className="text-lg font-bold text-gray-900 mb-1">Completion Warning</h2>
          <p className="text-xs text-gray-400 mb-4">
            Shown above the "Complete Challenge" button in Standard (Marshal) mode, and as the lock message on a chained card.
          </p>
          <textarea
            value={completionWarning}
            onChange={e => setCompletionWarning(e.target.value)}
            placeholder="e.g. Only tap Complete AFTER receiving your Completion Card from the Marshal!"
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={() => stage({
              completion_warning: completionWarning.trim() || null,
              prerequisite_task_id: prereqId || null,
            })}
            className="mt-3 px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
          >
            Apply warning
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
            onClick={() => stage({
              maps_url: mapsUrl.trim() || null,
              maps_label: mapsLabel.trim() || null,
            })}
            className="mt-3 px-6 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm font-bold transition-colors disabled:opacity-50"
          >
            Apply maps link
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

      {/* Leaving with unsaved edits. Three ways out rather than a blunt
          confirm: the common case is that you meant to save. */}
      {leavePrompt && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center px-4"
          onClick={() => setLeavePrompt(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900">Save your changes?</h2>
            <p className="text-sm text-gray-600 mt-1.5">
              You have unsaved edits to <span className="font-bold">{task.title}</span>.
              {isNew && ' Discarding removes this new card.'}
            </p>
            {saveError && <p className="mt-2 text-xs font-bold text-red-600">{saveError}</p>}
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={async () => {
                  const ok = await saveNow()
                  if (!ok) return          // keep the dialog open so the error is visible
                  setLeavePrompt(false)
                  navigate(backPath)
                }}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save and leave'}
              </button>
              <button
                onClick={async () => { setLeavePrompt(false); setPending({}); await leaveNow(false) }}
                disabled={saving}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Discard changes
              </button>
              <button
                onClick={() => setLeavePrompt(false)}
                className="w-full py-2 text-gray-500 font-bold text-sm hover:text-gray-700"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
