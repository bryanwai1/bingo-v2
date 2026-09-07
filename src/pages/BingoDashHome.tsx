import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks } from '../lib/boardCards'
import { useBingoDashTeam } from '../hooks/useBingoDashTeam'
import { ParticleBackground } from '../components/ParticleBackground'
import { TimeUpAlarm } from '../components/TimeUpAlarm'
import { TileFace } from '../components/BingoTileFace'
import { IncomingDuelBanner } from '../components/ContestCard'
import { MyQrButton } from '../components/MyQrButton'
import { ForestWaitingScreen } from '../components/ForestWaitingScreen'
import { WaitingTiger } from '../components/WaitingTiger'
import { activeFaces, faceName, faceColor, normaliseFaceCount } from '../lib/cubeFaces'
import { tasksForFace } from '../lib/boardCards'
import { LeaderApprovalQueue } from '../components/LeaderApprovalQueue'
import { normalizeTileDisplay, type TileDisplay } from '../lib/bingoTileDisplay'
import type { BingoTask, BingoScan, BingoSection, BingoTeam, BoardTimer } from '../types/database'

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const GRID_SIZE = 25 // 5×5

// All 12 possible bingo lines: 5 rows + 5 cols + 2 diagonals
const BINGO_LINES = [
  // Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

const BINGO_WORD = 'BINGO'

// ── Join Screen (search group → password) ─────────────────────────────────────

function JoinScreen({ onJoin }: { onJoin: (teamId: string, password: string) => Promise<void> }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [groups, setGroups] = useState<BingoTeam[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<BingoTeam | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase
        .from('bingo_settings').select('active_section_id').eq('id', 'main').single()
      const sectionId = settings?.active_section_id
      if (!sectionId) { setGroupsLoading(false); return }
      const { data: teams } = await supabase
        .from('bingo_teams').select('*').eq('section_id', sectionId).order('name')
      if (teams) setGroups(teams)
      setGroupsLoading(false)
    })()
  }, [])

  const handlePickGroup = (team: BingoTeam) => {
    setSelectedTeam(team)
    setPassword('')
    setError('')
    setStep(2)
  }

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeam || password.length !== 4) return
    setSubmitting(true)
    setError('')
    try {
      await onJoin(selectedTeam.id, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group')
      setSubmitting(false)
    }
  }

  const filteredGroups = groups
    .filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4 py-8">
      <ParticleBackground />

      <div className="relative z-10 text-center mb-10 animate-slide-up">
        <div className="text-6xl mb-4">🎯</div>
        <h1 className="text-5xl font-black text-white tracking-tight">BINGO DASH</h1>
        <p className="text-gray-400 mt-3 text-lg">Complete challenges · Scan tiles · Win</p>
      </div>

      {step === 1 && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.15s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Join Game</h2>
          <p className="text-gray-400 text-center text-sm mb-5">Search and select your group</p>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full px-4 py-3 rounded-2xl border-2 text-base font-medium focus:outline-none transition-colors text-center mb-3"
            style={{ borderColor: search ? '#a855f7' : '#e5e7eb' }}
            autoFocus
          />

          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
            {groupsLoading ? (
              <p className="text-gray-400 text-sm text-center py-6">Loading groups...</p>
            ) : filteredGroups.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">
                {search ? 'No groups match your search.' : 'No groups available yet. Ask your facilitator.'}
              </p>
            ) : (
              filteredGroups.map(group => {
                const notReady = !group.password
                return (
                  <button
                    key={group.id}
                    onClick={() => !notReady && handlePickGroup(group)}
                    disabled={notReady}
                    className={`w-full px-5 py-4 rounded-2xl border-2 text-left font-bold text-lg transition-all duration-150 ${
                      notReady
                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-gray-200 text-gray-800 hover:border-teal-400 hover:bg-purple-50 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{group.name}</span>
                    </div>
                    {notReady && (
                      <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Not set up yet</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {step === 2 && selectedTeam && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <button
            onClick={() => { setStep(1); setPassword(''); setError('') }}
            className="text-sm text-teal-500 font-bold mb-4 hover:text-purple-700 transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Enter Password</h2>
          <p className="text-gray-400 text-center text-sm mb-1">
            Group: <span className="text-teal-500 font-bold">{selectedTeam.name}</span>
          </p>
          <p className="text-gray-400 text-center text-xs mb-5">
            Enter the 4-digit password given to your group.
          </p>

          <form onSubmit={handleSubmitPassword} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={password}
              onChange={e => {
                setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))
                setError('')
              }}
              placeholder="• • • •"
              className="w-full px-5 py-4 rounded-2xl border-2 text-4xl font-black focus:outline-none transition-colors text-center tracking-[0.6em]"
              style={{ borderColor: password.length === 4 ? '#a855f7' : '#e5e7eb' }}
              autoFocus
              maxLength={4}
              disabled={submitting}
            />

            {error && (
              <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span>🚫</span>
                <p className="text-red-600 font-bold text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={password.length !== 4 || submitting}
              className="w-full py-4 rounded-2xl text-white font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95 mt-1"
              style={{ backgroundColor: '#a855f7', boxShadow: '0 8px 24px #a855f744' }}
            >
              {submitting ? 'Joining...' : 'Join Group →'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-5 flex items-center justify-center gap-1.5">
            <span>📱</span> This device will be remembered for the game.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Bingo Tile ────────────────────────────────────────────────────────────────

type TileStatus = 'locked' | 'scanned' | 'completed'

function BingoTile({
  task,
  status,
  isInBingoLine,
  display,
  onClick,
}: {
  task: BingoTask
  status: TileStatus
  isInBingoLine: boolean
  display: TileDisplay
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={task.title}
      aria-label={task.title}
      className="bingo-glow relative rounded-xl overflow-hidden flex flex-col items-center justify-center aspect-square transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none"
      style={{
        backgroundColor: task.hex_code,
        // drives the .bingo-glow hover glow
        ['--tc' as string]: task.hex_code,
        boxShadow: status === 'completed'
          ? isInBingoLine
            ? `0 0 0 3px #fde68a, 0 0 0 5px ${task.hex_code}, 0 6px 24px ${task.hex_code}cc`
            : `0 0 0 3px white, 0 0 0 5px ${task.hex_code}, 0 6px 20px ${task.hex_code}88`
          : `0 3px 10px ${task.hex_code}55`,
        opacity: status === 'locked' ? 0.72 : 1,
      }}
    >
      {/* Bingo-line golden shimmer */}
      {isInBingoLine && status === 'completed' && (
        <div className="absolute inset-0 bg-yellow-300/10 z-0 pointer-events-none" />
      )}

      {/* Completed overlay */}
      {status === 'completed' && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
          <div
            className="bg-white/90 rounded-full w-7 h-7 flex items-center justify-center shadow"
            style={isInBingoLine ? { boxShadow: '0 0 8px #fbbf24' } : {}}
          >
            <span className="text-sm font-black text-green-600">✓</span>
          </div>
        </div>
      )}

      {/* Scanned ring */}
      {status === 'scanned' && (
        <div className="absolute top-1.5 right-1.5 z-10 w-2.5 h-2.5 rounded-full border-2 border-white/80" />
      )}

      {/* Icon or words — whichever this board is set to in the admin */}
      <TileFace task={task} display={display} />

      {/* Points badge */}
      {(task.points ?? 0) > 0 && (
        <div className="absolute bottom-1 right-1 z-10 bg-black/40 text-white text-[8px] font-black rounded px-1 leading-tight">
          {task.points}
        </div>
      )}
    </button>
  )
}

function EmptyTile() {
  return (
    <div className="rounded-xl aspect-square bg-white/5 border border-white/10" />
  )
}

// ── Bingo Popup ───────────────────────────────────────────────────────────────

function BingoPopup({ letters, onDismiss }: { letters: string; onDismiss: () => void }) {
  const isFull = letters === 'BINGO'
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: 'radial-gradient(ellipse at center, #1e0a3c 0%, rgba(0,0,0,0.92) 70%)' }}
      onClick={onDismiss}
    >
      <div className="text-center animate-bounce-in">
        {/* Collected letters with individual letter boxes */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {BINGO_WORD.split('').map((letter, i) => {
            const earned = i < letters.length
            return (
              <div
                key={letter}
                className="w-14 h-14 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl transition-all"
                style={{
                  backgroundColor: earned ? '#a855f7' : 'rgba(255,255,255,0.05)',
                  color: earned ? '#fff' : 'rgba(255,255,255,0.15)',
                  boxShadow: earned ? '0 0 20px #a855f7aa' : 'none',
                  transform: earned ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {letter}
              </div>
            )
          })}
        </div>

        {/* Announcement */}
        <div
          className="font-black tracking-widest leading-none text-white"
          style={{
            fontSize: 'clamp(4rem, 18vw, 7rem)',
            textShadow: isFull
              ? '0 0 30px #fbbf24, 0 0 60px #f59e0b, 0 0 90px #fbbf24'
              : '0 0 30px #a855f7, 0 0 60px #ec4899',
          }}
        >
          {letters}!
        </div>

        {isFull ? (
          <p className="text-yellow-400 font-black text-xl mt-4 tracking-widest uppercase animate-pulse">
            🎉 You got BINGO! 🎉
          </p>
        ) : (
          <p className="text-teal-300 font-bold text-base mt-3 tracking-wide">
            Bingo line complete!
          </p>
        )}

        <p className="text-white/30 text-sm mt-8">Tap to continue</p>
      </div>
    </div>
  )
}

// ── Timer display ─────────────────────────────────────────────────────────────

function TimerDisplay({ settings }: { settings: BoardTimer | null }) {
  const [display, setDisplay] = useState('00:00')
  const [isRunning, setIsRunning] = useState(false)
  const [isLow, setIsLow] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      if (!settings) { setDisplay('00:00'); setIsRunning(false); setIsLow(false); return }
      if (settings.timer_end_at) {
        const remaining = (new Date(settings.timer_end_at).getTime() - Date.now()) / 1000
        setDisplay(formatTime(remaining))
        setIsRunning(remaining > 0)
        setIsLow(remaining > 0 && remaining <= 120)
      } else {
        setDisplay(formatTime(settings.timer_seconds))
        setIsRunning(false)
        setIsLow(false)
      }
    }, 250)
    return () => clearInterval(id)
  }, [settings])

  if (!settings || (!settings.timer_end_at && settings.timer_seconds === 0)) return null

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-black tabular-nums transition-colors ${
        isLow ? 'bg-red-500/20 text-red-300' : isRunning ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-500'
      }`}
    >
      <span className={`text-xs ${isRunning ? (isLow ? 'text-red-400' : 'text-green-400') : 'text-gray-600'}`}>
        {isRunning ? '●' : '■'}
      </span>
      {display}
    </div>
  )
}

// ── Board Screen ──────────────────────────────────────────────────────────────

function BoardScreen({
  team,
  gridTasks,
  scans,
  settings,
  boardNote,
  boardNoteEvery,
  tileDisplay,
  faceCountProp,
  onLeave,
}: {
  team: { id: string; name: string }
  gridTasks: BingoTask[]
  scans: BingoScan[]
  settings: BoardTimer | null
  boardNote: string
  boardNoteEvery: number
  tileDisplay: TileDisplay
  /** Cube faces in play for this board; 1 keeps the classic layout. */
  faceCountProp?: number | null
  onLeave: () => void
}) {
  const navigate = useNavigate()
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [popupLetters, setPopupLetters] = useState<string | null>(null)
  const [popupQueue, setPopupQueue] = useState<string[]>([])
  const celebratedLinesRef = useRef<Set<number> | null>(null)

  // Which face this player is looking at. A one-face board never shows the
  // tabs, so nothing changes for the classic game.
  const [face, setFace] = useState(0)
  const faceCount = normaliseFaceCount(faceCountProp)
  const visibleTasks = faceCount > 1 ? tasksForFace(gridTasks, face) : gridTasks
  const gridTaskIds = new Set(visibleTasks.map(t => t.id))
  const completedCount = scans.filter(s => s.completed && gridTaskIds.has(s.task_id)).length

  const getStatus = (taskId: string): TileStatus => {
    const scan = scans.find(s => s.task_id === taskId)
    if (!scan) return 'locked'
    return scan.completed ? 'completed' : 'scanned'
  }

  // Build a sparse 25-slot array: each task lands at slot = sort_order (0-24).
  // Legacy rows whose sort_order is out of range or collides fall into the
  // first empty slot so the board stays consistent with the admin editor.
  const slots: (BingoTask | null)[] = (() => {
    const out: (BingoTask | null)[] = Array(GRID_SIZE).fill(null)
    const overflow: BingoTask[] = []
    for (const t of visibleTasks) {
      const s = t.sort_order
      if (Number.isInteger(s) && s >= 0 && s < GRID_SIZE && out[s] === null) out[s] = t
      else overflow.push(t)
    }
    for (const t of overflow) {
      const i = out.findIndex(x => x === null)
      if (i !== -1) out[i] = t
    }
    return out
  })()

  // Determine which bingo lines are fully completed
  const completedLineIndices = BINGO_LINES.reduce((acc, line, i) => {
    const allDone = line.every(slotIdx => {
      const task = slots[slotIdx]
      return task && getStatus(task.id) === 'completed'
    })
    if (allDone) acc.add(i)
    return acc
  }, new Set<number>())

  const completedBingoCount = completedLineIndices.size

  // Which slots are part of at least one completed bingo line
  const bingoSlots = new Set<number>()
  completedLineIndices.forEach(lineIdx => {
    BINGO_LINES[lineIdx].forEach(slotIdx => bingoSlots.add(slotIdx))
  })

  // Letters earned: 1st bingo → B, 2nd → BI, etc. (capped at 5)
  const lettersEarned = BINGO_WORD.slice(0, Math.min(completedBingoCount, 5))


  // Stable dep key so the detection effect only runs when the set of
  // completed line indices actually changes (not on every render).
  const completedLinesKey = [...completedLineIndices].sort((a, b) => a - b).join(',')

  // Detect newly completed bingo lines and queue one popup per line.
  // Tracking the set of celebrated indices (not a count) ensures every new line
  // gets its own announcement, even when one tile completes multiple lines at once.
  useEffect(() => {
    if (celebratedLinesRef.current === null) {
      celebratedLinesRef.current = new Set(completedLineIndices)
      return
    }
    const newLines: number[] = []
    completedLineIndices.forEach(idx => {
      if (!celebratedLinesRef.current!.has(idx)) newLines.push(idx)
    })
    if (newLines.length === 0) return
    const baseSize = celebratedLinesRef.current.size
    newLines.forEach(idx => celebratedLinesRef.current!.add(idx))
    const queued = newLines.map((_, i) =>
      BINGO_WORD.slice(0, Math.min(baseSize + i + 1, 5))
    )
    setPopupQueue(prev => [...prev, ...queued])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedLinesKey])

  // Drive the popup from the queue: show each item for 4s, then advance.
  useEffect(() => {
    if (popupLetters || popupQueue.length === 0) return
    setPopupLetters(popupQueue[0])
    setPopupQueue(prev => prev.slice(1))
  }, [popupLetters, popupQueue])

  useEffect(() => {
    if (!popupLetters) return
    const t = setTimeout(() => setPopupLetters(null), 4000)
    return () => clearTimeout(t)
  }, [popupLetters])

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-x-hidden">
      <ParticleBackground />

      {/* Bingo celebration popup */}
      {popupLetters && (
        <BingoPopup letters={popupLetters} onDismiss={() => setPopupLetters(null)} />
      )}

      {/* Header */}
      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="board-col flex items-start justify-between gap-3">
          <div>
            <p className="text-teal-400 text-[10px] font-black uppercase tracking-widest">Bingo Dash</p>
            <h1 className="text-white text-xl font-black tracking-tight leading-tight">{team.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-green-400 text-xs font-bold">{completedCount}/{visibleTasks.length} completed</span>
              {lettersEarned && (
                <span className="text-teal-300 text-xs font-black tracking-widest">{lettersEarned}!</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
            <TimerDisplay settings={settings} />
            {/* Carried by every player so nobody has to queue at the host desk
                for a code they need mid-activity. */}
            <MyQrButton
              value={`bingodash-team:${team.id}`}
              teamName={team.name}
            />
            {!showLeaveConfirm ? (
              <button onClick={() => setShowLeaveConfirm(true)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Switch Team
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <p className="text-xs text-gray-400">Switch?</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowLeaveConfirm(false)} className="text-xs text-gray-500">Cancel</button>
                  <button onClick={onLeave} className="text-xs text-red-400 font-bold">Yes</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="board-col mt-3">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: gridTasks.length ? `${(completedCount / gridTasks.length) * 100}%` : '0%',
                background: 'linear-gradient(90deg, #a855f7, #ec4899)',
              }}
            />
          </div>
        </div>
      </header>

      {/* 5×5 Grid with BINGO side letters */}
      <main className="relative z-10 px-3 pb-8">
        <div className="board-col">
          {/* Face tabs. Only rendered on a cube board, so a normal game is
              visually unchanged. Each pill carries that face's own progress so
              a team can see at a glance where the work is left. */}
          {faceCount > 1 && (
            <div className="flex gap-1.5 mb-3 flex-wrap justify-center">
              {activeFaces(faceCount).map(f => {
                const on = face === f
                const ft = tasksForFace(gridTasks, f)
                const doneOnFace = ft.filter(t => getStatus(t.id) === 'completed').length
                return (
                  <button
                    key={f}
                    onClick={() => setFace(f)}
                    className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95"
                    style={on
                      ? { background: faceColor(f), color: '#fff' }
                      : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    {faceName(f)}
                    <span className={on ? 'text-white/70 ml-1.5' : 'text-white/35 ml-1.5'}>
                      {doneOnFace}/{ft.length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {visibleTasks.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-bold">No grid set up yet</p>
              <p className="text-sm mt-1">Ask your facilitator to configure the grid</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {slots.map((task, i) =>
                task ? (
                  <BingoTile
                    key={task.id}
                    task={task}
                    status={getStatus(task.id)}
                    isInBingoLine={bingoSlots.has(i)}
                    display={tileDisplay}
                    onClick={() => navigate(`/bingo-dash/task/${task.id}`)}
                  />
                ) : (
                  <EmptyTile key={`empty-${i}`} />
                )
              )}
            </div>
          )}
        </div>
      </main>

      {/* Legend */}
      {gridTasks.length > 0 && (
        <div className="relative z-10 pb-6 flex justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-600 opacity-50" />Not visited</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-gray-400" />In progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-white" />Done</span>
        </div>
      )}

      {/* Facilitator note below the board (e.g. Bonsai Project item collection) */}
      {boardNote.trim() !== '' && gridTasks.length > 0 && (
        <div className="relative z-10 px-4 pb-8">
          <div className="board-col">
            <div className="rounded-2xl overflow-hidden border border-emerald-800/40 bg-emerald-950/30">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-emerald-800/30">
                <span className="text-base">🌱</span>
                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest">Note from Facilitator</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-white text-sm font-medium whitespace-pre-wrap leading-relaxed">{boardNote}</p>
                {boardNoteEvery > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-900/40 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-emerald-300 text-xs font-black uppercase tracking-wider">Items to collect</p>
                      <p className="text-emerald-500/70 text-[11px] font-semibold">1 item per {boardNoteEvery} completed boxes · {completedCount} done</p>
                    </div>
                    <div className="text-emerald-300 text-3xl font-black tabular-nums">
                      {Math.floor(completedCount / boardNoteEvery)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BingoDashHome() {
  const { team, loading: teamLoading, isRegistered, joinTeamById, leaveTeam } = useBingoDashTeam()
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [section, setSection] = useState<BingoSection | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [boardNote, setBoardNote] = useState('')
  const [boardNoteEvery, setBoardNoteEvery] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)

  // Load grid tasks + the active section (timer/alarm settings live on it)
  useEffect(() => {
    supabase.from('bingo_settings').select('active_section_id').eq('id', 'main').single()
      .then(async ({ data: settingsData }) => {
        const sectionId = settingsData?.active_section_id
        if (!sectionId) { setGridTasks([]); setDataLoading(false); return }
        setSectionId(sectionId)
        const taskData = await fetchBoardTasks(sectionId)
        setGridTasks(taskData)
        const { data: sectionData } = await supabase
          .from('bingo_sections')
          .select('*')
          .eq('id', sectionId)
          .single()
        if (sectionData) {
          setSection(sectionData)
          setBoardNote(sectionData.board_note ?? '')
          setBoardNoteEvery(sectionData.board_note_every ?? 0)
        }
        setDataLoading(false)
      })
  }, [])

  // Live: section updates from the admin (timer, alarm, board note)
  useEffect(() => {
    if (!sectionId) return
    const channel = supabase
      .channel(`bingo-home-section-${sectionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `id=eq.${sectionId}` }, ({ new: updated }) => {
        const sec = updated as BingoSection
        setSection(prev => prev ? { ...prev, ...sec } : sec)
        setBoardNote(sec.board_note ?? '')
        setBoardNoteEvery(sec.board_note_every ?? 0)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sectionId])

  // iOS Safari suspends realtime WebSockets when the tab is backgrounded or the
  // screen locks, so participants miss the "game started" UPDATE and appear stuck
  // until they refresh. These two effects make the page self-heal without one.

  // 1. Re-sync whenever the page becomes visible / regains focus (e.g. after unlock).
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      if (sectionId) {
        supabase.from('bingo_sections').select('*').eq('id', sectionId).single()
          .then(({ data }) => {
            if (!data) return
            setSection(prev => prev ? { ...prev, ...data } : data)
            setBoardNote(data.board_note ?? '')
            setBoardNoteEvery(data.board_note_every ?? 0)
          })
      }
      if (team?.id) {
        supabase.from('bingo_scans').select('*').eq('team_id', team.id)
          .then(({ data }) => { if (data) setScans(data) })
      }
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [sectionId, team?.id])

  // 2. While the game is locked, poll for the start as a fallback for a dead socket.
  useEffect(() => {
    if (!sectionId || section?.game_started) return
    const id = setInterval(() => {
      supabase.from('bingo_sections').select('game_started').eq('id', sectionId).single()
        .then(({ data }) => {
          if (data?.game_started) setSection(prev => prev ? { ...prev, game_started: true } : prev)
        })
    }, 4000)
    return () => clearInterval(id)
  }, [sectionId, section?.game_started])

  // Load this team's scans
  useEffect(() => {
    if (!team) { setScans([]); return }
    supabase
      .from('bingo_scans')
      .select('*')
      .eq('team_id', team.id)
      .then(({ data }) => { if (data) setScans(data) })
  }, [team])

  // Live: scan updates
  useEffect(() => {
    if (!team) return
    const channel = supabase
      .channel(`bingo-home-scans-${team.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_scans', filter: `team_id=eq.${team.id}` },
        () => {
          supabase
            .from('bingo_scans')
            .select('*')
            .eq('team_id', team.id)
            .then(({ data }) => { if (data) setScans(data) })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [team])

  if (teamLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-xl font-bold animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!isRegistered) {
    return (
      <>
        <JoinScreen onJoin={async (teamId, pwd) => { await joinTeamById(teamId, pwd) }} />
        <TimeUpAlarm settings={section} />
      </>
    )
  }

  // Locked board: registered players wait here until the admin sets it live.
  // Mirrors the gate on /bingo-dash/play/:sectionSlug (BingoDashJoin).
  if (section && !section.game_started) {
    return (
      <>
        <div className="relative overflow-hidden flex flex-col items-center justify-end pb-0" style={{ minHeight: '100dvh' }}>
          {/* Players can sit on this screen for several minutes before a
              facilitator starts, so it needs to be somewhere pleasant to wait
              rather than a spinner on black. */}
          <ForestWaitingScreen />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 5, background: 'linear-gradient(to bottom, rgba(4,15,12,0.60) 0%, rgba(4,15,12,0.28) 42%, rgba(4,15,12,0.75) 100%)' }}
          />

          <div className="relative z-10 text-center px-6 pt-16 flex-1 flex flex-col justify-center [text-shadow:0_2px_14px_rgba(0,0,0,0.75)]">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-200/90 mb-2">
              {section.name}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
              Waiting to start
            </h1>
            <p className="text-white/85 text-sm">
              You're in <span className="text-amber-300 font-bold">{team!.name}</span>.
              <br className="sm:hidden" /> The game begins when your host says go.
            </p>

            <div className="w-48 mx-auto mt-7">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full tiger-bar" style={{ background: '#fbbf24' }} />
              </div>
            </div>

            <button
              onClick={leaveTeam}
              className="mt-8 text-xs text-white/45 hover:text-white/75 transition-colors"
            >
              Switch team
            </button>
          </div>

          {/* The tiger stands and walks off the moment the board goes live,
              so the wait ends with something happening rather than a jump cut. */}
          <div className="relative z-10 w-full">
            <WaitingTiger />
          </div>
        </div>
        <TimeUpAlarm settings={section} />
      </>
    )
  }

  return (
    <>
      <BoardScreen
        team={team!}
        gridTasks={gridTasks}
        scans={scans}
        settings={section}
        boardNote={boardNote}
        boardNoteEvery={boardNoteEvery}
        tileDisplay={normalizeTileDisplay(section?.tile_display)}
        faceCountProp={section?.face_count}
        onLeave={leaveTeam}
      />
      {/* Another team can challenge us at any moment — the banner has to reach
          players wherever they are on the board, not only inside a card. */}
      {team && sectionId && <IncomingDuelBanner team={team} sectionId={sectionId} />}
      <LeaderApprovalQueue teamId={team?.id ?? null} />
      <TimeUpAlarm settings={section} />
    </>
  )
}
