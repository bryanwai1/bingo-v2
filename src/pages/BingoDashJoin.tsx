import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks } from '../lib/boardCards'
import { ParticleBackground } from '../components/ParticleBackground'
import { TimeUpAlarm } from '../components/TimeUpAlarm'
import { TileFace } from '../components/BingoTileFace'
import { IncomingDuelBanner } from '../components/ContestCard'
import { normalizeTileDisplay, type TileDisplay } from '../lib/bingoTileDisplay'
import type { BingoTask, BingoScan, BingoSection, BingoTeam, BingoMember, BoardTimer } from '../types/database'

/* ── helpers ─────────────────────────────────────────────────────────────────── */

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const GRID_SIZE = 25
const MAX_TEAM_MEMBERS = 4
const BINGO_WORD = 'BINGO'
const BINGO_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
]

const MEMBER_ID_KEY = (sectionSlug: string) => `bingo-join-member-${sectionSlug}`
const MEMBER_DATA_KEY = (sectionSlug: string) => `bingo-join-member-data-${sectionSlug}`
const TEAM_ID_KEY = (sectionSlug: string) => `bingo-join-team-${sectionSlug}`
const TEAM_DATA_KEY = (sectionSlug: string) => `bingo-join-data-${sectionSlug}`
const MEMBER_ROLE_KEY = (sectionSlug: string) => `bingo-join-role-${sectionSlug}`
const PLAYER_NAME_KEY = 'bingo-player-name'

// Shared with useBingoDashTeam so the task page recognizes the user without re-registering.
const GLOBAL_TEAM_ID_KEY = 'bingo-dash-team-id'
const GLOBAL_TEAM_DATA_KEY = 'bingo-dash-team-data'
const GLOBAL_MEMBER_ROLE_KEY = 'bingo-dash-member-role'
const GLOBAL_MEMBER_ID_KEY = 'bingo-dash-member-id'

type TileStatus = 'locked' | 'scanned' | 'completed'

/* ── Join Screen (2-step funnel) ──────────────────────────────────────────────── */

