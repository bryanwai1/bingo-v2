import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoDashTeam } from '../hooks/useBingoDashTeam'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import {
  fileAccept, fileEmoji, fileHeading, fileNoun, inputKinds, isComplete, missingLabels,
  effectiveInputs, usesInputs,
} from '../lib/completionInputs'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useBingoScans } from '../hooks/useBingoScans'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { TaskLinkButtons, type LinkItem } from '../components/TaskLinkButtons'
import { InstructionPage } from '../components/InstructionPage'
import { PageNavigator } from '../components/PageNavigator'
import { SwipeablePages } from '../components/SwipeablePages'
import { ParticleBackground } from '../components/ParticleBackground'
import { TimeUpAlarm } from '../components/TimeUpAlarm'
import { ContestCard } from '../components/ContestCard'
import { SupportChat } from '../components/SupportChat'
import { LanguageToggle } from '../components/LanguageToggle'
import { SignSpliceCard } from '../components/SignSpliceCard'
import { BreakoutHuntCard } from '../components/BreakoutHuntCard'
import { useCardDrawConfig } from '../hooks/useCardDrawConfig'
import { SpeedEditTargets } from '../components/SpeedEditTargets'
import { SampleTreeApp } from '../components/SampleTreeApp'
import { CardSample } from '../components/CardSample'
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

/** "Hunt Challenge" already says challenge — don't print it twice. */
function splashKicker(colorName: string | null | undefined): string {
  const name = (colorName ?? '').trim()
  if (!name) return 'Challenge'
  return /challenge$/i.test(name) ? name : `${name} Challenge`
}

