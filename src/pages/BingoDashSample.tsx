import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks, tasksForFace } from '../lib/boardCards'
import { activeFaces, faceName, faceColor, normaliseFaceCount } from '../lib/cubeFaces'
import { buildBingoSlots, completedBingoLines } from '../lib/bingoLines'
import { useSampleRemote, makeRemoteCode, type RemoteCommand, type RemoteState, type SampleView, type DetailStep } from '../hooks/useSampleRemote'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { TaskLinkButtons } from '../components/TaskLinkButtons'
import { DemoBundleCard } from '../components/DemoBundleCard'
import { AitbMissionModule } from '../components/AitbMissionModule'
import { BonusBar } from '../components/AitbBonusBar'
import { aitbByName, aitbToolUrl, aitbToolCaption, aitbWithTimer, AITB_POINTS } from '../lib/aitbActivities'
import { InstructionPage } from '../components/InstructionPage'
import { PageNavigator } from '../components/PageNavigator'
import { SwipeablePages } from '../components/SwipeablePages'
import { ParticleBackground } from '../components/ParticleBackground'
import { TileFace } from '../components/BingoTileFace'
import { SpeedEditTargets } from '../components/SpeedEditTargets'
import { SampleTreeApp } from '../components/SampleTreeApp'
import { SignSpliceCard } from '../components/SignSpliceCard'
import { BreakoutHuntCard } from '../components/BreakoutHuntCard'
import { CardDrawPanel } from '../components/CardDrawPanel'
import { useCardDrawConfig } from '../hooks/useCardDrawConfig'
import { drawHeading } from '../lib/cardDraw'
import { RetroGamesSample } from '../components/RetroGamesSample'
import { normalizeTileDisplay, type TileDisplay } from '../lib/bingoTileDisplay'
import { normalizeUrl } from '../lib/normalizeUrl'
import type { BingoSection, BingoTask } from '../types/database'

// ════════════════════════════════════════════════════════════════════════════
// SAMPLE BINGO — a self-contained, sandboxed Participant View for demos/pitches.
//
// • Reads REAL boards/tasks created in the admin (so it always reflects live
//   content), but every action — joining, scanning, marshal password, photo,
//   answers, BINGO — runs purely in local React state. Nothing is written to
//   Supabase, so it can never pollute a live event. "Reset demo" wipes it.
// • A board switcher lets the presenter jump between any admin-created board.
// • The participant "login" (group + password) is pre-filled with a sample
//   password so people can see how the join flow looks without real creds.
// ════════════════════════════════════════════════════════════════════════════

const SAMPLE_TEAM_PASSWORD = '1234'   // demo "login" password (pre-filled on the join screen)
// Where the demo remembers which tiles the presenter lit, per board.
const GLOW_KEY = 'bingo_sample_glow'
const DEMO_MARSHAL_PASSWORD = '4321'  // fixed demo marshal password — deliberately NOT the real
                                      // per-board marshal_password, so this public page never
                                      // leaks live-event secrets that could be used to cheat.
const DEMO_GROUPS = ['Sample Team Alpha', 'Sample Team Bravo', 'Sample Team Charlie', 'Sample Team Delta']

const GRID_SIZE = 25 // 5×5
const BINGO_WORD = 'BINGO'

// All 12 possible bingo lines: 5 rows + 5 cols + 2 diagonals
const BINGO_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
]

type TileStatus = 'locked' | 'scanned' | 'completed'
type ScanStatus = 'scanned' | 'completed'
type ScanState = Record<string, ScanStatus>

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// Build a sparse 25-slot array: each task lands at slot = sort_order (0-24).
// Overflowing/colliding rows drop into the first empty slot (mirrors the board).
function buildSlots(gridTasks: BingoTask[]): (BingoTask | null)[] {
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
}

// ── Demo top bar (board switcher + cheat sheet + reset) ──────────────────────