function JoinScreen({
  sectionName,
  groups,
  memberCounts,
  onJoinGroup,
  isObserver = false,
}: {
  sectionName: string
  groups: BingoTeam[]
  memberCounts: Record<string, number>
  onJoinGroup: (memberName: string, password: string, teamId: string, role: 'member' | 'observer') => Promise<void>
  isObserver?: boolean
}) {
  const [step, setStep] = useState<'name' | 'group' | 'password'>('name')
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<BingoTeam | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const trimmedName = playerName.trim()

  const handleSubmitName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmedName) return
    localStorage.setItem(PLAYER_NAME_KEY, trimmedName)
    setError('')
    setStep('group')
  }

  // Group step: pick a group
  const handlePickGroup = async (team: BingoTeam) => {
    if (!trimmedName) { setStep('name'); return }
    if (isObserver) {
      // Observers skip the password step and join directly
      setSubmitting(true)
      setError('')
      try {
        await onJoinGroup(trimmedName, '', team.id, 'observer')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join group')
        setSubmitting(false)
      }
      return
    }
    setSelectedTeam(team)
    setPassword('')
    setError('')
    setStep('password')
  }

  // Password step: submit password (members only)
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeam || password.length !== 4 || !trimmedName) return
    setSubmitting(true)
    setError('')
    try {
      await onJoinGroup(trimmedName, password, selectedTeam.id, 'member')
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
        <div className="text-6xl mb-4">{isObserver ? '👁' : '🎯'}</div>
        <h1 className="text-5xl font-black text-white tracking-tight">BINGO DASH</h1>
        <p className="text-teal-400 mt-2 text-base font-bold">{sectionName}</p>
        {isObserver
          ? <p className="text-blue-400 mt-1 text-sm font-semibold">Observer mode &middot; View only</p>
          : <p className="text-gray-400 mt-1 text-sm">Complete challenges &middot; Scan tiles &middot; Win</p>
        }
      </div>

      {step === 'name' && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}
        >
          {isObserver && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-5">
              <span className="text-base">👁</span>
              <p className="text-blue-700 text-xs font-bold">You're joining as an Observer — view only, no submissions.</p>
            </div>
          )}
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">
            What's your name?
          </h2>
          <p className="text-gray-400 text-center text-sm mb-5">
            This is how your team will see you on the leaderboard.
          </p>

          <form onSubmit={handleSubmitName} className="flex flex-col gap-3">
            <input
              type="text"
              value={playerName}
              onChange={e => { setPlayerName(e.target.value); setError('') }}
              placeholder="Your name"
              maxLength={40}
              className="w-full px-5 py-4 rounded-2xl border-2 text-lg font-bold focus:outline-none transition-colors text-center"
              style={{ borderColor: trimmedName ? '#a855f7' : '#e5e7eb' }}
              autoFocus
            />

            {error && (
              <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span>🚫</span>
                <p className="text-red-600 font-bold text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!trimmedName}
              className="w-full py-4 rounded-2xl text-white font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95 mt-1"
              style={{ backgroundColor: '#a855f7', boxShadow: '0 8px 24px #a855f744' }}
            >
              Continue →
            </button>
          </form>
        </div>
      )}

      {step === 'group' && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <button
            onClick={() => { setStep('name'); setError('') }}
            className="text-sm text-teal-500 font-bold mb-4 hover:text-purple-700 transition-colors"
          >
            &larr; Back
          </button>
          {isObserver && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-5">
              <span className="text-base">👁</span>
              <p className="text-blue-700 text-xs font-bold">You're joining as an Observer — view only, no submissions.</p>
            </div>
          )}
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">
            {isObserver ? 'Select Group to Watch' : 'Join Game'}
          </h2>
          <p className="text-gray-400 text-center text-sm mb-1">
            Hi <span className="text-teal-500 font-bold">{trimmedName}</span>!
          </p>
          <p className="text-gray-400 text-center text-sm mb-5">
            {isObserver ? 'Pick the group you want to observe' : 'Search and select your group'}
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
              <span>🚫</span>
              <p className="text-red-600 font-bold text-sm">{error}</p>
            </div>
          )}

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full px-4 py-3 rounded-2xl border-2 text-base font-medium focus:outline-none transition-colors text-center mb-3"
            style={{ borderColor: search ? '#a855f7' : '#e5e7eb' }}
            autoFocus
            disabled={submitting}
          />

          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
            {filteredGroups.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">
                {search ? 'No groups match your search.' : 'No groups available yet.'}
              </p>
            ) : (
              filteredGroups.map(group => {
                const count = memberCounts[group.id] ?? 0
                const isFull = !isObserver && count >= MAX_TEAM_MEMBERS
                const notReady = !isObserver && !group.password
                const disabled = isFull || notReady || submitting
                return (
                  <button
                    key={group.id}
                    onClick={() => !disabled && handlePickGroup(group)}
                    disabled={disabled}
                    className={`w-full px-5 py-4 rounded-2xl border-2 text-left font-bold text-lg transition-all duration-150 ${
                      disabled
                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : isObserver
                          ? 'border-gray-200 text-gray-800 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.98]'
                          : 'border-gray-200 text-gray-800 hover:border-teal-400 hover:bg-purple-50 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{group.name}</span>
                      {!isObserver && (
                        <span className={`text-xs font-mono ${isFull ? 'text-red-400' : 'text-gray-400'}`}>
                          {count} / {MAX_TEAM_MEMBERS}
                        </span>
                      )}
                    </div>
                    {isFull && (
                      <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Full</span>
                    )}
                    {notReady && !isFull && (
                      <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Not set up yet</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
          {submitting && (
            <p className="text-center text-sm text-gray-400 mt-4 font-medium">Joining as observer...</p>
          )}
        </div>
      )}

      {step === 'password' && selectedTeam && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <button
            onClick={() => {
              setStep('group')
              setPassword('')
              setError('')
            }}
            className="text-sm text-teal-500 font-bold mb-4 hover:text-purple-700 transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">
            Enter Password
          </h2>
          <p className="text-gray-400 text-center text-sm mb-1">
            <span className="text-teal-500 font-bold">{trimmedName}</span> joining <span className="text-teal-500 font-bold">{selectedTeam.name}</span>
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

/* ── Bingo Tile ──────────────────────────────────────────────────────────────── */

function BingoTile({
  task, status, isInBingoLine, display, onClick,
}: {
  task: BingoTask; status: TileStatus; isInBingoLine: boolean; display: TileDisplay; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={task.title}
      aria-label={task.title}
      className="relative rounded-lg overflow-hidden flex items-center justify-center aspect-square transition-all duration-200 active:scale-95 focus:outline-none"
      style={{
        backgroundColor: task.hex_code,
        boxShadow: status === 'completed'
          ? isInBingoLine
            ? `0 0 0 2px #fde68a, 0 0 0 3px ${task.hex_code}`
            : `0 0 0 2px white, 0 0 0 3px ${task.hex_code}`
          : 'none',
        opacity: status === 'locked' ? 0.65 : 1,
      }}
    >
      {isInBingoLine && status === 'completed' && (
        <div className="absolute inset-0 bg-yellow-300/10 z-0 pointer-events-none" />
      )}
      {status === 'completed' && (
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center z-10">
          <div
            className="bg-white/90 rounded-full w-5 h-5 flex items-center justify-center"
            style={isInBingoLine ? { boxShadow: '0 0 6px #fbbf24' } : {}}
          >
            <span className="text-[10px] font-black text-green-600">✓</span>
          </div>
        </div>
      )}
      {status === 'scanned' && (
        <div className="absolute top-1 right-1 z-10 w-2 h-2 rounded-full border-2 border-white/80" />
      )}
      {/* Icon or words — whichever this board is set to in the admin */}
      <TileFace task={task} display={display} size="sm" />
    </button>
  )
}

function EmptyTile() {
  return <div className="rounded-lg aspect-square bg-white/5 border border-white/10" />
}

/* ── Bingo Popup ─────────────────────────────────────────────────────────────── */

function BingoPopup({ letters, onDismiss }: { letters: string; onDismiss: () => void }) {
  const isFull = letters === 'BINGO'
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: 'radial-gradient(ellipse at center, #1e0a3c 0%, rgba(0,0,0,0.92) 70%)' }}
      onClick={onDismiss}
    >
      <div className="text-center animate-bounce-in">
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
            You got BINGO!
          </p>
        ) : (
          <p className="text-teal-300 font-bold text-base mt-3 tracking-wide">Bingo line complete!</p>
        )}
        <p className="text-white/30 text-sm mt-8">Tap to continue</p>
      </div>
    </div>
  )
}

