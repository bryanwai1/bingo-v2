import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoDashTeam } from '../hooks/useBingoDashTeam'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useBingoScans } from '../hooks/useBingoScans'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { TaskLinkButtons } from '../components/TaskLinkButtons'
import { InstructionPage } from '../components/InstructionPage'
import { PageNavigator } from '../components/PageNavigator'
import { SwipeablePages } from '../components/SwipeablePages'
import { ParticleBackground } from '../components/ParticleBackground'
import { TimeUpAlarm } from '../components/TimeUpAlarm'
import { ContestCard } from '../components/ContestCard'
import { SignSpliceCard } from '../components/SignSpliceCard'
import { SpeedEditTargets } from '../components/SpeedEditTargets'
import { SampleTreeApp } from '../components/SampleTreeApp'
import { RetroGamesSample } from '../components/RetroGamesSample'
import { BundleCard } from '../components/BundleCard'
import { AitbMissionModule } from '../components/AitbMissionModule'
import { BonusBar } from '../components/AitbBonusBar'
import { aitbByName, aitbToolUrl, aitbToolCaption, AITB_POINTS, aitbWithTimer } from '../lib/aitbActivities'
import { normalizeUrl } from '../lib/normalizeUrl'
import type { BingoScan, BingoTask } from '../types/database'