export function BingoDashParticipant() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSnakeLadder = searchParams.get('from') === 'snake-ladder'
  const snakeTileParam = searchParams.get('tile')
  const snakeTile = snakeTileParam ? parseInt(snakeTileParam, 10) : null
  // Which board box this card was opened from, when opened from a board tap
  // (a QR scan has no box context — it only encodes the card). Threading
  // this through is what lets a card placed in several boxes on one board
  // be completed independently instead of one completion ticking all of them.
  const boardCardId = searchParams.get('box')
  const [backPath, setBackPath] = useState(isSnakeLadder ? '/snake-ladder' : '/bingo-dash')
  const { team, loading: teamLoading, isRegistered, leaveTeam } = useBingoDashTeam()
  const isObserver = !isSnakeLadder && localStorage.getItem('bingo-dash-member-role') === 'observer'
  const { pages, loading: pagesLoading } = useBingoTaskPages(taskId)
  const { photos, loading: photosLoading } = useBingoTaskPhotos(taskId)
  const { links } = useTaskLinks(taskId, 'bingo_task_links')
  const { recordScan, toggleComplete, saveWords, saveSteps } = useBingoScans()
  // A card can define its own draw slots; otherwise the module keeps its
  // hardcoded shape.
  const { config: drawConfig } = useCardDrawConfig(taskId)

  const [task, setTask] = useState<BingoTask | null>(null)
  const [showSplash, setShowSplash] = useState(!isSnakeLadder)
  const [scanRecord, setScanRecord] = useState<{ id: string; completed: boolean; answerOk: boolean; words: string[]; stepsDone: number[]; scannedAt: string } | null>(null)
  // Which of this card's inputs the team has already satisfied. Files count
  // once a marshal has approved them, which is why this is read back from the
  // submissions rather than from what was sent.
  const [approvedKinds, setApprovedKinds] = useState<{ photo: boolean; video: boolean; link: boolean; versus: boolean; text: boolean }>({ photo: false, video: false, link: false, versus: false, text: false })
  // Versus input: the teams on this board to pick an opponent from, what the
  // team chose, and whether a claim is already in with the admin.
  // The newest submission per input, so the card can say "waiting" after a
  // reload and show the admin's reason when one was rejected.
  type Review = { status: 'pending' | 'approved' | 'rejected'; note: string | null }
  const [reviews, setReviews] = useState<Partial<Record<'photo' | 'video' | 'link' | 'versus' | 'text', Review>>>({})
  // Free-text answer (Text input with a question but no saved answer).
  const [freeText, setFreeText] = useState('')
  const [freeTextSent, setFreeTextSent] = useState(false)
  const [freeTextBusy, setFreeTextBusy] = useState(false)
  const [rivals, setRivals] = useState<{ id: string; name: string }[]>([])
  const [opponentId, setOpponentId] = useState('')
  const [versusWon, setVersusWon] = useState<boolean | null>(null)
  const [versusSent, setVersusSent] = useState(false)
  const [versusBusy, setVersusBusy] = useState(false)
  // Chained cards. `prev` is the card this one unlocks after (null for a
  // normal card) and `prevDone` whether this team has finished it; `next` is
  // the card that unlocks after this one, for the hand-off button. prevDone
  // starts true so an unchained card is never momentarily shown locked.
  const [chain, setChain] = useState<{
    prev: { id: string; title: string; hex_code: string } | null
    prevDone: boolean
    next: { id: string; title: string } | null
  }>({ prev: null, prevDone: true, next: null })
  // A card whose answer belongs to the item the team drew (Escape the Mall's
  // riddle) rather than to the card as a whole.
  const [guess, setGuess] = useState('')
  const [guessBusy, setGuessBusy] = useState(false)
  const [guessWrong, setGuessWrong] = useState(0)
  // Number answer with a floor (answer_min): what the team typed, whether
  // the server accepted it, and the last rejected value so the hint can say so.
  const [numberValue, setNumberValue] = useState('')
  const [numberBusy, setNumberBusy] = useState(false)
  const [numberRejected, setNumberRejected] = useState<string | null>(null)
  const [linkValue, setLinkValue] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
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
  const [photosSent, setPhotosSent] = useState(0)
  // Files the team has chosen but not sent. Nothing is uploaded and no marshal
  // sees anything until they press Submit, so a wrong shot is simply removed.
  const [staged, setStaged] = useState<{ id: string; file: File; preview: string }[]>([])
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

  // Resolve the chain around this card, and watch the previous card's
  // completion so this one opens the moment the marshal approves it.
  const prereqId = task?.prerequisite_task_id ?? null
  useEffect(() => {
    if (!task || !team) return
    let cancelled = false
    ;(async () => {
      const [prevRes, doneRes, nextRes] = await Promise.all([
        prereqId
          ? supabase.from('bingo_tasks').select('id, title, hex_code').eq('id', prereqId).maybeSingle()
          : Promise.resolve({ data: null }),
        prereqId
          ? supabase.from('bingo_scans').select('id').eq('team_id', team.id).eq('task_id', prereqId).eq('completed', true).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('bingo_tasks').select('id, title').eq('prerequisite_task_id', task.id).eq('section_id', task.section_id).limit(1).maybeSingle(),
      ])
      if (cancelled) return
      setChain({
        prev: (prevRes.data as { id: string; title: string; hex_code: string } | null) ?? null,
        prevDone: !prereqId || !!doneRes.data,
        next: (nextRes.data as { id: string; title: string } | null) ?? null,
      })
    })()
    // One subscription on the team's scans covers both ends of the chain:
    // the previous card finishing (unlocks this one) and this card finishing
    // from the admin's approval (lights the Next button without a reload).
    const channel = supabase
      .channel(`bingo-chain-${team.id}-${task.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_scans', filter: `team_id=eq.${team.id}` },
        ({ new: updated }) => {
          const row = updated as Partial<BingoScan>
          if (!row.completed) return
          if (prereqId && row.task_id === prereqId) setChain(c => ({ ...c, prevDone: true }))
          if (row.task_id === task.id) setScanRecord(prev => (prev && prev.id === row.id ? { ...prev, completed: true } : prev))
        }
      )
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [task, team, prereqId])
  const chainLocked = !!chain.prev && !chain.prevDone

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
  // supabase/aitb/020_aitb_card_timer.sql.
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
  const inputs = useMemo(() => effectiveInputs(task?.task_type, task?.completion_inputs), [task?.task_type, task?.completion_inputs])

  // Driven by the input set, not the old exclusive type: a card can want a
  // typed answer alongside a photo or a clip.
  const answerRows = inputs.answer && task?.answer_text
    ? task.answer_text.split('\n').map(r => r.trim()).filter(Boolean)
    : []

  const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase()

  // True when every row is fully and correctly filled (case-insensitive)
  const answerMatches = answerRows.length > 0 && answerRows.every(
    (row, i) => normalize(answerInputs[i] ?? '') === normalize(row)
  )
  const numberMode = !!inputs.answer && task?.answer_min != null

  /** Send the number to Postgres; only it knows whether the floor is met,
   *  and it marks the scan's answer_ok itself. */
  const checkNumber = async () => {
    if (!scanRecord || numberBusy) return
    const value = Number(numberValue.replace(/[,\s]/g, ''))
    if (!Number.isFinite(value)) return
    setNumberBusy(true)
    try {
      const { data, error } = await supabase.rpc('check_answer_min', { p_scan: scanRecord.id, p_value: value })
      if (error) { alert('Could not check your number: ' + error.message); return }
      if (data === true) {
        setNumberRejected(null)
        setScanRecord(prev => (prev ? { ...prev, answerOk: true } : prev))
      } else {
        setNumberRejected(numberValue)
      }
    } finally {
      setNumberBusy(false)
    }
  }

  useEffect(() => {
    if (isSnakeLadder) return
    if (team && taskId && !scanRecorded) {
      recordScan(team.id, taskId, boardCardId).then((scan) => {
        setScanRecorded(true)
        if (scan) setScanRecord({
          id: scan.id, completed: scan.completed, answerOk: scan.answer_ok ?? false,
          words: scan.words ?? [], stepsDone: scan.steps_done ?? [], scannedAt: scan.scanned_at,
        })
      })
    }
  }, [isSnakeLadder, team, taskId, boardCardId, scanRecorded, recordScan])

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

  // What this card collects, and what the team has satisfied of it.
  const progress = useMemo(() => ({
    photo: approvedKinds.photo,
    video: approvedKinds.video,
    link: approvedKinds.link,
    versus: approvedKinds.versus,
    // A typed answer is satisfied either by matching (letters / number) or
    // by the admin approving a free-text one.
    answer: (scanRecord?.answerOk ?? false) || approvedKinds.text,
  }), [approvedKinds, scanRecord?.answerOk])
  const outstanding = missingLabels(inputs, progress)

  /** An approved submission is what makes a file input count. */
  useEffect(() => {
    if (!team || !taskId || !usesInputs(inputs)) return
    let live = true
    const read = () => {
      supabase.from('bingo_photo_submissions')
        .select('media_type, status, review_note, created_at').eq('team_id', team.id).eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!live) return
          const rows = data ?? []
          const kindOf = (m: string | null | undefined) =>
            (m === 'video' || m === 'link' || m === 'versus' || m === 'text') ? m : 'photo' as const
          const approved = rows.filter(r => r.status === 'approved')
          setApprovedKinds({
            photo: approved.some(r => kindOf(r.media_type) === 'photo'),
            video: approved.some(r => kindOf(r.media_type) === 'video'),
            link: approved.some(r => kindOf(r.media_type) === 'link'),
            versus: approved.some(r => kindOf(r.media_type) === 'versus'),
            text: approved.some(r => kindOf(r.media_type) === 'text'),
          })
          // Newest row per kind decides what the card says. An approval
          // anywhere in the history still counts (above); a pending row
          // outranks an older rejection.
          const latest: Partial<Record<'photo' | 'video' | 'link' | 'versus' | 'text', Review>> = {}
          for (const r of rows) {
            const k = kindOf(r.media_type)
            if (!latest[k]) latest[k] = { status: r.status as Review['status'], note: r.review_note ?? null }
            else if (latest[k]!.status === 'rejected' && r.status === 'pending') latest[k] = { status: 'pending', note: null }
          }
          setReviews(latest)
          // A reload after sending: keep showing "waiting" rather than an
          // empty tray, and reopen the form once the admin has said no.
          const fileLatest = latest.photo ?? latest.video
          if (fileLatest?.status === 'pending') setPhotoSubmitted(true)
          if (fileLatest?.status === 'rejected') setPhotoSubmitted(false)
          if (latest.link?.status === 'pending') setLinkSent(true)
          if (latest.link?.status === 'rejected') setLinkSent(false)
          if (latest.versus?.status === 'rejected') setVersusSent(false)
          if (latest.text?.status === 'pending') setFreeTextSent(true)
          if (latest.text?.status === 'rejected') setFreeTextSent(false)
        })
    }
    read()
    const channel = supabase
      .channel(`subs-${team.id}-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_photo_submissions', filter: `team_id=eq.${team.id}` }, read)
      .subscribe()
    return () => { live = false; supabase.removeChannel(channel) }
  }, [team, taskId, inputs])

  // Versus: the other teams on this board, and whether a claim is already
  // pending, so a reload does not offer the form twice.
  useEffect(() => {
    if (!team || !taskId || !inputs.versus) return
    let live = true
    Promise.all([
      supabase.from('bingo_teams').select('id, name').eq('section_id', team.section_id).neq('id', team.id).order('name'),
      supabase.from('bingo_photo_submissions').select('id').eq('team_id', team.id).eq('task_id', taskId)
        .eq('media_type', 'versus').neq('status', 'rejected').limit(1),
    ]).then(([teamsRes, subsRes]) => {
      if (!live) return
      setRivals((teamsRes.data ?? []) as { id: string; name: string }[])
      if ((subsRes.data ?? []).length > 0) setVersusSent(true)
    })
    return () => { live = false }
  }, [team, taskId, inputs.versus])

  /** The battle claim: who we fought and whether we won. One row for the
   *  admin, like a link — and only the challenging team ever sends one. */
  const submitVersus = async () => {
    if (!team || !taskId || !scanRecord || !opponentId || versusWon === null || versusBusy) return
    setVersusBusy(true)
    try {
      // Rematches are allowed: the admin sees every claim and decides.
      const { error } = await supabase.from('bingo_photo_submissions').insert({
        team_id: team.id, task_id: taskId, scan_id: scanRecord.id,
        photo_url: '', media_type: 'versus', status: 'pending',
        opponent_id: opponentId, versus_won: versusWon,
      })
      if (error) { alert('Could not send your result: ' + error.message); return }
      setVersusSent(true)
    } finally {
      setVersusBusy(false)
    }
  }

  /** A link is evidence like any other: one row, pending, marshal approves. */
  const submitLink = async () => {
    const url = linkValue.trim()
    if (!team || !taskId || !scanRecord || !url) return
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      alert('That does not look like a link. It should start with https:// and point somewhere.')
      return
    }
    setLinkBusy(true)
    try {
      const { error } = await supabase.from('bingo_photo_submissions').insert({
        team_id: team.id, task_id: taskId, scan_id: scanRecord.id,
        photo_url: url, media_type: 'link', status: 'pending',
      })
      if (error) { alert('Could not save your link: ' + error.message); return }
      setLinkSent(true)
      setLinkValue('')
    } finally {
      setLinkBusy(false)
    }
  }

  /**
   * The prompt this team drew, when the card's answer comes from the draw.
   *
   * Inferred rather than flagged: a card that collects a typed answer, carries
   * a draw, and has no answer of its own can only mean the drawn item holds it.
   */
  const needsDrawnAnswer = !!(inputs.answer && !task?.answer_text && task?.answer_min == null && drawConfig)
  // Text input with only a question: nothing to match against, so whatever
  // the team writes goes to the admin like a link does.
  const freeTextMode = !!(inputs.answer && !task?.answer_text && task?.answer_min == null && !drawConfig)
  // Free text alongside a photo/video: one Submit button sends both.
  const combinedText = freeTextMode && !!(inputs.photo || inputs.video) && !freeTextSent && !approvedKinds.text

  const submitFreeText = async () => {
    const text = freeText.trim()
    if (!team || !taskId || !scanRecord || !text || freeTextBusy) return
    setFreeTextBusy(true)
    try {
      const { error } = await supabase.from('bingo_photo_submissions').insert({
        team_id: team.id, task_id: taskId, scan_id: scanRecord.id,
        photo_url: text, media_type: 'text', status: 'pending',
      })
      if (error) { alert('Could not send your answer: ' + error.message); return }
      setFreeTextSent(true)
    } finally {
      setFreeTextBusy(false)
    }
  }
  const drawnPrompt = needsDrawnAnswer ? (scanRecord?.words?.[0] || '') : ''
  const riddleSolved = !needsDrawnAnswer || !!scanRecord?.answerOk

  /** The guess goes to Postgres; only a yes/no comes back. */
  const checkDrawnAnswer = async () => {
    const typed = guess.trim()
    if (!typed || !taskId || !scanRecord || !drawnPrompt) return
    setGuessBusy(true)
    try {
      const { data, error } = await supabase.rpc('check_draw_answer', {
        p_task: taskId, p_prompt: drawnPrompt, p_guess: typed,
      })
      if (error) { alert('Could not check that answer: ' + error.message); return }
      if (data === true) {
        await markAnswerOk(scanRecord.id)
        setScanRecord(prev => (prev ? { ...prev, answerOk: true } : prev))
        setGuess('')
        setGuessWrong(0)
      } else {
        setGuessWrong(n => n + 1)
      }
    } finally {
      setGuessBusy(false)
    }
  }

  const markAnswerOk = async (scanId: string) => {
    await supabase.from('bingo_scans').update({ answer_ok: true }).eq('id', scanId)
  }

  // A card can ask for several things at once, so a correct answer no longer
  // finishes the card on its own — it satisfies one input, and the tile turns
  // green when every compulsory one is in.
  const answerSatisfied = answerMatches || (numberMode && !!scanRecord?.answerOk)
  useEffect(() => {
    if (isSnakeLadder) return
    if (!answerSatisfied || !scanRecord || scanRecord.completed || completing) return
    setCompleting(true)
    ;(async () => {
      // A number answer is already marked by check_answer_min.
      if (!numberMode) {
        await markAnswerOk(scanRecord.id)
        setScanRecord(prev => (prev ? { ...prev, answerOk: true } : prev))
      }
      const done = { ...progress, answer: true }
      if (isComplete(inputs, done) || !usesInputs(inputs)) {
        await toggleComplete(scanRecord.id, true)
        setScanRecord(prev => (prev ? { ...prev, completed: true } : prev))
      }
      setCompleting(false)
    })()
  }, [answerSatisfied]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLeave = async () => {
    setLeaving(true)
    leaveTeam()
    setScanRecorded(false)
    setScanRecord(null)
    setShowLeaveConfirm(false)
    setLeaving(false)
  }

  // Sign Splice and Breakout verify themselves — OCR for one, a marshal's
  // approval of the photo set for the other — so finishing the card crosses the
  // tile off directly. Without this a team could collect all ten objects and
  // still score nothing.
  const completeSelfVerifiedCard = useCallback(async () => {
    if (!scanRecord || scanRecord.completed) return
    try {
      await toggleComplete(scanRecord.id, true)
      setScanRecord(prev => (prev ? { ...prev, completed: true } : prev))
    } catch (err) {
      console.warn('Could not complete card:', err)
    }
  }, [scanRecord, toggleComplete])

  /** Queue a chosen file, refusing anything too big before it takes up room. */
  const stageFiles = (files: File[]) => {
    const room = task?.photo_multiple ? Infinity : 1
    for (const file of files) {
      if (staged.length >= room) break
      const isVideo = file.type.startsWith('video/')
      const maxMb = isVideo ? 100 : 25
      if (file.size > maxMb * 1024 * 1024) {
        alert(`"${file.name}" is too large (max ${maxMb} MB for a ${isVideo ? 'video' : 'photo'}).`)
        continue
      }
      setStaged(prev => (prev.length >= room ? prev : [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, preview: URL.createObjectURL(file) },
      ]))
    }
  }

  const unstage = (id: string) => {
    setStaged(prev => {
      const gone = prev.find(x => x.id === id)
      if (gone) URL.revokeObjectURL(gone.preview)
      return prev.filter(x => x.id !== id)
    })
  }

  /** Send everything staged, one submission row per file. */
  const submitStaged = async () => {
    const text = combinedText ? freeText.trim() : ''
    if (staged.length === 0 && !text) return
    setPhotoUploading(true)
    try {
      // Photo + free-text cards share one Submit: the typed answer goes as
      // its own row so the admin approves each part, but the team presses
      // once.
      if (text && team && taskId && scanRecord) {
        const { error } = await supabase.from('bingo_photo_submissions').insert({
          team_id: team.id, task_id: taskId, scan_id: scanRecord.id,
          photo_url: text, media_type: 'text', status: 'pending',
        })
        if (error) { alert('Could not send your answer: ' + error.message); return }
        setFreeTextSent(true)
      }
      for (const item of staged) await uploadOne(item.file)
      staged.forEach(x => URL.revokeObjectURL(x.preview))
      setStaged([])
      if (staged.length > 0) setPhotoSubmitted(true)
    } finally {
      setPhotoUploading(false)
    }
  }

  const uploadOne = async (file: File) => {
    if (!team || !taskId || !scanRecord) return
    const isVideo = file.type.startsWith('video/')
    {
      let upload: Blob = file
      // A clip is sent as filmed — there is no in-browser compression for it,
      // and re-encoding a minute of footage on a phone is not worth the wait.
      if (!isVideo) {
        try {
          upload = await compressToJpeg(file)
        } catch (err) {
          if (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)) {
            alert("This iPhone photo format (HEIC) couldn't be processed on this device. In iPhone Settings → Camera → Formats, choose 'Most Compatible', or share the photo via the Photos app.")
            return
          }
          console.warn('Image compression failed, uploading original:', err)
        }
      }
      const ext = isVideo ? (file.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'
      const contentType = isVideo ? (file.type || 'video/mp4') : 'image/jpeg'
      const path = `bingo-media/photo-submissions/${team.id}-${taskId}-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, upload, { upsert: false, contentType })
      if (uploadErr) { alert('Upload failed: ' + uploadErr.message); return }
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      const { error: insertErr } = await supabase.from('bingo_photo_submissions').insert({
        team_id: team.id,
        task_id: taskId,
        scan_id: scanRecord.id,
        photo_url: urlData.publicUrl,
        media_type: isVideo ? 'video' : 'image',
        status: 'pending',
      })
      if (insertErr) { alert('Could not save submission: ' + insertErr.message); return }
      setPhotosSent(n => n + 1)
    }
  }

  // The bingo time-up alarm overlays every state below — only mounted in the
  // bingo flow so Snake & Ladder players are unaffected.
  const timeUpOverlay = !isSnakeLadder ? (
    <>
      <TimeUpAlarm sectionId={team?.section_id ?? null} />
      {team && sectionId && (
        <SupportChat sectionId={sectionId} teamId={team.id} teamName={team.name} />
      )}
    </>
  ) : null

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
        {/* Way out before committing — the tile was tapped by mistake more
            often than not. Stops the splash's own tap-to-start. */}
        <button
          onClick={(e) => { e.stopPropagation(); navigate(backPath) }}
          className="absolute top-5 left-5 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/25 hover:bg-black/35 text-white/90 text-sm font-bold backdrop-blur-sm transition-colors"
        >
          ← Back to Board
        </button>

        <div className="relative z-10 text-center px-8 animate-bounce-in">
          <div className="text-6xl mb-6">{isSnakeLadder ? '🐍🪜' : aitbActivity?.emoji ?? '🎯'}</div>
          <p className="text-sm font-bold opacity-70 uppercase tracking-[0.2em] mb-2">
            {aitbActivity ? `Activity ${aitbActivity.act} · ${aitbActivity.mins} min` : splashKicker(task.color)}
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
            {/* The task page is where a player actually reads instructions, so
                the language switch belongs here too — not only on the board
                they came from. */}
            <LanguageToggle className="mt-1 flex-shrink-0" />
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
          <div className="rounded-2xl overflow-hidden mb-6 shadow-xl animate-slide-up bg-black/20">
            <div className="relative">
              <img
                src={photos[carouselIdx]?.photo_url}
                alt={`${task.title} ${carouselIdx + 1}`}
                className="w-full max-h-[min(46vh,520px)] object-contain"
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
        {/* The draw is driven by the card's own configuration, so a card
            outside AI Team Building can carry one too. */}
        {drawConfig && scanRecord && (
          <div className="mb-8 mt-8 animate-slide-up">
            <AitbMissionModule activity={aitbActivity} color={task.hex_code} storeId={task.id}
              drawConfig={drawConfig} savedWords={scanRecord.words}
              disabled={scanRecord.completed}
              onSave={words => {
                setScanRecord(prev => (prev ? { ...prev, words } : prev))
                void saveWords(scanRecord.id, words)
              }}
              progressId={scanRecord.id} />
          </div>
        )}


        {/* A worked sample for the cards that are really camera tricks. */}
        <CardSample title={task.title} color={task.hex_code} />


        {aitbActivity && scanRecord && (
          <div className="mb-8 mt-8 animate-slide-up">
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

        {/* Whatever this card deals the team — colours, a riddle,
            checkpoints. Sits after the instructions and before the AI
            tool links, so it reads in the order the team acts. */}
        {/* Helpful links — the admin's tool links, plus the chain's
            neighbours: the card that has to be finished first while this one
            is locked, and the card this one unlocks once something has been
            sent (it opens on its own when the marshal approves). */}
        {(() => {
          const submitted = !!scanRecord?.completed || photoSubmitted || photosSent > 0 || linkSent
          const items: LinkItem[] = [...links]
          if (chain.next && !chainLocked && submitted) {
            items.push({ id: 'chain-next', label: chain.next.title, url: '', to: `/bingo-dash/task/${chain.next.id}`,
              icon: '🎬', sub: scanRecord?.completed ? 'Unlocked - your next card' : 'Next card - opens once approved' })
          }
          return items.length > 0 && (
            <div className="mt-8 animate-slide-up">
              <TaskLinkButtons links={items} hexCode={task.hex_code} heading="Use these links to complete your tasks" />
            </div>
          )
        })()}

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
          {chainLocked && chain.prev ? (
            /* ── Chained card the team has not earned yet: no submit UI, just
               the lock message and the way to the card that opens it. ── */
            <>
              <div className="p-5 rounded-3xl border-2 border-amber-400/50 bg-amber-400/10 text-center">
                <div className="text-4xl mb-2">🔒</div>
                <p className="text-amber-200 font-black text-base leading-snug">
                  {task.completion_warning || `Only teams that have completed ${chain.prev.title} can unlock ${task.title}.`}
                </p>
                <p className="text-white/50 text-xs font-bold mt-2">This card opens on its own once that one is approved.</p>
              </div>
              {/* The way to the card that opens this one, right under the reason it is shut. */}
              <div className="mt-4">
                <TaskLinkButtons hexCode={task.hex_code} heading="Do this card first"
                  links={[{ id: 'chain-prev', label: chain.prev.title, url: '', to: `/bingo-dash/task/${chain.prev.id}`,
                    icon: '🔒', sub: 'Complete this card first' }]} />
              </div>
              <button
                onClick={() => navigate(backPath)}
                className="mt-3 w-full py-3 rounded-2xl text-white/70 font-bold border border-white/15 hover:bg-white/5 transition-colors"
              >
                ← Back to Board
              </button>
            </>
          ) : task.is_bundle && team ? (
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
              {/* Breakout Hunt: decode 10 puzzles, photograph each object. */}
              {task.task_type === 'breakout_hunt' && team && taskId && (
                <BreakoutHuntCard teamId={team.id} taskId={taskId} onComplete={completeSelfVerifiedCard} />
              )}

              {task.task_type === 'sign_splice' && team && taskId && (
                <SignSpliceCard
                  teamId={team.id}
                  taskId={taskId}
                  shopInput={task.sign_splice_shop_input ?? 'optional'}
                  lotInput={task.sign_splice_lot_input ?? 'optional'}
                  minLetters={task.sign_splice_min_letters}
                  maxLetters={task.sign_splice_max_letters}
                  allowSpaces={task.sign_splice_allow_spaces}
                  allowNumbers={task.sign_splice_allow_numbers}
                  minConfidence={task.sign_splice_min_confidence}
                  onComplete={completeSelfVerifiedCard}
                />
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
                  <button
                    onClick={async () => {
                      if (!scanRecord) return
                      if (task.require_marshal && marshalInput.trim() !== marshalPassword) {
                        setMarshalError('Wrong marshal password.')
                        return
                      }
                      setCompleting(true)
                      try {
                        await toggleComplete(scanRecord.id, true)
                        setScanRecord({ ...scanRecord, completed: true })
                      } finally { setCompleting(false) }
                    }}
                    disabled={completing || !scanRecord}
                    className="w-full py-4 rounded-2xl text-white text-xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      backgroundColor: task.hex_code,
                      boxShadow: `0 6px 0 ${task.hex_code}88, 0 8px 20px ${task.hex_code}44`,
                    }}
                  >
                    {completing ? 'Sending...' : 'Complete Challenge ✅'}
                  </button>
                </>
              )}

              {/* ── Photo: Submit image for marshal approval ── */}
              {inputKinds(inputs).length > 1 && outstanding.length > 0 && (
                <div className="mb-5 px-4 py-3 rounded-2xl bg-white/5 border border-white/15 text-center">
                  <p className="text-white/50 text-xs font-black uppercase tracking-widest mb-1">Still needed</p>
                  <p className="text-white font-bold text-sm">{outstanding.join(' · ')}</p>
                </div>
              )}

              {/* Versus comes before the photo: name the battle, then prove it. */}
              {inputs.versus && (
                <div className="mb-6">
                  <p className="text-white font-black text-lg text-center mb-1">⚔️ Who did you battle?</p>
                  <p className="text-white/50 text-sm text-center mb-4">
                    Pick the team and the result - the admin approves it.
                  </p>
                  {reviews.versus?.status === 'rejected' && !versusSent && !approvedKinds.versus && (
                    <div className="mb-4 p-4 rounded-2xl bg-red-500/15 border border-red-400/50 text-center">
                      <div className="text-3xl mb-1">✗</div>
                      <p className="text-red-300 font-black">Result not accepted - please redo</p>
                      {reviews.versus.note && <p className="text-red-200/90 text-sm font-bold mt-1 leading-snug">“{reviews.versus.note}”</p>}
                    </div>
                  )}
                  {approvedKinds.versus ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <p className="text-green-300 font-black">✓ Result approved</p>
                    </div>
                  ) : versusSent ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">Result submitted!</p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for admin review</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <select
                        value={opponentId}
                        onChange={e => setOpponentId(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white text-sm font-bold focus:outline-none focus:border-white/50"
                      >
                        <option value="" className="text-gray-900 bg-white">Select the team you battled…</option>
                        {rivals.map(r => <option key={r.id} value={r.id} className="text-gray-900 bg-white">{r.name}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        {([true, false] as const).map(won => (
                          <button key={String(won)} type="button" onClick={() => setVersusWon(won)}
                            className="py-3 rounded-2xl font-black uppercase tracking-wider text-sm border-2 transition-all active:scale-95"
                            style={versusWon === won
                              ? { background: won ? '#4ade80' : '#f87171', borderColor: 'transparent', color: '#000' }
                              : { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}>
                            {won ? '🏆 We won' : '😅 We lost'}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => void submitVersus()}
                        disabled={versusBusy || !opponentId || versusWon === null}
                        className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                        style={{ backgroundColor: task.hex_code, color: '#000' }}
                      >
                        {versusBusy ? 'Sending…' : 'Submit result for approval'}
                      </button>
                      <p className="text-white/40 text-xs font-bold text-center">
                        Only the team that started the challenge sends this.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Free text sits above the tray so a combined card reads:
                  write, attach, one Submit. */}
              {freeTextMode && (
                <div className="mb-6">
                  {task.answer_question && (
                    <p className="text-white font-black text-lg mb-1 text-center leading-snug">{task.answer_question}</p>
                  )}
                  <p className="text-white/50 text-sm text-center mb-4">
                    {combinedText
                      ? `Write your answer here, then send it together with your ${fileNoun(inputs)} below.`
                      : 'Write your answer - the admin reads and approves it.'}
                  </p>
                  {reviews.text?.status === 'rejected' && !freeTextSent && !approvedKinds.text && (
                    <div className="mb-4 p-4 rounded-2xl bg-red-500/15 border border-red-400/50 text-center">
                      <div className="text-3xl mb-1">✗</div>
                      <p className="text-red-300 font-black">Answer not accepted - please redo</p>
                      {reviews.text.note && <p className="text-red-200/90 text-sm font-bold mt-1 leading-snug">“{reviews.text.note}”</p>}
                    </div>
                  )}
                  {approvedKinds.text ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <p className="text-green-300 font-black">✓ Answer approved</p>
                    </div>
                  ) : freeTextSent ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">Answer submitted!</p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for admin review</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={freeText}
                        onChange={e => setFreeText(e.target.value)}
                        rows={4}
                        placeholder="Type your answer here…"
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white placeholder-white/30 text-sm font-bold focus:outline-none focus:border-white/50 resize-y"
                      />
                      {!combinedText && (
                        <button
                          onClick={() => void submitFreeText()}
                          disabled={freeTextBusy || !freeText.trim()}
                          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                          style={{ backgroundColor: task.hex_code, color: '#000' }}
                        >
                          {freeTextBusy ? 'Sending…' : 'Submit answer for approval'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* A number with a floor comes before the evidence: the team
                  proves the count first, then sends the screenshots. */}
              {numberMode && !needsDrawnAnswer && (
                <div className="mb-6">
                  {task.answer_question && (
                    <p className="text-white font-black text-lg mb-4 text-center leading-snug">
                      {task.answer_question}
                    </p>
                  )}
                  {scanRecord?.answerOk ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <p className="text-green-300 font-black">✓ Number accepted</p>
                      <p className="text-green-300/60 text-xs font-bold mt-1">
                        {inputs.photo ? 'Now send your screenshots as evidence.' : 'That is over the line.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text" inputMode="numeric" value={numberValue}
                          onChange={e => { setNumberValue(e.target.value); setNumberRejected(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') void checkNumber() }}
                          placeholder="Enter the total"
                          className="flex-1 min-w-0 px-4 py-3 rounded-2xl border-2 text-center text-xl font-black focus:outline-none bg-white/10 text-white placeholder-white/30"
                          style={{ borderColor: numberRejected ? '#ef4444' : numberValue ? task.hex_code : 'rgba(255,255,255,0.2)' }}
                        />
                        <button
                          onClick={() => void checkNumber()}
                          disabled={numberBusy || !numberValue.trim()}
                          className="px-5 rounded-2xl font-black uppercase tracking-wider text-sm transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: task.hex_code, color: '#000' }}
                        >
                          {numberBusy ? '…' : 'Check'}
                        </button>
                      </div>
                      {numberRejected && (
                        <p className="text-red-400 text-xs font-bold text-center mt-2">
                          {numberRejected} is not enough yet - keep going and try again.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {(inputs.photo || inputs.video) && photoSubmissionsEnabled && !riddleSolved && drawnPrompt && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/15 text-center mt-4">
                  <div className="text-2xl mb-1">🔒</div>
                  <p className="text-white/60 text-sm font-bold">
                    Answer the riddle first — then you can send your clip.
                  </p>
                </div>
              )}

              {(inputs.photo || inputs.video) && photoSubmissionsEnabled && riddleSolved && (
                <>
                  <p className="text-white font-black text-lg text-center mb-4">{fileHeading(inputs)}</p>
                  {(() => {
                    const r = reviews.photo?.status === 'rejected' ? reviews.photo
                      : reviews.video?.status === 'rejected' ? reviews.video : null
                    const done = approvedKinds.photo || approvedKinds.video
                    return r && !done && !photoSubmitted ? (
                      <div className="mb-4 p-4 rounded-2xl bg-red-500/15 border border-red-400/50 text-center">
                        <div className="text-3xl mb-1">✗</div>
                        <p className="text-red-300 font-black">Not accepted - please redo</p>
                        {r.note && <p className="text-red-200/90 text-sm font-bold mt-1 leading-snug">“{r.note}”</p>}
                        <p className="text-white/50 text-xs font-bold mt-2">Fix it and send again below.</p>
                      </div>
                    ) : null
                  })()}
                  <p className="text-white/50 text-sm text-center mb-5">
                    {task.photo_multiple
                      ? `Send as many ${fileNoun(inputs, true)} as the challenge needs — a marshal reviews each one.`
                      : 'A marshal will review and approve your submission.'}
                  </p>
                  {photoSubmitted && staged.length === 0 && (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">
                        {photosSent > 1
                          ? `${photosSent} files submitted!`
                          : `${fileNoun(inputs).replace(/^./, c => c.toUpperCase())} submitted!`}
                      </p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for marshal review</p>
                    </div>
                  )}

                  {/* Nothing leaves the phone until Submit, so a bad shot is
                      just removed from the tray and retaken. */}
                  {(!photoSubmitted || task.photo_multiple) && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {staged.map(item => (
                          <div key={item.id} className="relative rounded-2xl overflow-hidden bg-black/40 border-2 border-white/15 aspect-square">
                            {item.file.type.startsWith('video/')
                              ? <video src={item.preview} className="w-full h-full object-cover" muted playsInline />
                              : <img src={item.preview} alt="" className="w-full h-full object-cover" />}
                            {item.file.type.startsWith('video/') && (
                              <span className="absolute top-1.5 left-1.5 text-lg drop-shadow">🎬</span>
                            )}
                            <button
                              onClick={() => unstage(item.id)}
                              disabled={photoUploading}
                              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black hover:bg-red-600 disabled:opacity-40 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}

                        {(task.photo_multiple || staged.length === 0) && (
                          <label className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm cursor-pointer hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all aspect-square ${photoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <span className="text-3xl">{fileEmoji(inputs)}</span>
                            <span className="text-center px-2 leading-tight">
                              {staged.length === 0 ? `Add a ${fileNoun(inputs)}` : 'Add more'}
                            </span>
                            <input
                              type="file"
                              accept={fileAccept(inputs) ?? 'image/*'}
                              multiple={task.photo_multiple ?? false}
                              className="hidden"
                              disabled={photoUploading || !scanRecord}
                              onChange={e => {
                                const files = [...(e.target.files ?? [])]
                                e.target.value = ''
                                stageFiles(files)
                              }}
                            />
                          </label>
                        )}
                      </div>

                      {inputs.video && (
                        <p className="text-white/40 text-xs font-bold text-center mt-3">Max 100 MB per clip</p>
                      )}

                      {(staged.length > 0 || (combinedText && freeText.trim())) && (() => {
                        const fileRequired = inputs.photo === 'required' || inputs.video === 'required'
                        const textRequired = inputs.answer === 'required'
                        const missingFile = combinedText && fileRequired && staged.length === 0
                        const missingText = combinedText && textRequired && !freeText.trim()
                        const label = photoUploading ? 'Sending…'
                          : missingFile ? `Add your ${fileNoun(inputs)} to submit`
                          : missingText ? 'Write your answer above to submit'
                          : combinedText && freeText.trim()
                            ? `Submit ${fileNoun(inputs, staged.length !== 1)} + answer for approval`
                            : `Submit ${staged.length} ${fileNoun(inputs, staged.length !== 1)} for approval`
                        return (
                          <button
                            onClick={submitStaged}
                            disabled={photoUploading || missingFile || missingText}
                            className="w-full mt-4 py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                            style={{ backgroundColor: task.hex_code, color: '#000' }}
                          >
                            {label}
                          </button>
                        )
                      })()}
                    </>
                  )}
                </>
              )}

              {/* ── Answer: Letter-box input ── */}
              {/* ── Link: paste where the thing you built lives ── */}
              {inputs.link && (
                <>
                  <p className="text-white font-black text-lg text-center mb-4">🔗 Submit Your Link</p>
                  <p className="text-white/50 text-sm text-center mb-5">
                    Paste the address of what you built — a marshal opens it and approves.
                  </p>
                  {reviews.link?.status === 'rejected' && !linkSent && !approvedKinds.link && (
                    <div className="mb-4 p-4 rounded-2xl bg-red-500/15 border border-red-400/50 text-center">
                      <div className="text-3xl mb-1">✗</div>
                      <p className="text-red-300 font-black">Link not accepted - please redo</p>
                      {reviews.link.note && <p className="text-red-200/90 text-sm font-bold mt-1 leading-snug">“{reviews.link.note}”</p>}
                    </div>
                  )}
                  {linkSent ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">Link submitted!</p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for marshal review</p>
                      <button onClick={() => setLinkSent(false)}
                        className="mt-3 text-white/40 hover:text-white/70 text-xs font-bold underline">
                        Send a different link
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <input
                        type="url"
                        inputMode="url"
                        value={linkValue}
                        onChange={e => setLinkValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void submitLink() }}
                        placeholder="https://…"
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white placeholder-white/30 text-sm font-bold focus:outline-none focus:border-white/50"
                      />
                      <button
                        onClick={() => void submitLink()}
                        disabled={linkBusy || !linkValue.trim()}
                        className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                        style={{ backgroundColor: task.hex_code, color: '#000' }}
                      >
                        {linkBusy ? 'Sending…' : 'Submit link for approval'}
                      </button>
                      <p className="text-white/40 text-xs font-bold text-center">
                        Make sure the link opens for anyone — not just your own account.
                      </p>
                    </div>
                  )}
                </>
              )}

              {needsDrawnAnswer && !drawnPrompt && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/15 text-center">
                  <div className="text-2xl mb-1">🎲</div>
                  <p className="text-white/60 text-sm font-bold">Draw your riddle above to begin.</p>
                </div>
              )}

              {drawnPrompt && (
                <>
                  <p className="text-white font-black text-lg text-center mb-1">🔑 What is it?</p>
                  <p className="text-white/50 text-sm text-center mb-4">
                    Solve your riddle, then type the place. Wrong guesses cost nothing — keep going.
                  </p>

                  {scanRecord?.answerOk ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      <div className="text-3xl mb-2">✅</div>
                      <p className="text-green-300 font-black">Cracked it!</p>
                      <p className="text-green-300/60 text-sm mt-1">
                        Now film your reaction at the place — doing what the riddle describes.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <input
                        type="text"
                        value={guess}
                        onChange={e => setGuess(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void checkDrawnAnswer() }}
                        placeholder="Type the place…"
                        autoComplete="off"
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white placeholder-white/30 text-center text-base font-bold focus:outline-none focus:border-white/50"
                      />
                      <button
                        onClick={() => void checkDrawnAnswer()}
                        disabled={guessBusy || !guess.trim()}
                        className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                        style={{ backgroundColor: task.hex_code, color: '#000' }}
                      >
                        {guessBusy ? 'Checking…' : 'Check my answer'}
                      </button>
                      {guessWrong > 0 && (
                        <p className="text-center text-sm font-bold text-amber-300">
                          Not that one — try again{guessWrong > 2 ? '. Tap the hint above if you are stuck.' : '.'}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {inputs.answer && !numberMode && !freeTextMode && !needsDrawnAnswer && (
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
            {!inputs.photo && !inputs.video && !inputs.link && !inputs.versus && photoSubmissionsEnabled && (
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
                      onChange={async e => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (!f) return
                        setPhotoUploading(true)
                        try { await uploadOne(f); setPhotoSubmitted(true) } finally { setPhotoUploading(false) }
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