/* ── Timer ────────────────────────────────────────────────────────────────────── */

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
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-black tabular-nums transition-colors ${
      isLow ? 'bg-red-500/20 text-red-300' : isRunning ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-500'
    }`}>
      <span className={`text-xs ${isRunning ? (isLow ? 'text-red-400' : 'text-green-400') : 'text-gray-600'}`}>
        {isRunning ? '●' : '■'}
      </span>
      {display}
    </div>
  )
}

/* ── Board Screen ────────────────────────────────────────────────────────────── */

function BoardScreen({
  team,
  sectionName,
  sectionSlug: _sectionSlug,
  memberRole,
  gridTasks,
  scans,
  settings,
  boardNote,
  boardNoteEvery,
  tileDisplay,
  onLeave,
}: {
  team: { id: string; name: string }
  sectionName: string
  sectionSlug: string
  memberRole: 'member' | 'observer'
  gridTasks: BingoTask[]
  scans: BingoScan[]
  settings: BoardTimer | null
  boardNote: string
  boardNoteEvery: number
  tileDisplay: TileDisplay
  onLeave: () => void
}) {
  const navigate = useNavigate()
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [popupLetters, setPopupLetters] = useState<string | null>(null)
  const [popupQueue, setPopupQueue] = useState<string[]>([])
  const celebratedLinesRef = useRef<Set<number> | null>(null)

  // A card can sit in several boxes on one board, so status is looked up by
  // THIS box's placement first. Falls back to the card-wide scan (no
  // board_card_id) so boards completed before this existed keep working.
  // Uses .some() rather than picking one matching scan: recordScan's
  // select-then-insert can race and leave two rows for the same box (one
  // stale, one the real completion) — any completed match should count,
  // not whichever happens to sort first.
  const getStatus = (task: BingoTask): TileStatus => {
    const matches = (s: BingoScan) =>
      task.placement_id ? s.board_card_id === task.placement_id
        : s.task_id === task.id
    const legacyMatches = (s: BingoScan) => task.placement_id != null && s.board_card_id == null && s.task_id === task.id
    if (scans.some(s => (matches(s) || legacyMatches(s)) && s.completed)) return 'completed'
    if (scans.some(s => matches(s) || legacyMatches(s))) return 'scanned'
    return 'locked'
  }
  const completedCount = gridTasks.filter(t => getStatus(t) === 'completed').length

  const slots: (BingoTask | null)[] = (() => {
    const out: (BingoTask | null)[] = Array(GRID_SIZE).fill(null)
    const overflow: BingoTask[] = []
    for (const t of gridTasks) {
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

  const completedLineIndices = BINGO_LINES.reduce((acc, line, i) => {
    const allDone = line.every(slotIdx => {
      const task = slots[slotIdx]
      return task && getStatus(task) === 'completed'
    })
    if (allDone) acc.add(i)
    return acc
  }, new Set<number>())

  const completedBingoCount = completedLineIndices.size
  const bingoSlots = new Set<number>()
  completedLineIndices.forEach(lineIdx => {
    BINGO_LINES[lineIdx].forEach(slotIdx => bingoSlots.add(slotIdx))
  })
  const lettersEarned = BINGO_WORD.slice(0, Math.min(completedBingoCount, 5))

  // Stable dep key so the detection effect only runs when the set of
  // completed line indices actually changes.
  const completedLinesKey = [...completedLineIndices].sort((a, b) => a - b).join(',')

  // Detect newly completed bingo lines and queue one popup per line so each
  // achievement gets its own announcement, even when one tile completes
  // multiple lines at once.
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

      {popupLetters && <BingoPopup letters={popupLetters} onDismiss={() => setPopupLetters(null)} />}

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="max-w-md mx-auto flex items-start justify-between gap-3">
          <div>
            <p className="text-teal-400 text-[10px] font-black uppercase tracking-widest">Bingo Dash &middot; {sectionName}</p>
            <h1 className="text-white text-xl font-black tracking-tight leading-tight">{team.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-green-400 text-xs font-bold">{completedCount}/{gridTasks.length} completed</span>
              {lettersEarned && (
                <span className="text-teal-300 text-xs font-black tracking-widest">{lettersEarned}!</span>
              )}
              {memberRole === 'observer' && (
                <span className="text-blue-300 text-[10px] font-black uppercase tracking-wider bg-blue-900/40 px-1.5 py-0.5 rounded">👁 Observer</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
            <TimerDisplay settings={settings} />
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

        <div className="max-w-md mx-auto mt-3">
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

      <main className="relative z-10 px-3 pb-8">
        <div className="max-w-md mx-auto">
          {gridTasks.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-bold">No grid set up yet</p>
              <p className="text-sm mt-1">Ask your facilitator to configure the grid</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {slots.map((task, i) =>
                task ? (
                  <BingoTile
                    key={task.placement_id ?? task.id}
                    task={task}
                    status={getStatus(task)}
                    isInBingoLine={bingoSlots.has(i)}
                    display={tileDisplay}
                    onClick={() => navigate(`/bingo-dash/task/${task.id}${task.placement_id ? `?box=${task.placement_id}` : ''}`)}
                  />
                ) : (
                  <EmptyTile key={`empty-${i}`} />
                )
              )}
            </div>
          )}
        </div>
      </main>

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
          <div className="max-w-md mx-auto">
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

/* ── Main Page ───────────────────────────────────────────────────────────────── */

export function BingoDashJoin() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>()
  const [searchParams] = useSearchParams()
  const isObserver = searchParams.get('mode') === 'observer'
  const [section, setSection] = useState<BingoSection | null>(null)
  const [team, setTeam] = useState<{ id: string; name: string } | null>(null)
  const [memberRole, setMemberRole] = useState<'member' | 'observer'>('member')
  const [groups, setGroups] = useState<BingoTeam[]>([])
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [pageState, setPageState] = useState<'loading' | 'not-found' | 'join' | 'board'>('loading')

  // Resolve section by slug
  useEffect(() => {
    if (!sectionSlug) { setPageState('not-found'); return }
    supabase
      .from('bingo_sections')
      .select('*')
      .eq('slug', sectionSlug)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setPageState('not-found'); return }
        setSection(data)

        // Check for cached member in this section
        const cachedMemberId = localStorage.getItem(MEMBER_ID_KEY(sectionSlug))
        const cachedTeamId = localStorage.getItem(TEAM_ID_KEY(sectionSlug))
        const cachedTeamData = localStorage.getItem(TEAM_DATA_KEY(sectionSlug))
        const cachedRole = (localStorage.getItem(MEMBER_ROLE_KEY(sectionSlug)) ?? 'member') as 'member' | 'observer'
        // Player URL (no ?mode=observer) means the user wants to play, not observe.
        // Drop any stale observer session so they aren't silently kept in observer mode
        // — that would make every task QR they scan show "Observer Mode".
        if (!isObserver && cachedRole === 'observer') {
          // Stale observer session for this board: the user now wants to PLAY, so
          // clear this board's observer cache (they must re-pick a team + password —
          // observers never had one). Only clear the SHARED global keys if they too
          // belong to an observer session; otherwise leave a real player session
          // (e.g. for another board) intact instead of wiping it.
          localStorage.removeItem(MEMBER_ID_KEY(sectionSlug))
          localStorage.removeItem(MEMBER_DATA_KEY(sectionSlug))
          localStorage.removeItem(TEAM_ID_KEY(sectionSlug))
          localStorage.removeItem(TEAM_DATA_KEY(sectionSlug))
          localStorage.removeItem(MEMBER_ROLE_KEY(sectionSlug))
          if (localStorage.getItem(GLOBAL_MEMBER_ROLE_KEY) === 'observer') {
            localStorage.removeItem(GLOBAL_TEAM_ID_KEY)
            localStorage.removeItem(GLOBAL_TEAM_DATA_KEY)
            localStorage.removeItem(GLOBAL_MEMBER_ROLE_KEY)
          }
          setPageState('join')
        } else if (cachedMemberId && cachedTeamId && cachedTeamData) {
          try {
            const parsed = JSON.parse(cachedTeamData)
            setTeam(parsed)
            setMemberRole(cachedRole)
            setPageState('board')
            localStorage.setItem(GLOBAL_TEAM_ID_KEY, cachedTeamId)
            localStorage.setItem(GLOBAL_TEAM_DATA_KEY, cachedTeamData)
            localStorage.setItem(GLOBAL_MEMBER_ROLE_KEY, cachedRole)
            // Validate team still exists in background. Only drop the saved session
            // when the server *confirms* the team is gone (query succeeded, zero rows).
            // A transient error (network blip / 5xx / RLS) returns an error with null
            // data — keep the cached session so it doesn't force a needless re-join
            // (which led to duplicate sign-ups).
            supabase.from('bingo_teams').select('*').eq('id', cachedTeamId).maybeSingle().then(({ data: t, error }) => {
              if (t) {
                setTeam(t)
                const json = JSON.stringify(t)
                localStorage.setItem(TEAM_DATA_KEY(sectionSlug), json)
                localStorage.setItem(GLOBAL_TEAM_DATA_KEY, json)
              }
              else if (!error) {
                // Confirmed: the team no longer exists.
                localStorage.removeItem(MEMBER_ID_KEY(sectionSlug)); localStorage.removeItem(MEMBER_DATA_KEY(sectionSlug))
                localStorage.removeItem(TEAM_ID_KEY(sectionSlug)); localStorage.removeItem(TEAM_DATA_KEY(sectionSlug))
                localStorage.removeItem(GLOBAL_TEAM_ID_KEY); localStorage.removeItem(GLOBAL_TEAM_DATA_KEY)
                setTeam(null); setPageState('join')
              }
              // else: transient error — keep showing the board with cached data.
            })
          } catch { setPageState('join') }
        } else {
          setPageState('join')
        }

        // Load groups (teams) for this section
        supabase
          .from('bingo_teams')
          .select('*')
          .eq('section_id', data.id)
          .order('name')
          .then(({ data: g }) => { if (g) setGroups(g) })

        // Load member counts per team — only 'member' role counts toward the cap
        supabase
          .from('bingo_members')
          .select('team_id')
          .eq('section_id', data.id)
          .eq('role', 'member')
          .then(({ data: m }) => {
            if (!m) return
            const counts: Record<string, number> = {}
            for (const row of m) counts[row.team_id] = (counts[row.team_id] ?? 0) + 1
            setMemberCounts(counts)
          })

        // Load grid tasks for this section (cards are placed via bingo_board_cards)
        fetchBoardTasks(data.id).then(tasks => setGridTasks(tasks))
      })
  }, [sectionSlug])

  // Load scans when team is set
  useEffect(() => {
    if (!team) { setScans([]); return }
    supabase.from('bingo_scans').select('*').eq('team_id', team.id)
      .then(({ data }) => { if (data) setScans(data) })
  }, [team])

  // Live scan updates
  useEffect(() => {
    if (!team) return
    const channel = supabase
      .channel(`bingo-join-scans-${team.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_scans', filter: `team_id=eq.${team.id}` }, () => {
        supabase.from('bingo_scans').select('*').eq('team_id', team.id).then(({ data }) => { if (data) setScans(data) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [team])

  // Live section updates (game_started, timer, alarm, board note)
  useEffect(() => {
    if (!section) return
    const channel = supabase
      .channel(`bingo-join-section-${section.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections', filter: `id=eq.${section.id}` }, ({ new: updated }) => {
        setSection(prev => prev ? { ...prev, ...updated } as typeof prev : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [section?.id])

  // iOS Safari suspends realtime WebSockets when the tab is backgrounded or the
  // screen locks, so participants miss the "game started" UPDATE and appear stuck
  // until they refresh. These two effects make the page self-heal without a refresh.

  // 1. Re-sync whenever the page becomes visible / regains focus (e.g. after unlock).
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      if (section?.id) {
        supabase.from('bingo_sections').select('*').eq('id', section.id).single()
          .then(({ data }) => { if (data) setSection(prev => prev ? { ...prev, ...data } as typeof prev : data) })
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
  }, [section?.id, team?.id])

  // 2. While the game hasn't started, poll for the start as a fallback for a dead socket.
  useEffect(() => {
    if (!section || section.game_started) return
    const id = setInterval(() => {
      supabase.from('bingo_sections').select('game_started').eq('id', section.id).single()
        .then(({ data }) => {
          if (data?.game_started) setSection(prev => prev ? { ...prev, game_started: true } : prev)
        })
    }, 4000)
    return () => clearInterval(id)
  }, [section?.id, section?.game_started])

  // 3. While the game is live, poll this team's scans as a socket fallback (iOS),
  //    so teammates' completions still show up if the realtime socket has dropped.
  useEffect(() => {
    if (!team || !section?.game_started) return
    const id = setInterval(() => {
      supabase.from('bingo_scans').select('*').eq('team_id', team.id)
        .then(({ data }) => { if (data) setScans(data) })
    }, 7000)
    return () => clearInterval(id)
  }, [team?.id, section?.game_started])

  // Join a group: create or find the member record, then enter the board
  const joinGroup = async (memberName: string, password: string, teamId: string, role: 'member' | 'observer') => {
    if (!section || !sectionSlug) throw new Error('Section not found')

    // Observers bypass password checks
    if (role !== 'observer') {
      if (!/^\d{4}$/.test(password)) throw new Error('Password must be 4 digits.')
    }

    // Re-fetch team for the latest password state (first-joiner race-safety).
    const { data: teamData, error: teamErr } = await supabase
      .from('bingo_teams').select('*').eq('id', teamId).single()
    if (teamErr || !teamData) throw new Error('Group not found')

    let liveTeam: BingoTeam = teamData
    if (role !== 'observer') {
      // Password must be set by admin in advance.
      if (!teamData.password) {
        throw new Error('This group has not been set up yet. Ask your facilitator.')
      } else if (teamData.password !== password) {
        throw new Error('Wrong team password.')
      }
    }

    // Look up existing member for this section (case-insensitive). Take the
    // earliest row rather than erroring on legacy duplicates — .maybeSingle()
    // throws when >1 row exists, which used to fall through to the insert path
    // below and compound the duplication.
    const { data: existingRows } = await supabase
      .from('bingo_members')
      .select('*')
      .eq('section_id', section.id)
      .ilike('name', memberName)
      .order('created_at', { ascending: true })
      .limit(1)
    const existing = existingRows?.[0] ?? null

    // Enforce 4-member cap only for non-observer joiners (don't block a returning member on their own team)
    const isReturningSameTeam = existing?.team_id === teamId
    if (role === 'member' && !isReturningSameTeam) {
      const { count } = await supabase
        .from('bingo_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('role', 'member')
      if ((count ?? 0) >= MAX_TEAM_MEMBERS) {
        throw new Error(`This team is full (${MAX_TEAM_MEMBERS} / ${MAX_TEAM_MEMBERS}).`)
      }
    }

    let member: BingoMember
    if (existing) {
      const needsUpdate = existing.team_id !== teamId || existing.password !== password || existing.role !== role
      if (needsUpdate) {
        await supabase.from('bingo_members').update({ team_id: teamId, password, role }).eq('id', existing.id)
      }
      member = { ...existing, team_id: teamId, password, role }
    } else {
      const { data: created, error } = await supabase
        .from('bingo_members')
        .insert({ name: memberName, password, team_id: teamId, section_id: section.id, role })
        .select()
        .single()
      if (error) {
        // 23505 = unique violation: another device/tab registered this name first
        // (enforced by the bingo_members (section_id, lower(name)) unique index).
        // Re-fetch that row and update it instead of creating a duplicate.
        if (error.code === '23505') {
          const { data: raced } = await supabase
            .from('bingo_members')
            .select('*')
            .eq('section_id', section.id)
            .ilike('name', memberName)
            .order('created_at', { ascending: true })
            .limit(1)
          const existingRaced = raced?.[0]
          if (!existingRaced) throw error
          await supabase.from('bingo_members')
            .update({ team_id: teamId, password, role }).eq('id', existingRaced.id)
          member = { ...existingRaced, team_id: teamId, password, role }
        } else {
          throw error
        }
      } else {
        member = created
      }
    }

    const liveTeamJson = JSON.stringify(liveTeam)
    localStorage.setItem(MEMBER_ID_KEY(sectionSlug), member.id)
    localStorage.setItem(GLOBAL_MEMBER_ID_KEY, member.id)
    localStorage.setItem(MEMBER_DATA_KEY(sectionSlug), JSON.stringify(member))
    localStorage.setItem(TEAM_ID_KEY(sectionSlug), liveTeam.id)
    localStorage.setItem(TEAM_DATA_KEY(sectionSlug), liveTeamJson)
    localStorage.setItem(GLOBAL_TEAM_ID_KEY, liveTeam.id)
    localStorage.setItem(GLOBAL_TEAM_DATA_KEY, liveTeamJson)
    localStorage.setItem(MEMBER_ROLE_KEY(sectionSlug), role)
    localStorage.setItem(GLOBAL_MEMBER_ROLE_KEY, role)
    setMemberRole(role)
    setGroups(prev => prev.map(g => g.id === liveTeam.id ? liveTeam : g))
    if (role === 'member') {
      setMemberCounts(prev => ({ ...prev, [liveTeam.id]: (prev[liveTeam.id] ?? 0) + (existing ? 0 : 1) }))
    }
    setTeam(liveTeam)
    setPageState('board')
  }

  const leaveTeam = () => {
    if (sectionSlug) {
      localStorage.removeItem(MEMBER_ID_KEY(sectionSlug))
      localStorage.removeItem(MEMBER_DATA_KEY(sectionSlug))
      localStorage.removeItem(TEAM_ID_KEY(sectionSlug))
      localStorage.removeItem(TEAM_DATA_KEY(sectionSlug))
      localStorage.removeItem(MEMBER_ROLE_KEY(sectionSlug))
    }
    localStorage.removeItem(GLOBAL_TEAM_ID_KEY)
    localStorage.removeItem(GLOBAL_TEAM_DATA_KEY)
    localStorage.removeItem(GLOBAL_MEMBER_ROLE_KEY)
    setTeam(null)
    setPageState('join')
  }

  const timeUpOverlay = <TimeUpAlarm settings={section} />

  if (pageState === 'loading') {
    return (
      <>
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-gray-400 text-xl font-bold animate-pulse">Loading...</div>
        </div>
        {timeUpOverlay}
      </>
    )
  }

  if (pageState === 'not-found') {
    return (
      <>
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
          <ParticleBackground />
          <div className="relative z-10 text-center">
            <div className="text-6xl mb-4">😵</div>
            <h1 className="text-3xl font-black text-white mb-2">Game Not Found</h1>
            <p className="text-gray-400">
              The link <span className="text-teal-400 font-mono">/play/{sectionSlug}</span> doesn't match any active game.
            </p>
            <p className="text-gray-500 text-sm mt-2">Check the QR code or ask your facilitator for the correct link.</p>
          </div>
        </div>
        {timeUpOverlay}
      </>
    )
  }

  if (pageState === 'join' && section) {
    return (
      <>
        <JoinScreen sectionName={section.name} groups={groups} memberCounts={memberCounts} onJoinGroup={joinGroup} isObserver={isObserver} />
        {timeUpOverlay}
      </>
    )
  }

  if (pageState === 'board' && team && section) {
    if (!section.game_started) {
      return (
        <>
          <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
            <ParticleBackground />
            <div className="relative z-10 text-center animate-slide-up">
              <div className="text-6xl mb-5">⏳</div>
              <h1 className="text-4xl font-black text-white tracking-tight mb-2">Game Not Started Yet</h1>
              <p className="text-teal-400 font-bold text-base mb-1">{section.name}</p>
              <p className="text-gray-400 text-sm mb-8">
                You're in <span className="text-white font-bold">{team.name}</span>. Hang tight — the game will begin soon!
              </p>
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-600 text-xs mt-2">Waiting for facilitator to start the game...</p>
              </div>
              <button
                onClick={leaveTeam}
                className="mt-10 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Switch Team
              </button>
            </div>
          </div>
          {timeUpOverlay}
        </>
      )
    }

    return (
      <>
        <BoardScreen
          team={team}
          sectionName={section.name}
          sectionSlug={sectionSlug!}
          memberRole={memberRole}
          gridTasks={gridTasks}
          scans={scans}
          settings={section}
          boardNote={section.board_note ?? ''}
          boardNoteEvery={section.board_note_every ?? 0}
          tileDisplay={normalizeTileDisplay(section.tile_display)}
          onLeave={leaveTeam}
        />
        {/* Another team can challenge us at any moment — the banner has to reach
            players wherever they are on the board, not only inside a card. */}
        <IncomingDuelBanner team={team} sectionId={section.id} />
        {timeUpOverlay}
      </>
    )
  }

  return null
}