function DemoBar({
  sections,
  selectedId,
  onSelect,
  marshalPassword,
  onReset,
  onQuickWin,
  showQuickWin,
  onRemote,
  remoteActive,
  onTryIt,
  view,
  onToggleView,
  showViewToggle,
  backHref,
  backLabel,
}: {
  sections: BingoSection[]
  selectedId: string | null
  onSelect: (id: string) => void
  marshalPassword: string
  onReset: () => void
  onQuickWin: () => void
  showQuickWin: boolean
  onRemote: () => void
  remoteActive: boolean
  onTryIt: () => void
  view: SampleView
  onToggleView: () => void
  showViewToggle: boolean
  backHref: string
  backLabel: string
}) {
  return (
    <div className="sticky top-0 z-40 w-full bg-gray-950/95 backdrop-blur border-b border-purple-500/30">
      <div className="max-w-5xl mx-auto px-2.5 py-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        {/* Row 1: badge + board picker (picker fills the row on mobile) */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-purple-500 text-black text-[11px] font-black tracking-wider whitespace-nowrap">
            🎬 SAMPLE
          </span>
          <select
            value={selectedId ?? ''}
            onChange={e => onSelect(e.target.value)}
            aria-label="Choose board"
            className="flex-1 min-w-0 sm:flex-none sm:max-w-[12rem] bg-white/10 text-white text-xs font-bold rounded-lg px-2.5 py-2 border border-white/15 focus:outline-none focus:border-purple-400"
          >
            {sections.length === 0 && <option value="">No boards found</option>}
            {sections.map(s => (
              <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
            ))}
          </select>
        </div>

        {/* Row 2: password cheat-sheet pills + actions (icon-only on phones) */}
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-white/5 text-gray-300 border border-white/10 text-[11px] font-bold whitespace-nowrap">
            🔑 <span className="text-purple-300">{SAMPLE_TEAM_PASSWORD}</span>
          </span>
          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-white/5 text-gray-300 border border-white/10 text-[11px] font-bold whitespace-nowrap">
            👮 <span className="text-yellow-300">{marshalPassword}</span>
          </span>
          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            {showViewToggle && (
              <button
                onClick={onToggleView}
                title={view === 'board' ? 'Show the scoreboard' : 'Show the bingo board'}
                className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-violet-500/20 text-violet-200 border border-violet-400/40 text-xs font-black hover:bg-violet-500/30 transition-colors whitespace-nowrap"
              >
                {view === 'board' ? '📊' : '🎯'}<span className="hidden sm:inline"> {view === 'board' ? 'Scoreboard' : 'Board'}</span>
              </button>
            )}
            <button
              onClick={onRemote}
              title="Remote control — drive this screen from your phone"
              className={`flex-shrink-0 px-2.5 py-2 rounded-lg text-xs font-black border transition-colors whitespace-nowrap ${
                remoteActive
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50 hover:bg-emerald-500/30'
                  : 'bg-white/10 text-gray-200 border-white/15 hover:bg-white/20'
              }`}
            >
              📡<span className="hidden sm:inline"> {remoteActive ? 'Paired' : 'Remote'}</span>
            </button>
            <button
              onClick={onTryIt}
              title="Let the audience try the game on their own phones"
              className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-xs font-black hover:bg-white/20 transition-colors whitespace-nowrap"
            >
              📱<span className="hidden sm:inline"> Try it yourself</span>
            </button>
            {showQuickWin && (
              <button
                onClick={onQuickWin}
                title="Quick BINGO — instantly complete one line"
                className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-yellow-400/20 text-yellow-200 border border-yellow-400/40 text-xs font-black hover:bg-yellow-400/30 transition-colors whitespace-nowrap"
              >
                ⚡<span className="hidden sm:inline"> BINGO</span>
              </button>
            )}
            <button
              onClick={onReset}
              title="Reset demo"
              className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-xs font-bold hover:bg-white/20 transition-colors whitespace-nowrap"
            >
              ↺<span className="hidden sm:inline"> Reset</span>
            </button>
            <Link
              to={backHref}
              title={backLabel}
              className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-xs font-bold hover:bg-white/20 transition-colors whitespace-nowrap"
            >
              ←<span className="hidden sm:inline"> {backLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Join Screen (sandbox: demo groups + pre-filled sample password) ───────────

function JoinScreen({ onJoin }: { onJoin: (groupName: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const groups = DEMO_GROUPS
    .filter(g => g.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const pick = (name: string) => {
    setSelected(name)
    setPassword(SAMPLE_TEAM_PASSWORD) // pre-fill the sample password for the demo
    setError('')
    setStep(2)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (password !== SAMPLE_TEAM_PASSWORD) { setError('Wrong password (demo password is 1234).'); return }
    onJoin(selected)
  }

  return (
    <div className="min-h-[80vh] bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4 py-8">
      <ParticleBackground />

      <div className="relative z-10 text-center mb-8 animate-slide-up">
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
          />

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            {groups.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No groups match your search.</p>
            ) : (
              groups.map(group => (
                <button
                  key={group}
                  onClick={() => pick(group)}
                  className="w-full px-5 py-4 rounded-2xl border-2 text-left font-bold text-lg transition-all duration-150 border-gray-200 text-gray-800 hover:border-purple-400 hover:bg-purple-50 active:scale-[0.98]"
                >
                  {group}
                </button>
              ))
            )}
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-4">
            🧪 This is a sample. Pick any group to continue.
          </p>
        </div>
      )}

      {step === 2 && selected && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <button
            onClick={() => { setStep(1); setError('') }}
            className="text-sm text-purple-500 font-bold mb-4 hover:text-purple-700 transition-colors"
          >
            &larr; Back
          </button>
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Enter Password</h2>
          <p className="text-gray-400 text-center text-sm mb-1">
            Group: <span className="text-purple-500 font-bold">{selected}</span>
          </p>
          <p className="text-gray-400 text-center text-xs mb-5">
            Enter the 4-digit password given to your group.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={password}
              onChange={e => { setPassword(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
              placeholder="• • • •"
              className="w-full px-5 py-4 rounded-2xl border-2 text-4xl font-black focus:outline-none transition-colors text-center tracking-[0.6em]"
              style={{ borderColor: password.length === 4 ? '#a855f7' : '#e5e7eb' }}
              maxLength={4}
            />

            <div className="rounded-xl bg-purple-50 border border-purple-200 px-3 py-2 text-center">
              <p className="text-[11px] text-purple-500 font-bold">
                🧪 Sample password <span className="font-black">{SAMPLE_TEAM_PASSWORD}</span> is pre-filled for this demo.
              </p>
            </div>

            {error && (
              <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <span>🚫</span>
                <p className="text-red-600 font-bold text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={password.length !== 4}
              className="w-full py-4 rounded-2xl text-white font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95 mt-1"
              style={{ backgroundColor: '#a855f7', boxShadow: '0 8px 24px #a855f744' }}
            >
              Join Group →
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Bingo Tile ────────────────────────────────────────────────────────────────

function BingoTile({
  task, status, isInBingoLine, display, glowing, onClick,
}: {
  task: BingoTask
  status: TileStatus
  isInBingoLine: boolean
  display: TileDisplay
  /** Demo only — a tile the presenter has lit up to draw the room's eye. */
  glowing: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={task.title}
      aria-label={task.title}
      className={`bingo-glow relative rounded-xl overflow-hidden flex items-center justify-center aspect-square transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none${glowing ? ' bingo-glow-on' : ''}`}
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
      {/* The lit ring. Drawn as an overlay rather than a border so it sits
          inside the tile's rounded corners and never shifts the layout. */}
      {glowing && (
        <div className="absolute inset-0 rounded-xl pointer-events-none z-20"
          style={{ boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.92), inset 0 0 14px rgba(255,255,255,0.45)' }} />
      )}

      {isInBingoLine && status === 'completed' && (
        <div className="absolute inset-0 bg-yellow-300/10 z-0 pointer-events-none" />
      )}

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

      {status === 'scanned' && (
        <div className="absolute top-1.5 right-1.5 z-10 w-2.5 h-2.5 rounded-full border-2 border-white/80" />
      )}

      {/* Icon or words — whichever this board is set to in the admin */}
      <TileFace task={task} display={display} />

      {/* Points chip — top-left corner, clear of the title and the top-right scanned ring */}
      {(task.points ?? 0) > 0 && (
        <div className="absolute top-1 left-1 z-10 bg-black/45 text-white/90 text-[8px] font-black rounded px-1 leading-tight">
          {task.points}
        </div>
      )}
    </button>
  )
}

function EmptyTile() {
  return <div className="rounded-xl aspect-square bg-white/5 border border-white/10" />
}

// ── Bingo Popup ───────────────────────────────────────────────────────────────

function BingoPopup({ letters, onDismiss }: { letters: string; onDismiss: () => void }) {
  const isFull = letters === 'BINGO'
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center cursor-pointer select-none"
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
          <p className="text-yellow-400 font-black text-xl mt-4 tracking-widest uppercase animate-pulse">🎉 You got BINGO! 🎉</p>
        ) : (
          <p className="text-purple-300 font-bold text-base mt-3 tracking-wide">Bingo line complete!</p>
        )}

        <p className="text-white/30 text-sm mt-8">Tap to continue</p>
      </div>
    </div>
  )
}

// ── Timer display ─────────────────────────────────────────────────────────────

function TimerDisplay({ settings }: { settings: BingoSection | null }) {
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

// ── Board Screen (sandbox) ────────────────────────────────────────────────────

function BoardScreen({
  teamName, gridTasks, scanState, section, glowSlots, glowMode,
  onToggleGlow, onClearGlow, onToggleGlowMode, onOpenTask, onSwitchTeam,
}: {
  teamName: string
  gridTasks: BingoTask[]
  scanState: ScanState
  section: BingoSection | null
  /** Slots lit on THIS board. Held by the page so a board switch keeps them. */
  glowSlots: Set<number>
  glowMode: boolean
  onToggleGlow: (slot: number) => void
  onClearGlow: () => void
  onToggleGlowMode: () => void
  onOpenTask: (task: BingoTask) => void
  onSwitchTeam: () => void
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [popupLetters, setPopupLetters] = useState<string | null>(null)
  const [popupQueue, setPopupQueue] = useState<string[]>([])
  const celebratedLinesRef = useRef<Set<number> | null>(null)

  const boardNote = section?.board_note ?? ''
  const boardNoteEvery = section?.board_note_every ?? 0
  const tileDisplay = normalizeTileDisplay(section?.tile_display)

  // Which cube face this player is looking at — matches the real player view
  // (Front/Right/Back/Left/Top/Bottom); a one-face board never shows the tabs.
  const [face, setFace] = useState(0)
  const faceCount = normaliseFaceCount(section?.face_count)
  const visibleTasks = faceCount > 1 ? tasksForFace(gridTasks, face) : gridTasks

  const getStatus = (taskId: string): TileStatus => {
    const st = scanState[taskId]
    if (!st) return 'locked'
    return st === 'completed' ? 'completed' : 'scanned'
  }

  const gridTaskIds = new Set(visibleTasks.map(t => t.id))
  const completedCount = gridTasks.filter(t => scanState[t.id] === 'completed' && gridTaskIds.has(t.id)).length
  const slots = buildSlots(visibleTasks)

  const completedLineIndices = BINGO_LINES.reduce((acc, line, i) => {
    const allDone = line.every(slotIdx => {
      const task = slots[slotIdx]
      return task && getStatus(task.id) === 'completed'
    })
    if (allDone) acc.add(i)
    return acc
  }, new Set<number>())

  const bingoSlots = new Set<number>()
  completedLineIndices.forEach(lineIdx => { BINGO_LINES[lineIdx].forEach(slotIdx => bingoSlots.add(slotIdx)) })

  const lettersEarned = BINGO_WORD.slice(0, Math.min(completedLineIndices.size, 5))

  const completedLinesKey = [...completedLineIndices].sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (celebratedLinesRef.current === null) {
      celebratedLinesRef.current = new Set(completedLineIndices)
      return
    }
    const newLines: number[] = []
    completedLineIndices.forEach(idx => { if (!celebratedLinesRef.current!.has(idx)) newLines.push(idx) })
    if (newLines.length === 0) return
    const baseSize = celebratedLinesRef.current.size
    newLines.forEach(idx => celebratedLinesRef.current!.add(idx))
    const queued = newLines.map((_, i) => BINGO_WORD.slice(0, Math.min(baseSize + i + 1, 5)))
    setPopupQueue(prev => [...prev, ...queued])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedLinesKey])

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
    <div className="min-h-[80vh] bg-gray-950 relative overflow-x-hidden">
      <ParticleBackground />

      {popupLetters && <BingoPopup letters={popupLetters} onDismiss={() => setPopupLetters(null)} />}

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="board-col flex items-start justify-between gap-3">
          <div>
            <p className="text-purple-400 text-[10px] font-black uppercase tracking-widest">Bingo Dash</p>
            <h1 className="text-white text-xl font-black tracking-tight leading-tight">{teamName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-green-400 text-xs font-bold">{completedCount}/{visibleTasks.length} completed</span>
              {lettersEarned && (
                <span className="text-purple-300 text-xs font-black tracking-widest">{lettersEarned}!</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
            <TimerDisplay settings={section} />
            {/* Presenter control: pick the tiles to light up while talking the
                room through the board. Demo only — nothing is saved. */}
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleGlowMode}
                title="Tap tiles to light them up"
                className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
                  glowMode
                    ? 'bg-purple-500 text-white border-purple-400'
                    : 'text-gray-500 border-white/15 hover:text-gray-300'}`}
              >
                ✨ Glow{glowMode ? ' · tap tiles' : ''}
              </button>
              {glowSlots.size > 0 && (
                <button onClick={onClearGlow}
                  className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              )}
            </div>
            {!showLeaveConfirm ? (
              <button onClick={() => setShowLeaveConfirm(true)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Switch Team
              </button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <p className="text-xs text-gray-400">Switch?</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowLeaveConfirm(false)} className="text-xs text-gray-500">Cancel</button>
                  <button onClick={onSwitchTeam} className="text-xs text-red-400 font-bold">Yes</button>
                </div>
              </div>
            )}
          </div>
        </div>

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

      <main className="relative z-10 px-3 pb-8">
        <div className="board-col">
          {/* Face tabs. Only rendered on a cube board, so a normal game is
              visually unchanged — mirrors the real player view exactly. */}
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
              <p className="font-bold">No grid set up on this board yet</p>
              <p className="text-sm mt-1">Pick another board above, or add cards in the admin</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {slots.map((task, i) =>
                task ? (
                  <BingoTile
                    key={`${i}-${task.id}`}
                    task={task}
                    status={getStatus(task.id)}
                    isInBingoLine={bingoSlots.has(i)}
                    display={tileDisplay}
                    glowing={glowSlots.has(i)}
                    onClick={() => {
                      if (glowMode) onToggleGlow(i)
                      else onOpenTask(task)
                    }}
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

// ── Task Detail (sandbox overlay) ─────────────────────────────────────────────

// Imperative handle so the phone remote can drive the open tile's flow.
export type SampleTaskDetailHandle = {
  start: () => void
  nextPage: () => void
  prevPage: () => void
  fillMarshal: () => void
  submitComplete: () => void
  scroll: (direction: 'up' | 'down') => void
}

const SampleTaskDetail = forwardRef<SampleTaskDetailHandle, {
  task: BingoTask
  teamName: string
  marshalPassword: string
  completed: boolean
  onComplete: () => void
  onUncomplete: () => void
  onClose: () => void
  onStep?: (s: DetailStep) => void
}>(function SampleTaskDetail({
  task, teamName, marshalPassword, completed, onComplete, onUncomplete, onClose, onStep,
}, ref) {
  const { pages } = useBingoTaskPages(task.id)
  const { photos } = useBingoTaskPhotos(task.id)
  const { links } = useTaskLinks(task.id, 'bingo_task_links')

  const [showSplash, setShowSplash] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [marshalInput, setMarshalInput] = useState('')
  const [marshalError, setMarshalError] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoSubmitted, setPhotoSubmitted] = useState(false)
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const letterRefs = useRef<(HTMLInputElement | null)[][]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // A standalone AITB card (not opened via the bundle tile) still carries the
  // same interactive module — the demo has no per-team progress row for it,
  // so the result just lives in this component's own state.
  const { config: drawConfig } = useCardDrawConfig(task.id)
  const aitbBase = aitbByName(task.title)
  // A card can rescale or switch off the AITB bonus clock — see
  // supabase/020_aitb_card_timer.sql.
  const aitbActivity = aitbBase ? aitbWithTimer(aitbBase, task.aitb_timer_minutes) : undefined
  const aitbTimerOn = task.aitb_timer_enabled !== false
  const [aitbWords, setAitbWords] = useState<string[]>([])
  const [aitbStepsDone, setAitbStepsDone] = useState<number[]>([])
  // The demo has no check-in row to read a start time from, so the timer
  // just starts whenever this card is first opened.
  const [aitbStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!aitbActivity || completed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [aitbActivity, completed])

  const toggleAitbStep = (i: number) => {
    if (completed) return
    setAitbStepsDone(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]))
  }

  const answerRows = task.task_type === 'answer' && task.answer_text
    ? task.answer_text.split('\n').map(r => r.trim()).filter(Boolean)
    : []

  const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase()
  const answerMatches = answerRows.length > 0 && answerRows.every((row, i) => normalize(answerInputs[i] ?? '') === normalize(row))

  // Init answer inputs once per task
  useEffect(() => {
    if (task.task_type === 'answer' && task.answer_text) {
      const rows = task.answer_text.split('\n').map(r => r.trim()).filter(Boolean)
      setAnswerInputs(rows.map(() => ''))
    }
  }, [task.id, task.task_type, task.answer_text])

  // Auto-complete answer tasks when all rows match
  useEffect(() => {
    if (answerMatches && !completed) onComplete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerMatches])

  // Clean up the local object URL preview
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  const focusLetter = (rowIdx: number, charIdx: number) => letterRefs.current[rowIdx]?.[charIdx]?.focus()

  const handlePhotoSelect = (file: File) => {
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
    setPhotoSubmitted(true)
  }

  // Same rule as the on-screen "Complete Challenge" button, reused by the remote.
  const isMarshalTask = task.task_type === 'standard' && !!task.require_marshal
  const marshalFilled = marshalInput.trim() === marshalPassword
  const doComplete = () => {
    if (isMarshalTask && !marshalFilled) { setMarshalError('Wrong marshal password.'); return }
    onComplete()
  }

  // Expose the flow to the phone remote (SampleProjector routes commands here).
  useImperativeHandle(ref, () => ({
    start: () => setShowSplash(false),
    nextPage: () => setCurrentPage(p => Math.min(Math.max(0, pages.length - 1), p + 1)),
    prevPage: () => setCurrentPage(p => Math.max(0, p - 1)),
    fillMarshal: () => { setMarshalInput(marshalPassword); setMarshalError('') },
    submitComplete: () => doComplete(),
    scroll: direction => scrollRef.current?.scrollBy({ top: direction === 'down' ? 400 : -400, behavior: 'smooth' }),
  }))

  // Report the current step up so the controller renders the right buttons.
  useEffect(() => {
    onStep?.({
      phase: showSplash ? 'splash' : 'main',
      pageIndex: currentPage,
      pageCount: pages.length,
      isMarshalTask,
      marshalFilled,
    })
  }, [onStep, showSplash, currentPage, pages.length, isMarshalTask, marshalFilled])

  // ── Splash ──
  if (showSplash) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white overflow-hidden"
        style={{ backgroundColor: task.hex_code }}
        onClick={() => setShowSplash(false)}
      >
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 text-center px-8 animate-bounce-in">
          <div className="text-6xl mb-6">🎯</div>
          <p className="text-sm font-bold opacity-70 uppercase tracking-[0.2em] mb-2">{task.color} Challenge</p>
          <h1 className="text-5xl font-black tracking-tight mb-4 leading-tight">{task.title}</h1>
          <div className="w-16 h-1 bg-white/40 rounded-full mx-auto mb-6" />
          <p className="text-lg opacity-80 font-medium mb-2">Team: {teamName}</p>
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
    )
  }

  // AITB cards carry the wheel/deal modules, which want the room a phone
  // column doesn't have — widening just for these lets a projector (wide,
  // landscape) show them at a useful size while a phone still gets the
  // narrower column at its own breakpoint, purely from viewport width.
  // Every card widens with the viewport, not just AITB — see BingoDashParticipant.
  const containerMaxW = aitbActivity
    ? 'max-w-lg sm:max-w-2xl lg:max-w-4xl'
    : 'max-w-lg sm:max-w-xl lg:max-w-3xl'

  // ── Main view ──
  return (
    <div
      ref={scrollRef}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: `color-mix(in srgb, ${task.hex_code} 50%, #0a0a0a)` }}
    >
      <ParticleBackground hexCode={task.hex_code} />

      <header className="px-6 py-5 text-white relative z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundColor: task.hex_code, opacity: 0.35 }} />
        <div className="absolute inset-0 bg-black/30" />
        <div className={`${containerMaxW} mx-auto relative z-10 flex items-start justify-between gap-4`}>
          <div className="flex items-start gap-3">
            <button
              onClick={onClose}
              className="mt-1 flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white/80 hover:text-white text-xs font-bold transition-colors"
            >
              ← Board
            </button>
            <div>
              <p className="text-sm font-bold opacity-80 uppercase tracking-wider">Team: {teamName}</p>
              <h1 className="text-3xl font-black tracking-tight">{task.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm opacity-70 uppercase tracking-wider">{task.color} Challenge</span>
                {(task.points ?? 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white/20 text-white">{task.points} pts</span>
                )}
              </div>
            </div>
          </div>
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
                  <button onClick={() => setCarouselIdx(i => (i - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm active:scale-90 transition-transform">‹</button>
                  <button onClick={() => setCarouselIdx(i => (i + 1) % photos.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg font-bold backdrop-blur-sm active:scale-90 transition-transform">›</button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {photos.map((_, i) => (
                      <button key={i} onClick={() => setCarouselIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i === carouselIdx ? 'bg-white scale-125' : 'bg-white/50'}`} />
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
            <a href={normalizeUrl(task.maps_url)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-black text-sm text-white border-2 border-white/30 bg-white/10 hover:bg-white/20 active:scale-95 transition-all">
              📍 {task.maps_label?.trim() || 'Open in Maps'}
            </a>
          </div>
        )}

        {/* AI Team Building brief — a live bonus timer, the real description
            + skill tag, then the module and a tickable mission checklist
            instead of swipeable instruction pages. */}
        {aitbActivity ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-1 rounded-lg text-xs font-black uppercase" style={{ background: `${aitbActivity.color}22`, color: aitbActivity.color }}>
                {aitbActivity.difficulty}
              </span>
              {completed && (
                <span className="px-2 py-1 rounded-lg text-xs font-black bg-emerald-400/20 text-emerald-300">✓ Completed</span>
              )}
            </div>
            {aitbTimerOn && <BonusBar elapsedMs={completed ? 0 : now - aitbStartedAt} activity={aitbActivity} completed={completed} bankedBonus={0} />}
            <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
              <h2 className="text-white font-black text-lg mb-2">{aitbActivity.tagline}</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{aitbActivity.description}</p>
              <p className="text-gray-500 text-xs font-black uppercase tracking-wide mt-3">{aitbActivity.skillTag}</p>
            </div>
          </>
        ) : pages.length > 0 ? (
          <SwipeablePages currentPage={currentPage} total={pages.length} onChange={setCurrentPage}>
            <InstructionPage page={pages[currentPage]} hexCode={task.hex_code} />
            <PageNavigator
              current={currentPage}
              total={pages.length}
              onPrev={() => setCurrentPage(p => Math.max(0, p - 1))}
              onNext={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
              hexCode={task.hex_code}
            />
          </SwipeablePages>
        ) : (
          <div className="text-center py-12 text-gray-400">No instructions available for this challenge yet.</div>
        )}

        {/* Interactive module (Nerf cups, roulette wheels, card deal, retro
            tracker), a tickable mission checklist, and AI tool links — all
            apply to every AITB activity, whether or not it carries a module. */}
        {/* Driven by the card's own draw configuration, not by whether the
            card happens to be an AI Team Building activity. */}
        {drawConfig && (
          <div className="mb-8 mt-8 animate-slide-up">
            <AitbMissionModule activity={aitbActivity} color={task.hex_code} storeId={task.id}
              drawConfig={drawConfig} savedWords={aitbWords}
              disabled={completed} onSave={setAitbWords} progressId={`demo-standalone-${task.id}`} />
          </div>
        )}

        {aitbActivity && (
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
                const ticked = aitbStepsDone.includes(i)
                return (
                  <button key={i} onClick={() => toggleAitbStep(i)} disabled={completed}
                    className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
                    style={{
                      background: ticked ? `${aitbActivity.color}1e` : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${ticked ? aitbActivity.color : 'rgba(255,255,255,0.1)'}`,
                      opacity: completed && !ticked ? 0.6 : 1,
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
              {(task.draw_count ?? 0) > 0 && (task.draw_style === 'list' || !task.draw_style) && (
                <CardDrawPanel
                  demo
                  teamId="demo"
                  taskId={task.id}
                  count={task.draw_count!}
                  heading={drawHeading(task.title, task.draw_count!)}
                />
              )}

        {/* Helpful links */}
        {links.length > 0 && (
          <div className="mt-8 animate-slide-up">
            <TaskLinkButtons links={links} hexCode={task.hex_code} heading="Use these links to complete your tasks" />
          </div>
        )}

        {/* Complete Activity */}
        <div className="mt-8 animate-slide-up">
          {task.is_bundle ? (
            <>
              <DemoBundleCard task={task} marshalPassword={marshalPassword} />
              <button
                onClick={onClose}
                className="mt-4 w-full py-3 rounded-2xl text-white/70 font-bold border border-white/15 hover:bg-white/5 transition-colors"
              >
                ← Back to Board
              </button>
            </>
          ) : completed ? (
            <div className="text-center">
              <div className="p-6 rounded-2xl border-2" style={{ backgroundColor: `${task.hex_code}25`, borderColor: `${task.hex_code}66` }}>
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-2xl font-black mb-1 text-white">Challenge Complete!</p>
                <p className="text-white/60 text-sm font-medium">Great job, {teamName}!</p>
                <button
                  onClick={onClose}
                  className="mt-5 w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                  style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                >
                  ← Back to Board
                </button>
              </div>
              <button
                onClick={() => { onUncomplete(); if (task.task_type === 'answer') setAnswerInputs(answerRows.map(() => '')) }}
                className="mt-3 px-4 py-2 text-sm text-white/40 hover:text-red-400 transition-colors"
              >
                Undo completion
              </button>
            </div>
          ) : (
            <>
              <div
                className="rounded-3xl p-5 border-2 animate-pulse-border"
                style={{
                  borderColor: `${task.hex_code}99`,
                  backgroundColor: `${task.hex_code}18`,
                  boxShadow: `0 0 24px ${task.hex_code}44, inset 0 0 24px ${task.hex_code}11`,
                }}
              >
                {/* Sign Splice Title. The demo has no real team row, so the
                    card runs entirely in memory — fully playable, but it
                    forgets when the page reloads. */}
                {/* Breakout Hunt — in-memory on the demo board. */}
                {task.task_type === 'breakout_hunt' && (
                  <BreakoutHuntCard demo teamId="demo" taskId={task.id} />
                )}

                {task.task_type === 'sign_splice' && (
                  <SignSpliceCard
                    demo
                    teamId="demo"
                    taskId={task.id}
                    shopInput={task.sign_splice_shop_input ?? 'optional'}
                    lotInput={task.sign_splice_lot_input ?? 'optional'}
                    minLetters={task.sign_splice_min_letters}
                    maxLetters={task.sign_splice_max_letters}
                    allowSpaces={task.sign_splice_allow_spaces}
                    allowNumbers={task.sign_splice_allow_numbers}
                    minConfidence={task.sign_splice_min_confidence}
                  />
                )}

                {/* Standard: Marshal password + Complete */}
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
                          {marshalError && <p className="text-red-400 text-xs font-bold text-center mt-2">{marshalError}</p>}
                          <p className="text-white/40 text-[11px] text-center mt-2">🧪 Demo marshal password: <span className="font-black text-yellow-300">{marshalPassword}</span></p>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (task.require_marshal && marshalInput.trim() !== marshalPassword) {
                          setMarshalError('Wrong marshal password.')
                          return
                        }
                        onComplete()
                      }}
                      className="w-full py-4 rounded-2xl text-white text-xl font-black uppercase tracking-wider transition-all active:scale-95"
                      style={{ backgroundColor: task.hex_code, boxShadow: `0 6px 0 ${task.hex_code}88, 0 8px 20px ${task.hex_code}44` }}
                    >
                      Complete Challenge ✅
                    </button>
                  </>
                )}

                {/* Photo: submit → marshal approve (demo) */}
                {task.task_type === 'photo' && (
                  <>
                    <p className="text-white font-black text-lg text-center mb-4">📸 Submit Your Photo</p>
                    <p className="text-white/50 text-sm text-center mb-5">A marshal will review and approve your submission.</p>
                    {photoSubmitted ? (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                        {photoPreview && <img src={photoPreview} alt="submission" className="w-full max-h-56 object-cover rounded-xl mb-3" />}
                        <div className="text-3xl mb-2">⏳</div>
                        <p className="text-green-300 font-black">Photo submitted!</p>
                        <p className="text-green-300/60 text-sm mt-1 mb-3">Waiting for marshal review</p>
                        <button
                          onClick={onComplete}
                          className="w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                          style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                        >
                          👮 Approve as marshal (demo)
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-3 w-full py-6 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm cursor-pointer hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all">
                        <span className="text-4xl">📷</span>
                        <span>Tap to take or upload a photo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handlePhotoSelect(f) }} />
                      </label>
                    )}
                  </>
                )}

                {/* Answer: letter boxes */}
                {task.task_type === 'answer' && (
                  <>
                    {task.answer_question && (
                      <p className="text-white font-black text-lg mb-4 text-center leading-snug">{task.answer_question}</p>
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
                              <label className="text-white/50 text-xs font-bold uppercase tracking-wider">Word {rowIdx + 1}</label>
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
                                      rowCorrect ? 'border-green-400 bg-green-400/20 text-green-300'
                                        : charCorrect ? 'border-green-400/60 bg-green-400/10 text-green-300'
                                        : charWrong ? 'border-red-400/60 bg-red-400/10 text-red-300'
                                        : 'border-white/30 bg-black/30 text-white'
                                    }`}
                                    style={{ caretColor: 'transparent' }}
                                  />
                                )
                              })}
                            </div>
                            {rowCorrect && <span className="text-green-400 text-xs font-bold mt-0.5">✓ Correct!</span>}
                          </div>
                        )
                      })}
                    </div>
                    {!answerMatches && <p className="text-white/40 text-xs text-center mt-4">Fill in the letters above to complete</p>}
                  </>
                )}

                <button
                  onClick={onClose}
                  className="mt-5 w-full py-3 rounded-2xl text-white/70 font-bold text-sm uppercase tracking-wider border border-white/20 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                >
                  ← Back to Board
                </button>
              </div>

              {/* Optional evidence photo for non-photo tasks */}
              {task.task_type !== 'photo' && (
                <div className="mt-4 rounded-3xl p-5 border-2 border-white/15 bg-black/30">
                  <p className="text-white font-black text-base text-center mb-1">📸 Optional Photo</p>
                  <p className="text-white/50 text-xs text-center mb-4">Attach an image as evidence — your marshal will review it.</p>
                  {photoSubmitted ? (
                    <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                      {photoPreview && <img src={photoPreview} alt="submission" className="w-full max-h-56 object-cover rounded-xl mb-3" />}
                      <div className="text-3xl mb-2">⏳</div>
                      <p className="text-green-300 font-black">Photo submitted!</p>
                      <p className="text-green-300/60 text-sm mt-1">Waiting for marshal review</p>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-3 w-full py-5 rounded-2xl border-2 border-dashed border-white/25 text-white/55 font-bold text-sm cursor-pointer hover:border-white/45 hover:text-white/75 hover:bg-white/5 transition-all">
                      <span className="text-3xl">📷</span>
                      <span>Tap to take or upload a photo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handlePhotoSelect(f) }} />
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
})

// ── Main Page ─────────────────────────────────────────────────────────────────

// Entry point: `?remote=<code>` opens the phone controller; otherwise the
// normal sample view (which doubles as the "projector" when a phone is paired).
export function BingoDashSample() {
  const remoteCode = new URLSearchParams(window.location.search).get('remote')
  return remoteCode ? <SampleController code={remoteCode} /> : <SampleProjector />
}

function SampleProjector() {
  // `?board=<sectionId>` lets the admin launch the demo pre-scoped to a
  // specific event's board (from the Run Event panel); when present it also
  // swaps the "← Hub" link for a way back to that event's admin page.
  const boardParam = new URLSearchParams(window.location.search).get('board')

  const [sections, setSections] = useState<BingoSection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(false)

  const [teamName, setTeamName] = useState<string | null>(null)
  const [scanState, setScanState] = useState<ScanState>({})
  const [openTask, setOpenTask] = useState<BingoTask | null>(null)

  // What the big screen is showing: the bingo board or the scoreboard.
  const [view, setView] = useState<SampleView>('board')

  // Tiles the presenter has lit, per board. Kept here rather than in
  // BoardScreen (which remounts on every board switch) and mirrored into
  // localStorage so a reload mid-presentation doesn't lose the setup.
  const [glowMode, setGlowMode] = useState(false)
  const [glowByBoard, setGlowByBoard] = useState<Record<string, number[]>>(() => {
    try { return JSON.parse(localStorage.getItem(GLOW_KEY) ?? '{}') } catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem(GLOW_KEY, JSON.stringify(glowByBoard)) } catch { /* private mode */ }
  }, [glowByBoard])

  // Remote control: a code (generated on first "Remote" click) opens a broadcast
  // channel; a paired phone drives the state below via commands.
  const [remoteCode, setRemoteCode] = useState<string | null>(null)
  const [showPair, setShowPair] = useState(false)
  const [showTryIt, setShowTryIt] = useState(false)
  // Live step of the open task detail, reported up so the phone shows the right
  // buttons (Start Challenge → pages → marshal password → Complete).
  const [detailStep, setDetailStep] = useState<DetailStep | null>(null)
  const detailRef = useRef<SampleTaskDetailHandle | null>(null)

  const selectedSection = sections.find(s => s.id === selectedId) ?? null
  const marshalPassword = DEMO_MARSHAL_PASSWORD

  // Load all boards once. Prefer the admin's active board as the initial pick.
  useEffect(() => {
    (async () => {
      const [{ data: secs }, { data: settings }] = await Promise.all([
        supabase.from('bingo_sections').select('*').order('sort_order'),
        supabase.from('bingo_settings').select('active_section_id').eq('id', 'main').single(),
      ])
      const list = (secs ?? []) as BingoSection[]
      setSections(list)
      const active = settings?.active_section_id
      const initial = (boardParam && list.find(s => s.id === boardParam)?.id)
        ?? list.find(s => s.id === active)?.id
        ?? list[0]?.id
        ?? null
      setSelectedId(initial)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the grid whenever the selected board changes; reset the sandbox.
  useEffect(() => {
    if (!selectedId) { setGridTasks([]); return }
    let cancelled = false
    setTasksLoading(true)
    fetchBoardTasks(selectedId).then(tasks => {
      if (cancelled) return
      setGridTasks(tasks)
      setTasksLoading(false)
    })
    setScanState({})
    setOpenTask(null)
    return () => { cancelled = true }
  }, [selectedId])

  const handleSelectBoard = (id: string) => { setSelectedId(id) }

  const handleReset = () => {
    setScanState({})
    setOpenTask(null)
    setTeamName(null)
    // Roulette-style modules (spin wheels) track their spin count in
    // localStorage, keyed per activity — "nothing is saved" for the demo
    // otherwise, but that one exception needs clearing explicitly or a
    // reset demo would still show wheels locked from the last run.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key?.startsWith('aitb_spins_')) localStorage.removeItem(key)
      }
    } catch { /* private mode — nothing to clear */ }
  }

  const handleOpenTask = (task: BingoTask) => {
    setScanState(prev => prev[task.id] ? prev : { ...prev, [task.id]: 'scanned' })
    setOpenTask(task)
  }

  const markComplete = (taskId: string) => setScanState(prev => ({ ...prev, [taskId]: 'completed' }))
  const markUncomplete = (taskId: string) => setScanState(prev => ({ ...prev, [taskId]: 'scanned' }))

  // Instantly complete the first fully-populated bingo line (demo helper).
  const handleQuickWin = () => {
    const slots = buildSlots(gridTasks)
    const line = BINGO_LINES.find(l => l.every(i => slots[i] !== null))
    const targets = line ? line.map(i => slots[i]!) : gridTasks
    setScanState(prev => {
      const next = { ...prev }
      for (const t of targets) next[t.id] = 'completed'
      return next
    })
  }

  // ── Remote control wiring ──────────────────────────────────────────────────
  const snapshot = (): RemoteState => ({
    selectedId,
    teamName,
    scanState,
    openTaskId: openTask?.id ?? null,
    view,
    detail: openTask ? detailStep : null,
  })

  const applyCommand = (c: RemoteCommand) => {
    switch (c.action) {
      case 'selectBoard': handleSelectBoard(c.id); break
      case 'join': setTeamName(c.teamName); break
      case 'leave': setTeamName(null); setOpenTask(null); break
      case 'openTask': {
        const t = gridTasks.find(x => x.id === c.taskId)
        if (t) handleOpenTask(t)
        break
      }
      case 'closeTask': setOpenTask(null); break
      case 'complete': markComplete(c.taskId); break
      case 'uncomplete': markUncomplete(c.taskId); break
      case 'quickWin': handleQuickWin(); break
      case 'reset': handleReset(); break
      case 'setView': setView(c.view); break
      case 'startChallenge': detailRef.current?.start(); break
      case 'nextPage': detailRef.current?.nextPage(); break
      case 'prevPage': detailRef.current?.prevPage(); break
      case 'fillMarshal': detailRef.current?.fillMarshal(); break
      case 'submitComplete': detailRef.current?.submitComplete(); break
      case 'scroll':
        if (openTask && detailRef.current) detailRef.current.scroll(c.direction)
        else window.scrollBy({ top: c.direction === 'down' ? 400 : -400, behavior: 'smooth' })
        break
      case 'requestState': sendState(snapshot()); break
    }
  }

  const { sendState } = useSampleRemote(remoteCode, { onCommand: applyCommand })

  // Push a fresh snapshot to the paired phone on every meaningful change.
  useEffect(() => {
    if (!remoteCode) return
    sendState({ selectedId, teamName, scanState, openTaskId: openTask?.id ?? null, view, detail: openTask ? detailStep : null })
  }, [remoteCode, selectedId, teamName, scanState, openTask, view, detailStep, sendState])

  const enableRemote = () => {
    setRemoteCode(prev => prev ?? makeRemoteCode())
    setShowPair(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-xl font-bold animate-pulse">Loading sample…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <DemoBar
        sections={sections}
        selectedId={selectedId}
        onSelect={handleSelectBoard}
        marshalPassword={marshalPassword}
        onReset={handleReset}
        onQuickWin={handleQuickWin}
        showQuickWin={!!teamName && gridTasks.length > 0}
        onRemote={enableRemote}
        remoteActive={!!remoteCode}
        onTryIt={() => setShowTryIt(true)}
        view={view}
        onToggleView={() => setView(v => v === 'board' ? 'scoreboard' : 'board')}
        showViewToggle={sections.length > 0}
        backHref={boardParam ? '/bingo-dash/admin' : '/'}
        backLabel={boardParam ? 'Back to event' : 'Hub'}
      />

      {sections.length === 0 ? (
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-white text-xl font-black mb-1">No boards found</p>
          <p className="text-gray-400 text-sm">Create a board in the Bingo admin first, then come back to the sample.</p>
        </div>
      ) : view === 'scoreboard' ? (
        <SampleScoreboard
          gridTasks={gridTasks}
          section={selectedSection}
          playedTeamName={teamName}
          scanState={scanState}
        />
      ) : !teamName ? (
        <JoinScreen onJoin={name => setTeamName(name)} />
      ) : tasksLoading ? (
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="text-gray-400 text-xl font-bold animate-pulse">Loading board…</div>
        </div>
      ) : (
        <BoardScreen
          key={selectedId ?? 'none'}
          teamName={teamName}
          gridTasks={gridTasks}
          scanState={scanState}
          section={selectedSection}
          glowSlots={new Set(glowByBoard[selectedId ?? ''] ?? [])}
          glowMode={glowMode}
          onToggleGlowMode={() => setGlowMode(v => !v)}
          onToggleGlow={slot => setGlowByBoard(prev => {
            const key = selectedId ?? ''
            const lit = new Set(prev[key] ?? [])
            if (!lit.delete(slot)) lit.add(slot)
            return { ...prev, [key]: [...lit] }
          })}
          onClearGlow={() => setGlowByBoard(prev => ({ ...prev, [selectedId ?? '']: [] }))}
          onOpenTask={handleOpenTask}
          onSwitchTeam={() => { setTeamName(null); setOpenTask(null) }}
        />
      )}

      {openTask && view === 'board' && (
        <SampleTaskDetail
          key={openTask.id}
          ref={detailRef}
          task={openTask}
          teamName={teamName ?? 'Sample Team'}
          marshalPassword={marshalPassword}
          completed={scanState[openTask.id] === 'completed'}
          onComplete={() => markComplete(openTask.id)}
          onUncomplete={() => markUncomplete(openTask.id)}
          onClose={() => setOpenTask(null)}
          onStep={setDetailStep}
        />
      )}

      {showPair && remoteCode && (
        <RemotePairModal code={remoteCode} onClose={() => setShowPair(false)} />
      )}

      {showTryIt && (
        <TryItModal boardId={selectedId} onClose={() => setShowTryIt(false)} />
      )}
    </div>
  )
}

// ── Remote pairing modal (projector side) ─────────────────────────────────────
// Shows the QR + code a phone scans/enters to become the controller.

function RemotePairModal({ code, onClose }: { code: string; onClose: () => void }) {
  const url = `${window.location.origin}/bingo-dash/sample?remote=${code}`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-bounce-in" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">📡 Phone Remote</h3>
            <p className="text-xs text-gray-400 mt-0.5">Scan on a 2nd device to control this screen</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-light">&times;</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <QRCodeSVG value={url} size={220} level="H" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-bold">Pairing code</span>
            <span className="px-3 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 font-black tracking-[0.25em] text-lg">
              {code}
            </span>
          </div>
          <div className="w-full flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 bg-gray-50 rounded-lg text-[11px] font-mono text-gray-600 break-all select-all border border-gray-200">
              {url}
            </div>
            <button onClick={copy}
              className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            Keep this device on the projector. The phone becomes your remote — every tap here shows up on the big screen.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── "Try it yourself" modal (audience-facing, one QR for everyone) ────────────
// Unlike the Remote pairing above, this URL carries no ?remote= code — every
// attendee who scans it opens their own independent, local-only sandbox
// session (own join screen, own board, own BINGO) on their own phone. No two
// phones share state, and nothing is written to Supabase.

function TryItModal({ boardId, onClose }: { boardId: string | null; onClose: () => void }) {
  const url = boardId
    ? `${window.location.origin}/bingo-dash/sample?board=${boardId}`
    : `${window.location.origin}/bingo-dash/sample`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-bounce-in" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900">📱 Try it yourself</h3>
            <p className="text-xs text-gray-400 mt-0.5">Everyone scans this to play on their own phone</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-light">&times;</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <QRCodeSVG value={url} size={220} level="H" />
          </div>
          <div className="w-full flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 bg-gray-50 rounded-lg text-[11px] font-mono text-gray-600 break-all select-all border border-gray-200">
              {url}
            </div>
            <button onClick={copy}
              className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            One link, any number of people — everyone gets their own private join screen and board. Nothing anyone
            does here is saved, so it's safe to hand out to the whole room. Sample password <span className="font-black text-purple-500">{SAMPLE_TEAM_PASSWORD}</span> is pre-filled for them.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sample scoreboard ─────────────────────────────────────────────────────────
// A demo leaderboard for pitching. The 4 sample teams are ranked; the team you
// play (via the phone remote) uses its REAL live progress, the others sit at
// preset lively scores so the board looks full and competitive.

// Preset completion levels (fraction of the board) for teams you aren't playing.
const SCOREBOARD_PRESET: Record<string, number> = {
  'Sample Team Alpha': 0.60,
  'Sample Team Bravo': 0.44,
  'Sample Team Charlie': 0.32,
  'Sample Team Delta': 0.20,
}

function SampleScoreboard({
  gridTasks, section, playedTeamName, scanState,
}: {
  gridTasks: BingoTask[]
  section: BingoSection | null
  playedTeamName: string | null
  scanState: ScanState
}) {
  const slots = buildBingoSlots(gridTasks)
  const orderedTasks = slots.filter((t): t is BingoTask => t !== null)
  const total = gridTasks.length

  const rows = DEMO_GROUPS.map((name, idx) => {
    const isPlayed = name === playedTeamName
    const completedIds = isPlayed
      ? new Set(Object.entries(scanState).filter(([, v]) => v === 'completed').map(([k]) => k))
      : new Set(orderedTasks.slice(0, Math.round((SCOREBOARD_PRESET[name] ?? 0.3) * total)).map(t => t.id))
    const points = gridTasks.reduce((s, t) => completedIds.has(t.id) ? s + (t.points ?? 0) : s, 0)
    const bingos = completedBingoLines(slots, completedIds).length
    const tasksDone = completedIds.size
    return { name, points, bingos, tasksDone, isPlayed, idx }
  })

  rows.sort((a, b) =>
    b.points - a.points || b.bingos - a.bingos || b.tasksDone - a.tasksDone || a.idx - b.idx)

  const rankColors = ['#fbbf24', '#cbd5e1', '#d97706']

  return (
    <div className="relative">
      <ParticleBackground />
      <header className="relative z-10 px-4 sm:px-8 pt-6 sm:pt-8 pb-3">
        <div className="max-w-4xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-purple-400 text-xs font-black uppercase tracking-[0.3em]">Bingo Dash</p>
            <h1 className="text-white text-3xl sm:text-5xl font-black tracking-tight mt-1">Scoreboard</h1>
            {section && <p className="text-gray-400 text-sm sm:text-lg font-bold mt-1">{section.name}</p>}
          </div>
          <p className="text-gray-500 text-xs sm:text-sm font-bold whitespace-nowrap">{DEMO_GROUPS.length} teams competing</p>
        </div>
      </header>

      <main className="relative z-10 px-4 sm:px-8 pb-10">
        <div className="max-w-4xl mx-auto flex flex-col gap-2.5">
          <div className="grid grid-cols-[48px_1fr_84px_84px_84px] sm:grid-cols-[64px_1fr_140px_140px_140px] gap-2 sm:gap-4 px-3 sm:px-6 text-gray-500 text-[10px] sm:text-xs font-black uppercase tracking-widest">
            <div>Rank</div>
            <div>Team</div>
            <div className="text-center">Points</div>
            <div className="text-center">Bingos</div>
            <div className="text-center">Tasks</div>
          </div>

          {rows.map((row, i) => {
            const rank = i + 1
            const isTop3 = rank <= 3
            const rankColor = isTop3 ? rankColors[rank - 1] : '#4b5563'
            return (
              <div
                key={row.name}
                className="grid grid-cols-[48px_1fr_84px_84px_84px] sm:grid-cols-[64px_1fr_140px_140px_140px] gap-2 sm:gap-4 items-center px-3 sm:px-6 py-3 sm:py-4 rounded-2xl transition-all duration-500"
                style={{
                  background: row.isPlayed
                    ? 'linear-gradient(90deg, rgba(168,85,247,0.25) 0%, rgba(255,255,255,0.03) 100%)'
                    : isTop3
                      ? `linear-gradient(90deg, ${rankColor}22 0%, rgba(255,255,255,0.03) 100%)`
                      : 'rgba(255,255,255,0.04)',
                  border: row.isPlayed ? '1px solid rgba(168,85,247,0.6)' : isTop3 ? `1px solid ${rankColor}55` : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div className="text-2xl sm:text-4xl font-black tabular-nums" style={{ color: rankColor }}>
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-lg sm:text-3xl font-black tracking-tight truncate">{row.name}</p>
                  {row.isPlayed && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-purple-500 text-white text-[9px] sm:text-[11px] font-black uppercase tracking-wider">You · live</span>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-white text-xl sm:text-4xl font-black tabular-nums">{row.points}</p>
                </div>
                <div className="text-center">
                  <p className="text-amber-400 text-xl sm:text-4xl font-black tabular-nums">
                    {row.bingos}<span className="text-xs sm:text-xl text-gray-600">/12</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-green-400 text-xl sm:text-4xl font-black tabular-nums">{row.tasksDone}</p>
                </div>
              </div>
            )
          })}

          {total === 0 && (
            <p className="text-gray-500 text-sm text-center py-10">Loading board…</p>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Phone controller ──────────────────────────────────────────────────────────
// Loads at /bingo-dash/sample?remote=<code>. Mirrors the projector's live state
// and drives it: switch board, join, tap tiles (open on screen), complete,
// Quick Win, reset. Read-only fetches for board/task names; no DB writes.

function SampleController({ code }: { code: string }) {
  const [sections, setSections] = useState<BingoSection[]>([])
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [state, setState] = useState<RemoteState | null>(null)
  const stateRef = useRef<RemoteState | null>(null)
  stateRef.current = state

  const { sendCommand } = useSampleRemote(code, { onState: s => setState(s) })

  // Load board names once (for the picker labels).
  useEffect(() => {
    supabase.from('bingo_sections').select('*').order('sort_order').then(({ data }) => {
      setSections((data ?? []) as BingoSection[])
    })
  }, [])

  // Ask the projector for its state until it answers, so a controller opened
  // after the projector still syncs up.
  useEffect(() => {
    let tries = 0
    sendCommand({ action: 'requestState' })
    const iv = setInterval(() => {
      if (stateRef.current || tries++ > 15) { clearInterval(iv); return }
      sendCommand({ action: 'requestState' })
    }, 1200)
    return () => clearInterval(iv)
  }, [sendCommand])

  const selectedId = state?.selectedId ?? null

  // Mirror the projector's board so tile taps map to the right tasks.
  useEffect(() => {
    if (!selectedId) { setGridTasks([]); return }
    let cancelled = false
    fetchBoardTasks(selectedId).then(tasks => { if (!cancelled) setGridTasks(tasks) })
    return () => { cancelled = true }
  }, [selectedId])

  const connected = !!state
  const teamName = state?.teamName ?? null
  const scanState = state?.scanState ?? {}
  const openTaskId = state?.openTaskId ?? null
  const openTaskObj = gridTasks.find(t => t.id === openTaskId) ?? null
  const slots = buildSlots(gridTasks)
  const completedCount = Object.values(scanState).filter(s => s === 'completed').length
  const view = state?.view ?? 'board'
  const detail = state?.detail ?? null

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-emerald-500/30 px-3 py-2.5 flex items-center gap-2">
        <span className="px-2 py-1 rounded-lg bg-emerald-500 text-black text-[11px] font-black tracking-wider">📡 REMOTE</span>
        <span className="text-[11px] text-gray-400 font-bold tracking-[0.2em]">{code}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
      </div>

      {!connected ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
          <div className="text-4xl animate-pulse">📡</div>
          <p className="text-gray-300 font-bold">Looking for the projector…</p>
          <p className="text-gray-500 text-sm">Make sure the sample screen is open and shows <span className="text-emerald-300 font-bold">Paired</span>.</p>
        </div>
      ) : (
        <div className="flex-1 p-3 flex flex-col gap-3 max-w-md w-full mx-auto">
          {/* Board / Scoreboard view toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              onClick={() => sendCommand({ action: 'setView', view: 'board' })}
              className={`py-2 rounded-lg text-sm font-black transition-colors ${view === 'board' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              🎯 Board
            </button>
            <button
              onClick={() => sendCommand({ action: 'setView', view: 'scoreboard' })}
              className={`py-2 rounded-lg text-sm font-black transition-colors ${view === 'scoreboard' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              📊 Scoreboard
            </button>
          </div>

          {/* Scroll the projector's screen up/down */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => sendCommand({ action: 'scroll', direction: 'up' })}
              className="py-2.5 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-black hover:bg-white/20 active:scale-95 transition-all">
              ↑ Scroll up
            </button>
            <button onClick={() => sendCommand({ action: 'scroll', direction: 'down' })}
              className="py-2.5 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-black hover:bg-white/20 active:scale-95 transition-all">
              ↓ Scroll down
            </button>
          </div>

          {/* Board picker */}
          <div>
            <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Board</label>
            <select
              value={selectedId ?? ''}
              onChange={e => sendCommand({ action: 'selectBoard', id: e.target.value })}
              className="w-full mt-1 bg-white/10 text-white text-sm font-bold rounded-lg px-3 py-2.5 border border-white/15 focus:outline-none focus:border-emerald-400"
            >
              {sections.length === 0 && <option value="">No boards</option>}
              {sections.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>)}
            </select>
          </div>

          {/* Join / team */}
          {!teamName ? (
            <div>
              <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Join as</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {DEMO_GROUPS.map(g => (
                  <button key={g}
                    onClick={() => sendCommand({ action: 'join', teamName: g })}
                    className="px-2 py-2.5 rounded-lg bg-purple-500/20 text-purple-100 border border-purple-400/40 text-xs font-bold hover:bg-purple-500/30 transition-colors">
                    {g.replace('Sample Team ', '')}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <span className="text-sm font-bold text-white">👥 {teamName}</span>
              <span className="text-[11px] text-gray-500">{completedCount} done</span>
              <button onClick={() => sendCommand({ action: 'leave' })}
                className="ml-auto text-[11px] font-bold text-gray-300 border border-white/15 rounded-lg px-2.5 py-1 hover:bg-white/10 transition-colors">
                Leave
              </button>
            </div>
          )}

          {/* Tile grid — tap to open on the projector */}
          {teamName && (
            <div>
              <label className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">Tap a tile to show it on screen</label>
              <div className="grid grid-cols-5 gap-1.5 mt-1">
                {slots.map((task, i) => {
                  if (!task) return <div key={i} className="rounded-lg aspect-square bg-white/5 border border-white/10" />
                  const st = scanState[task.id]
                  const isOpen = task.id === openTaskId
                  return (
                    <button key={i}
                      onClick={() => sendCommand({ action: 'openTask', taskId: task.id })}
                      title={task.title}
                      className={`relative rounded-lg aspect-square flex items-center justify-center text-[9px] font-black leading-none p-0.5 text-center transition-all active:scale-95 ${isOpen ? 'ring-2 ring-emerald-400' : ''}`}
                      style={{ backgroundColor: task.hex_code, opacity: st ? 1 : 0.8 }}>
                      {st === 'completed' && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg text-white text-sm">✓</span>
                      )}
                      {st === 'scanned' && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full border border-white/80" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Open-task controls — walk the tile's flow on the big screen */}
          {openTaskObj && (
            <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs text-emerald-200 font-bold">On screen now: <span className="text-white">{openTaskObj.title}</span></p>

              {scanState[openTaskObj.id] === 'completed' ? (
                <button onClick={() => sendCommand({ action: 'uncomplete', taskId: openTaskObj.id })}
                  className="w-full py-2.5 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-bold hover:bg-white/20 transition-colors">
                  ↺ Undo complete
                </button>
              ) : detail?.phase === 'splash' ? (
                <button onClick={() => sendCommand({ action: 'startChallenge' })}
                  className="w-full py-3 rounded-lg bg-emerald-500 text-black text-sm font-black hover:bg-emerald-400 transition-colors">
                  ▶ Start Challenge
                </button>
              ) : (
                <>
                  {detail && detail.pageCount > 1 && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => sendCommand({ action: 'prevPage' })}
                        disabled={detail.pageIndex <= 0}
                        className="flex-1 py-2 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-bold hover:bg-white/20 disabled:opacity-30 transition-colors">
                        ‹ Prev
                      </button>
                      <span className="text-[11px] text-gray-400 font-bold tabular-nums">{detail.pageIndex + 1}/{detail.pageCount}</span>
                      <button onClick={() => sendCommand({ action: 'nextPage' })}
                        disabled={detail.pageIndex >= detail.pageCount - 1}
                        className="flex-1 py-2 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-bold hover:bg-white/20 disabled:opacity-30 transition-colors">
                        Next ›
                      </button>
                    </div>
                  )}
                  {detail?.isMarshalTask && !detail.marshalFilled && (
                    <button onClick={() => sendCommand({ action: 'fillMarshal' })}
                      className="w-full py-2.5 rounded-lg bg-yellow-400/20 text-yellow-200 border border-yellow-400/40 text-sm font-black hover:bg-yellow-400/30 transition-colors">
                      👮 Fill marshal password (4321)
                    </button>
                  )}
                  <button
                    onClick={() => sendCommand({ action: 'submitComplete' })}
                    disabled={!!detail?.isMarshalTask && !detail.marshalFilled}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-black hover:bg-emerald-400 disabled:opacity-40 transition-colors">
                    ✓ Complete Challenge
                  </button>
                </>
              )}

              <button onClick={() => sendCommand({ action: 'closeTask' })}
                className="w-full py-2 rounded-lg bg-white/5 text-gray-300 border border-white/10 text-xs font-bold hover:bg-white/10 transition-colors">
                ← Back to board
              </button>
            </div>
          )}

          {/* Bottom actions */}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => sendCommand({ action: 'quickWin' })}
              disabled={!teamName}
              className="py-3 rounded-lg bg-yellow-400/20 text-yellow-200 border border-yellow-400/40 text-sm font-black hover:bg-yellow-400/30 disabled:opacity-40 transition-colors">
              ⚡ Quick BINGO
            </button>
            <button onClick={() => sendCommand({ action: 'reset' })}
              className="py-3 rounded-lg bg-white/10 text-gray-200 border border-white/15 text-sm font-bold hover:bg-white/20 transition-colors">
              ↺ Reset demo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