async function compressToJpeg(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  let width = 0, height = 0
  let drawSource: CanvasImageSource | null = null
  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null
  let imgEl: HTMLImageElement | null = null
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      width = bitmap.width
      height = bitmap.height
      drawSource = bitmap
    } catch {
      objectUrl = URL.createObjectURL(file)
      imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('decode-failed'))
        i.src = objectUrl!
      })
      width = imgEl.naturalWidth
      height = imgEl.naturalHeight
      drawSource = imgEl
    }
    if (!width || !height) throw new Error('decode-failed')
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-context-failed')
    ctx.drawImage(drawSource, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob-failed')), 'image/jpeg', quality)
    })
  } finally {
    bitmap?.close?.()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export function BingoDashParticipant() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSnakeLadder = searchParams.get('from') === 'snake-ladder'
  const snakeTileParam = searchParams.get('tile')
  const snakeTile = snakeTileParam ? parseInt(snakeTileParam, 10) : null
  const [backPath, setBackPath] = useState(isSnakeLadder ? '/snake-ladder' : '/bingo-dash')
  const { team, loading: teamLoading, isRegistered, leaveTeam } = useBingoDashTeam()
  const isObserver = !isSnakeLadder && localStorage.getItem('bingo-dash-member-role') === 'observer'
  const { pages, loading: pagesLoading } = useBingoTaskPages(taskId)
  const { photos, loading: photosLoading } = useBingoTaskPhotos(taskId)
  const { links } = useTaskLinks(taskId, 'bingo_task_links')
  const { recordScan, toggleComplete, submitTile, saveWords, saveSteps } = useBingoScans()
  const memberId = localStorage.getItem('bingo-dash-member-id')
  const isLeader = localStorage.getItem('bingo-dash-member-role') === 'leader'
  const [submittedForApproval, setSubmittedForApproval] = useState(false)

  const [task, setTask] = useState<BingoTask | null>(null)
  const [showSplash, setShowSplash] = useState(!isSnakeLadder)
  const [scanRecord, setScanRecord] = useState<{ id: string; completed: boolean; words: string[]; stepsDone: number[]; scannedAt: string } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [scanRecorded, setScanRecorded] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // Snake & Ladder mode: team picker state
  // Marshal password state
  const [marshalPassword, setMarshalPassword] = useState('')
  const [marshalInput, setMarshalInput] = useState('')
  const [marshalError, setMarshalError] = useState('')
  // Global photo submissions toggle (controlled from marshal admin)
  const [photoSubmissionsEnabled, setPhotoSubmissionsEnabled] = useState(true)
  // Photo submission state
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoSubmitted, setPhotoSubmitted] = useState(false)
  // Answer-input state: one string per answer row
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const [carouselIdx, setCarouselIdx] = useState(0)
  const letterRefs = useRef<(HTMLInputElement | null)[][]>([])

  // Send the player back to THEIR OWN board. /bingo-dash always resolves the
  // house board (the global bingo_settings pointer only moves for the owner),
  // so a sub account's player finishing a tile would otherwise land in someone
  // else's game. Only diverge when the team's board isn't the global one, so
  // the owner's players keep the exact route they have today.
  useEffect(() => {
    if (isSnakeLadder || !team?.section_id) return
    let cancelled = false
    ;(async () => {
      const [{ data: settings }, { data: section }] = await Promise.all([
        supabase.from('bingo_settings').select('active_section_id').eq('id', 'main').maybeSingle(),
        supabase.from('bingo_sections').select('slug').eq('id', team.section_id).maybeSingle(),
      ])
      if (cancelled || !section?.slug) return
      if (settings?.active_section_id !== team.section_id) {
        setBackPath(`/bingo-dash/play/${section.slug}`)
      }
    })()
    return () => { cancelled = true }
  }, [isSnakeLadder, team?.section_id])

  const focusLetter = useCallback((rowIdx: number, charIdx: number) => {
    letterRefs.current[rowIdx]?.[charIdx]?.focus()
  }, [])

  useEffect(() => {
    if (!taskId) return
    supabase.from('bingo_tasks').select('*').eq('id', taskId).single().then(({ data }) => {
      if (data) {
        setTask(data)
        if (data.task_type === 'answer' && data.answer_text) {
          const rows = data.answer_text.split('\n').map((r: string) => r.trim()).filter(Boolean)
          // Restore saved answers from localStorage
          const saved = localStorage.getItem(`bingo-answers-${taskId}`)
          if (saved) {
            try {
              const parsed = JSON.parse(saved) as string[]
              setAnswerInputs(rows.map((_r: string, i: number) => parsed[i] ?? ''))
            } catch { setAnswerInputs(rows.map(() => '')) }
          } else {
            setAnswerInputs(rows.map(() => ''))
          }
        }
      }
    })
  }, [taskId])

  // Load the board's marshal password + photo-submissions toggle, subscribe to live changes
  const sectionId = team?.section_id ?? null
  useEffect(() => {
    if (isSnakeLadder || !sectionId) return
    const applySettings = (data: { marshal_password?: string | null; photo_submissions_enabled?: boolean | null } | null) => {
      if (!data) return
      if (typeof data.marshal_password === 'string') setMarshalPassword(data.marshal_password)
      if (typeof data.photo_submissions_enabled === 'boolean') {
        setPhotoSubmissionsEnabled(data.photo_submissions_enabled)
      }
    }
    supabase.from('bingo_sections').select('marshal_password, photo_submissions_enabled').eq('id', sectionId).single()
      .then(({ data }) => applySettings(data))
    const channel = supabase
      .channel('bingo-section-participant')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `id=eq.${sectionId}` }, (payload) => {
        applySettings(payload.new as { marshal_password?: string | null; photo_submissions_enabled?: boolean | null })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isSnakeLadder, sectionId])

  // ── AI Team Building card ───────────────────────────────────────────────
  // An imported AITB activity gets its own mission brief (hero, steps, props,
  // interactive draw, tool buttons) instead of the generic instruction pages.
  // Completion is unchanged: marshal password → toggleComplete → scoreboard.
  // Matched by title against the AITB activity table (aitbByName), same as
  // the bundle tile — a card is "an AITB card" purely by carrying one of
  // those names, whether it's played standalone or inside the bundle.
  const aitbBase = task ? aitbByName(task.title) : undefined
  // A card can rescale or switch off the AITB bonus clock — see
  // supabase/020_aitb_card_timer.sql.
  const aitbActivity = aitbBase ? aitbWithTimer(aitbBase, task?.aitb_timer_minutes) : undefined
  const aitbTimerOn = task?.aitb_timer_enabled !== false

  // The draw / typed words belong to the TEAM, not the phone that made them —
  // a roulette spin on one handset has to reach the teammate holding the other.
  // Writes BEFORE touching local state on purpose: the spin/deal modules call
  // this from inside a setState updater, so a synchronous setScanRecord here
  // would be a render-phase update of this page from inside the module.

  // Pull a teammate's draw in live. Only mounted for AITB cards — every other
  // card type has nothing on the row that can change from another phone.
  useEffect(() => {
    if (!aitbActivity || !scanRecord) return
    const channel = supabase
      .channel(`bingo-scan-words-${scanRecord.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_scans', filter: `id=eq.${scanRecord.id}` },
        ({ new: updated }) => {
          const row = updated as BingoScan
          setScanRecord(prev => (prev ? { ...prev, completed: row.completed, words: row.words ?? [], stepsDone: row.steps_done ?? [] } : prev))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [aitbActivity, scanRecord?.id]) // eslint-disable-line react-hooks/exhaustive-deps


  // Persist answer inputs to localStorage
  useEffect(() => {
    if (taskId && answerInputs.length > 0) {
      localStorage.setItem(`bingo-answers-${taskId}`, JSON.stringify(answerInputs))
    }
  }, [taskId, answerInputs])

  // Derived: the answer rows expected by the task
  const answerRows = task?.task_type === 'answer' && task.answer_text
    ? task.answer_text.split('\n').map(r => r.trim()).filter(Boolean)
    : []

  const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase()

  // True when every row is fully and correctly filled (case-insensitive)
  const answerMatches = answerRows.length > 0 && answerRows.every(
    (row, i) => normalize(answerInputs[i] ?? '') === normalize(row)
  )

  useEffect(() => {
    if (isSnakeLadder) return
    if (team && taskId && !scanRecorded) {
      recordScan(team.id, taskId).then((scan) => {
        setScanRecorded(true)
        if (scan) setScanRecord({
          id: scan.id, completed: scan.completed, words: scan.words ?? [],
          stepsDone: scan.steps_done ?? [], scannedAt: scan.scanned_at,
        })
      })
    }
  }, [isSnakeLadder, team, taskId, scanRecorded, recordScan])

  // The AITB bonus ladder counts up live, same as the bundle mission.
  useEffect(() => {
    if (!aitbActivity || !scanRecord || scanRecord.completed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [aitbActivity, scanRecord?.completed, scanRecord?.id])

  const toggleAitbStep = (i: number) => {
    if (!scanRecord || scanRecord.completed) return
    const on = !scanRecord.stepsDone.includes(i)
    const next = on ? [...scanRecord.stepsDone, i] : scanRecord.stepsDone.filter(x => x !== i)
    setScanRecord({ ...scanRecord, stepsDone: next })
    void saveSteps(scanRecord.id, next)
  }

  // Auto-complete when answer-input card answer is correct
  useEffect(() => {
    if (isSnakeLadder) return
    if (!answerMatches || !scanRecord || scanRecord.completed || completing) return
    setCompleting(true)
    toggleComplete(scanRecord.id, true).then(() => {
      setScanRecord(prev => prev ? { ...prev, completed: true } : prev)
      setCompleting(false)
    })
  }, [answerMatches]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLeave = async () => {
    setLeaving(true)
    leaveTeam()
    setScanRecorded(false)
    setScanRecord(null)
    setShowLeaveConfirm(false)
    setLeaving(false)
  }

  const handlePhotoUpload = async (file: File) => {
    if (!team || !taskId || !scanRecord) return
    if (file.size > 25 * 1024 * 1024) { alert('Photo too large (max 25 MB).'); return }
    setPhotoUploading(true)
    try {
      let upload: Blob = file
      try {
        upload = await compressToJpeg(file)
      } catch (err) {
        if (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)) {
          alert("This iPhone photo format (HEIC) couldn't be processed on this device. In iPhone Settings → Camera → Formats, choose 'Most Compatible', or share the photo via the Photos app.")
          return
        }
        console.warn('Image compression failed, uploading original:', err)
      }
      const path = `bingo-media/photo-submissions/${team.id}-${taskId}-${Date.now()}.jpg`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, upload, { upsert: false, contentType: 'image/jpeg' })
      if (uploadErr) { alert('Upload failed: ' + uploadErr.message); return }
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      const { error: insertErr } = await supabase.from('bingo_photo_submissions').insert({
        team_id: team.id,
        task_id: taskId,
        scan_id: scanRecord.id,
        photo_url: urlData.publicUrl,
        status: 'pending',
      })
      if (insertErr) { alert('Could not save submission: ' + insertErr.message); return }
      setPhotoSubmitted(true)
    } finally {
      setPhotoUploading(false)
    }
  }

  // The bingo time-up alarm overlays every state below — only mounted in the
  // bingo flow so Snake & Ladder players are unaffected.
  const timeUpOverlay = !isSnakeLadder ? <TimeUpAlarm sectionId={team?.section_id ?? null} /> : null

  // ── Loading ─────────────────────────────────────────────────────────
  if ((!isSnakeLadder && teamLoading) || !task) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <div className="text-gray-400 text-xl font-bold animate-pulse">Loading...</div>
        </div>
        {timeUpOverlay}
      </>
    )
  }

  // ── Registration (Bingo Dash only — Snake & Ladder picks a team on completion) ─
  // Admin creates teams in advance; participants must join from /bingo-dash (search + password).
  if (!isSnakeLadder && !isRegistered) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-center px-6">
          <ParticleBackground />
          <div className="relative z-10 max-w-sm">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-white text-2xl font-black mb-2">Join your group first</h2>
            <p className="text-gray-400 text-sm mb-6">
              You need to pick your group before you can complete this task.
            </p>
            <button
              onClick={() => navigate(backPath)}
              className="px-6 py-3 rounded-2xl text-white font-black text-base"
              style={{ backgroundColor: '#a855f7', boxShadow: '0 8px 24px #a855f744' }}
            >
              Go to Join Page →
            </button>
          </div>
        </div>
        {timeUpOverlay}
      </>
    )
  }

  if (pagesLoading || photosLoading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <div className="text-gray-400 text-xl font-bold animate-pulse">Loading challenge...</div>
        </div>
        {timeUpOverlay}
      </>
    )
  }

  // ── Splash ───────────────────────────────────────────────────────────
  if (showSplash) {
    return (
      <>
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white overflow-hidden"
        style={{ backgroundColor: task.hex_code }}
        onClick={() => setShowSplash(false)}
      >
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 text-center px-8 animate-bounce-in">
          <div className="text-6xl mb-6">{isSnakeLadder ? '🐍🪜' : aitbActivity?.emoji ?? '🎯'}</div>
          <p className="text-sm font-bold opacity-70 uppercase tracking-[0.2em] mb-2">
            {aitbActivity ? `Activity ${aitbActivity.act} · ${aitbActivity.mins} min` : `${task.color} Challenge`}
          </p>
          <h1 className="text-5xl font-black tracking-tight mb-4 leading-tight">
            {task.title}
          </h1>
          <div className="w-16 h-1 bg-white/40 rounded-full mx-auto mb-6" />
          {aitbActivity && (
            <p className="text-lg opacity-90 font-bold mb-3 leading-snug">{aitbActivity.tagline}</p>
          )}
          {isSnakeLadder ? (
            snakeTile != null && (
              <p className="text-lg opacity-80 font-medium mb-2">Tile {snakeTile}</p>
            )
          ) : (
            <p className="text-lg opacity-80 font-medium mb-2">Team: {team?.name}</p>
          )}
        </div>

        <button
          className="relative z-10 mt-8 px-10 py-4 bg-white/20 backdrop-blur-sm rounded-2xl text-xl font-black uppercase tracking-wider border-2 border-white/30 hover:bg-white/30 active:scale-95 transition-all animate-slide-up"
          style={{ animationDelay: '0.4s' }}
          onClick={(e) => { e.stopPropagation(); setShowSplash(false) }}
        >
          Start Challenge
        </button>
        <p className="relative z-10 mt-4 text-sm opacity-50 animate-pulse">Tap anywhere to begin</p>
      </div>
      {timeUpOverlay}
      </>
    )
  }

  // ── Main view ────────────────────────────────────────────────────────
  // Every card widens with the viewport, not just the AITB ones: instructions,
  // photos and answer inputs all read better on a projector or a laptop than
  // in a phone-width column, and a phone still gets the narrow column at its
  // own breakpoint. AITB goes one step wider because its wheel/deal modules
  // need the room.
  const containerMaxW = aitbActivity
    ? 'max-w-lg sm:max-w-2xl lg:max-w-4xl'
    : 'max-w-lg sm:max-w-xl lg:max-w-3xl'

  return (
    <>
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ backgroundColor: `color-mix(in srgb, ${task.hex_code} 50%, #0a0a0a)` }}
    >
      <ParticleBackground hexCode={task.hex_code} />

      {/* Header */}
      <header className="px-6 py-5 text-white relative z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundColor: task.hex_code, opacity: 0.35 }} />
        <div className="absolute inset-0 bg-black/30" />
        <div className={`${containerMaxW} mx-auto relative z-10 flex items-start justify-between gap-4`}>
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate(backPath)}
              className="mt-1 flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white/80 hover:text-white text-xs font-bold transition-colors"
            >
              ← Board
            </button>
            <div>
              <p className="text-sm font-bold opacity-80 uppercase tracking-wider">
                {isSnakeLadder
                  ? (snakeTile != null ? `🐍🪜 Tile ${snakeTile}` : '🐍🪜 Snake & Ladder')
                  : `Team: ${team?.name}`}
              </p>
              <h1 className="text-3xl font-black tracking-tight">{task.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm opacity-70 uppercase tracking-wider">{task.color} Challenge</span>
                {(task.points ?? 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white/20 text-white">
                    {task.points} pts
                  </span>
                )}
              </div>
            </div>
          </div>
          {!isSnakeLadder && (
            <div className="flex-shrink-0 mt-1">
              {!showLeaveConfirm ? (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Leave
                </button>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-white/60">Leave team?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowLeaveConfirm(false)} className="text-xs text-white/40 hover:text-white/70 transition-colors">Cancel</button>
                    <button
                      onClick={handleLeave}
                      disabled={leaving}
                      className="text-xs text-red-400 hover:text-red-300 font-bold transition-colors disabled:opacity-50"
                    >
                      {leaving ? '...' : 'Yes, leave'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={`${containerMaxW} mx-auto px-6 py-8 relative z-10`}>
        {/* Photo carousel */}
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

        {/* Maps button */}
        {task.maps_url && (
          <div className="mb-5 animate-slide-up">
            <a
              href={normalizeUrl(task.maps_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-black text-sm text-white border-2 border-white/30 bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
            >
              📍 {task.maps_label?.trim() || 'Open in Maps'}
            </a>
          </div>
        )}

        {/* AI Team Building brief — replaces the generic pages entirely: a
            live bonus timer, the real description + skill tag, then the
            module and a tickable mission checklist instead of swipeable
            instruction pages. */}
        {aitbActivity && scanRecord ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-1 rounded-lg text-xs font-black uppercase" style={{ background: `${aitbActivity.color}22`, color: aitbActivity.color }}>
                {aitbActivity.difficulty}
              </span>
              {scanRecord.completed && (
                <span className="px-2 py-1 rounded-lg text-xs font-black bg-emerald-400/20 text-emerald-300">
                  ✓ Completed
                </span>
              )}
            </div>
            {aitbTimerOn && <BonusBar
              elapsedMs={scanRecord.completed ? 0 : now - new Date(scanRecord.scannedAt).getTime()}
              activity={aitbActivity} completed={scanRecord.completed} bankedBonus={0} />}
            <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
              <h2 className="text-white font-black text-lg mb-2">{aitbActivity.tagline}</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{aitbActivity.description}</p>
              <p className="text-gray-500 text-xs font-black uppercase tracking-wide mt-3">{aitbActivity.skillTag}</p>
            </div>
          </>
        ) : pages.length > 0 ? (
          <SwipeablePages
            currentPage={currentPage}
            total={pages.length}
            onChange={setCurrentPage}
          >
            <InstructionPage page={pages[currentPage]} hexCode={task.hex_code} />
            <PageNavigator
              current={currentPage}
              total={pages.length}
              onPrev={() => setCurrentPage((p) => Math.max(0, p - 1))}
              onNext={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
              hexCode={task.hex_code}
            />
          </SwipeablePages>
        ) : (
          <div className="text-center py-12 text-gray-400">
            No instructions available for this challenge yet.
          </div>
        )}

        {/* AI Team Building interactive module (Nerf cups, roulette wheels,
            card deal, retro tracker) — standalone card, so it saves into this
            team's bingo_scans row rather than a bundle's aitb_progress row —
            then the tickable mission checklist and AI tool links, which apply
            to every AITB activity whether or not it carries a module. */}
        {aitbActivity && scanRecord && (
          <div className="mb-8 mt-8 animate-slide-up">
            {aitbActivity.module && (
              <AitbMissionModule activity={aitbActivity} savedWords={scanRecord.words}
                disabled={scanRecord.completed}
                onSave={words => {
                  setScanRecord(prev => (prev ? { ...prev, words } : prev))
                  void saveWords(scanRecord.id, words)
                }}
                progressId={scanRecord.id} />
            )}

            {/* Speed Edit Showdown works from a fixed set of target pictures. */}
            {aitbActivity.name === 'Speed Edit Showdown' && (
              <SpeedEditTargets color={aitbActivity.color} />
            )}

            {/* Resort Tree App Sprint ships with a worked example to aim at. */}
            {aitbActivity.name === 'Resort Tree App Sprint' && (
              <SampleTreeApp color={aitbActivity.color} />
            )}

            {/* Retro Game Speed Build ships the 3 games teams must rebuild. */}
            {aitbActivity.name === 'Retro Game Speed Build' && <RetroGamesSample />}

            <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
              ✅ Your mission — +{AITB_POINTS.step} pts per step
            </div>
            <div className="flex flex-col gap-2 mb-5">
              {aitbActivity.steps.map((s, i) => {
                const ticked = scanRecord.stepsDone.includes(i)
                const locked = scanRecord.completed
                return (
                  <button key={i} onClick={() => toggleAitbStep(i)} disabled={locked}
                    className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                    style={{
                      background: ticked ? `${aitbActivity.color}1e` : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${ticked ? aitbActivity.color : 'rgba(255,255,255,0.1)'}`,
                      opacity: locked && !ticked ? 0.6 : 1,
                    }}>
                    <span className="text-3xl">{aitbActivity.stepEmojis[i]}</span>
                    <span className={`flex-1 font-bold text-white ${ticked ? 'line-through opacity-70' : ''}`}>{s}</span>
                    <span className="text-2xl">{ticked ? '✅' : i + 1}</span>
                  </button>
                )
              })}
            </div>

            <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.1)' }}>
              <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">🤖 Your AI tools — tap to open</div>
              <div className="flex flex-wrap gap-2">
                {aitbActivity.apps.map(a => {
                  const url = aitbToolUrl(a)
                  const caption = aitbToolCaption(a)
                  const cls = "px-3 py-2 rounded-xl text-sm font-bold transition-transform active:scale-95"
                  const style = { background: `${aitbActivity.color}18`, border: `1.5px solid ${aitbActivity.color}55`, color: aitbActivity.color }
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
          </div>
        )}

        {/* Helpful links */}
        {links.length > 0 && (
          <div className="mt-8 animate-slide-up">
            <TaskLinkButtons links={links} hexCode={task.hex_code} heading="Use these links to complete your tasks" />
          </div>
        )}

        {/* Observer notice */}
        {isObserver && (
          <div className="mt-8 p-4 rounded-2xl border-2 border-blue-400/40 bg-blue-400/10 text-center">
            <p className="text-blue-300 font-black text-sm">👁 Observer Mode — viewing only</p>
          </div>
        )}

        {/* Complete Activity */}
        {!isObserver && <div className="mt-8 animate-slide-up">
          {/* A bundle tile is a whole activity set, so it replaces the normal
              completion flow the same way a contest card does. */}
          {task.is_bundle && team ? (
            <>
              <BundleCard task={task} teamId={team.id} marshalPassword={marshalPassword} />
              <button
                onClick={() => navigate(backPath)}
                className="mt-4 w-full py-3 rounded-2xl text-white/70 font-bold border border-white/15 hover:bg-white/5 transition-colors"
              >
                ← Back to Board
              </button>
            </>
          ) : task.is_contest && team && sectionId ? (
            /* ── Contest card: the whole duel flow replaces solo completion ──
               ContestCard owns every state (challenge → live → result), and the
               cross-off happens when the marshal declares a winner — never from
               the normal Complete button. */
            <>
              <ContestCard
                task={task}
                team={team}
                sectionId={sectionId}
              />
              <button
                onClick={() => navigate(backPath)}
                className="mt-4 w-full py-3 rounded-2xl text-white/70 font-bold border border-white/15 hover:bg-white/5 transition-colors"
              >
                ← Back to Board
              </button>
            </>
          ) : scanRecord?.completed ? (
            <div className="text-center">
              <div
                className="p-6 rounded-2xl border-2"
                style={{ backgroundColor: `${task.hex_code}25`, borderColor: `${task.hex_code}66` }}
              >
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-2xl font-black mb-1 text-white">Challenge Complete!</p>
                <p className="text-white/60 text-sm font-medium">Great job, {team?.name}!</p>
                <button
                  onClick={() => navigate(backPath)}
                  className="mt-5 w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                  style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                >
                  ← Back to Board
                </button>
              </div>
              <button
                onClick={async () => {
                  if (!scanRecord) return
                  setCompleting(true)
                  try {
                    await toggleComplete(scanRecord.id, false)
                    setScanRecord({ ...scanRecord, completed: false })
                    if (task.task_type === 'answer') {
                      setAnswerInputs(answerRows.map(() => ''))
                    }
                  } finally { setCompleting(false) }
                }}
                disabled={completing}
                className="mt-3 px-4 py-2 text-sm text-white/40 hover:text-red-400 transition-colors"
              >
                Undo completion
              </button>
            </div>
          ) : (
            /* ── Per-type completion card ──────────────────────── */
            <>
            <div
              className="rounded-3xl p-5 border-2 animate-pulse-border"
              style={{
                borderColor: `${task.hex_code}99`,
                backgroundColor: `${task.hex_code}18`,
                boxShadow: `0 0 24px ${task.hex_code}44, inset 0 0 24px ${task.hex_code}11`,
              }}
            >
              {/* ── Standard: Marshal password + Complete button ── */}
              {/* Sign Splice Title: hunt each letter of your title on a
                  different shop sign. OCR and stitching run in the page. */}
              {task.task_type === 'sign_splice' && team && taskId && (
                <SignSpliceCard teamId={team.id} taskId={taskId} />
              )}

              {task.task_type === 'standard' && (
                <>
                  {task.require_marshal && (
                    <>
                      <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-yellow-400/20 border border-yellow-400/50 animate-attention">
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                          <span className="text-2xl">👮</span>
                          <span className="text-xs text-yellow-300 font-black uppercase tracking-tight leading-none">Marshal</span>
                        </div>
                        <p className="text-yellow-200 text-sm font-black uppercase tracking-wide leading-snug">
                          {task.completion_warning || 'Enter the Marshal password to complete this challenge.'}
                        </p>
                        <span className="text-2xl flex-shrink-0">🛑</span>
                      </div>
                      <div className="mb-4">
                        <input
                          type="password"
                          value={marshalInput}
                          onChange={e => { setMarshalInput(e.target.value); setMarshalError('') }}
                          placeholder="Marshal password..."
                          className="w-full px-4 py-3 rounded-2xl border-2 text-center text-lg font-bold focus:outline-none transition-colors bg-white/10 text-white placeholder-white/30"
                          style={{ borderColor: marshalError ? '#ef4444' : marshalInput ? task.hex_code : 'rgba(255,255,255,0.2)' }}
                        />
                        {marshalError && (
                          <p className="text-red-400 text-xs font-bold text-center mt-2">{marshalError}</p>
                        )}
                      </div>
                    </>
                  )}
                  {submittedForApproval && (
                    <div className="mb-3 p-4 rounded-2xl bg-amber-400/15 border-2 border-amber-400/50 text-center">
                      <div className="text-3xl mb-1">📤</div>
                      <p className="text-amber-200 font-black">Sent to your team leader</p>
                      <p className="text-amber-200/70 text-xs mt-1">
                        They approve it and the points land on the scoreboard.
                      </p>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (!scanRecord) return
                      if (task.require_marshal && marshalInput.trim() !== marshalPassword) {
                        setMarshalError('Wrong marshal password.')
                        return
                      }
                      setCompleting(true)
                      try {
                        // Leaders complete outright; everyone else submits and
                        // waits. This is what keeps four phones from sending the
                        // same completion to one marshal.
                        if (isLeader) {
                          await toggleComplete(scanRecord.id, true)
                          setScanRecord({ ...scanRecord, completed: true })
                        } else if (team && memberId) {
                          const r = await submitTile(team.id, taskId!, memberId)
                          if (r.error) { setMarshalError(r.error); return }
                          setSubmittedForApproval(true)
                        }
                      } finally { setCompleting(false) }
                    }}
                    disabled={completing || !scanRecord || submittedForApproval}
                    className="w-full py-4 rounded-2xl text-white text-xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      backgroundColor: task.hex_code,
                      boxShadow: `0 6px 0 ${task.hex_code}88, 0 8px 20px ${task.hex_code}44`,
                    }}
                  >
                    {completing ? 'Sending...' : isLeader ? 'Complete Challenge ✅' : 'Submit to Team Leader 📤'}
                  </button>
                </>
              )}

              {/* ── Photo: Submit image for marshal approval ── */}
              {task.task_type === 'photo' && photoSubmissionsEnabled && (
                <>
                  <p className="text-white font-black text-lg text-center mb-4">📸 Submit Your Photo</p>
                  <p className="text-white/50 text-sm text-center mb-5">A marshal will review and approve your submission.</p>
                  {photoSubmitted ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">Photo submitted!</p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for marshal review</p>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center gap-3 w-full py-6 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm cursor-pointer hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all ${photoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <span className="text-4xl">{photoUploading ? '⏳' : '📷'}</span>
                      <span>{photoUploading ? 'Uploading...' : 'Tap to take or upload a photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={photoUploading || !scanRecord}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) handlePhotoUpload(f)
                        }}
                      />
                    </label>
                  )}
                </>
              )}

              {/* ── Answer: Letter-box input ── */}
              {task.task_type === 'answer' && (
                <>
                  {task.answer_question && (
                    <p className="text-white font-black text-lg mb-4 text-center leading-snug">
                      {task.answer_question}
                    </p>
                  )}
                  <div className="flex flex-col gap-5">
                    {answerRows.map((row, rowIdx) => {
                      const letters = row.replace(/\s/g, '').split('')
                      const typed = answerInputs[rowIdx] ?? ''
                      const rowCorrect = normalize(typed) === normalize(row.replace(/\s/g, ''))
                      if (!letterRefs.current[rowIdx]) letterRefs.current[rowIdx] = []
                      return (
                        <div key={rowIdx} className="flex flex-col items-center gap-2">
                          {answerRows.length > 1 && (
                            <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                              Word {rowIdx + 1}
                            </label>
                          )}
                          <div className="flex gap-1.5 justify-center flex-wrap">
                            {letters.map((_, charIdx) => {
                              const typedChar = typed[charIdx] ?? ''
                              const expectedChar = letters[charIdx]
                              const charCorrect = typedChar.length > 0 && typedChar.toLowerCase() === expectedChar.toLowerCase()
                              const charWrong = typedChar.length > 0 && !charCorrect
                              return (
                                <input
                                  key={charIdx}
                                  ref={el => { letterRefs.current[rowIdx][charIdx] = el }}
                                  type="text"
                                  inputMode="text"
                                  autoCapitalize="characters"
                                  autoComplete="off"
                                  maxLength={1}
                                  value={typedChar.toUpperCase()}
                                  onChange={e => {
                                    const ch = e.target.value.slice(-1).replace(/[^a-zA-Z0-9]/g, '')
                                    if (!ch) return
                                    setAnswerInputs(prev => {
                                      const next = [...prev]
                                      const arr = (next[rowIdx] ?? '').split('')
                                      while (arr.length <= charIdx) arr.push('')
                                      arr[charIdx] = ch
                                      next[rowIdx] = arr.join('')
                                      return next
                                    })
                                    if (charIdx < letters.length - 1) focusLetter(rowIdx, charIdx + 1)
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Backspace') {
                                      e.preventDefault()
                                      const current = typed[charIdx] ?? ''
                                      if (current) {
                                        setAnswerInputs(prev => {
                                          const next = [...prev]
                                          const arr = (next[rowIdx] ?? '').split('')
                                          arr[charIdx] = ''
                                          next[rowIdx] = arr.join('')
                                          return next
                                        })
                                      } else if (charIdx > 0) {
                                        setAnswerInputs(prev => {
                                          const next = [...prev]
                                          const arr = (next[rowIdx] ?? '').split('')
                                          arr[charIdx - 1] = ''
                                          next[rowIdx] = arr.join('')
                                          return next
                                        })
                                        focusLetter(rowIdx, charIdx - 1)
                                      }
                                    } else if (e.key === 'ArrowLeft' && charIdx > 0) {
                                      focusLetter(rowIdx, charIdx - 1)
                                    } else if (e.key === 'ArrowRight' && charIdx < letters.length - 1) {
                                      focusLetter(rowIdx, charIdx + 1)
                                    }
                                  }}
                                  onFocus={e => e.target.select()}
                                  className={`w-10 h-12 text-center text-xl font-black rounded-lg border-2 outline-none transition-all ${
                                    rowCorrect
                                      ? 'border-green-400 bg-green-400/20 text-green-300'
                                      : charCorrect
                                      ? 'border-green-400/60 bg-green-400/10 text-green-300'
                                      : charWrong
                                      ? 'border-red-400/60 bg-red-400/10 text-red-300'
                                      : 'border-white/30 bg-black/30 text-white'
                                  }`}
                                  style={{ caretColor: 'transparent' }}
                                />
                              )
                            })}
                          </div>
                          {rowCorrect && (
                            <span className="text-green-400 text-xs font-bold mt-0.5">✓ Correct!</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {!answerMatches && (
                    <p className="text-white/40 text-xs text-center mt-4">Fill in the letters above to complete</p>
                  )}
                </>
              )}

              {/* Back to board — shown in every card type */}
              <button
                onClick={() => navigate(backPath)}
                className="mt-5 w-full py-3 rounded-2xl text-white/70 font-bold text-sm uppercase tracking-wider border border-white/20 hover:bg-white/10 hover:text-white transition-all active:scale-95"
              >
                ← Back to Board
              </button>
            </div>

            {/* ── Supplementary photo upload (any non-photo task, when toggle ON) ── */}
            {task.task_type !== 'photo' && photoSubmissionsEnabled && (
              <div className="mt-4 rounded-3xl p-5 border-2 border-white/15 bg-black/30">
                <p className="text-white font-black text-base text-center mb-1">📸 Optional Photo</p>
                <p className="text-white/50 text-xs text-center mb-4">Attach an image as evidence — your marshal will review it.</p>
                {photoSubmitted ? (
                  <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                    <div className="text-3xl mb-2">⏳</div>
                    <p className="text-green-300 font-black">Photo submitted!</p>
                    <p className="text-green-300/60 text-sm mt-1">Waiting for marshal review</p>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center gap-3 w-full py-5 rounded-2xl border-2 border-dashed border-white/25 text-white/55 font-bold text-sm cursor-pointer hover:border-white/45 hover:text-white/75 hover:bg-white/5 transition-all ${photoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <span className="text-3xl">{photoUploading ? '⏳' : '📷'}</span>
                    <span>{photoUploading ? 'Uploading...' : 'Tap to take or upload a photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoUploading || !scanRecord}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) handlePhotoUpload(f)
                      }}
                    />
                  </label>
                )}
              </div>
            )}
            </>
          )}
        </div>}
      </main>
    </div>
    {timeUpOverlay}
    </>
  )
}