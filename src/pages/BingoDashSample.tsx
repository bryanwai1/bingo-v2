import { ScheduleLockOverlay, ScheduleBanner } from '../components/ScheduleBits'
import { useCardSchedules } from '../hooks/useCardSchedules'
import type { ScheduleStatus } from '../lib/cardSchedule'
import { CategoryIcon } from '../components/BingoTileFace'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { fetchBoardTasks, fetchPrizeTasks, tasksForFace } from '../lib/boardCards'
import { PrizeStrip } from '../lib/prizeCard/PrizeStrip'
import { prizeView } from '../lib/prizeCard/logic'
import { hasOwnMechanism, effectiveInputs, inputKinds, isCompulsory, fileAccept, fileEmoji, fileHeading, fileNoun } from '../lib/completionInputs'
import { activeFaces, faceName, faceColor, normaliseFaceCount } from '../lib/cubeFaces'
import { buildBingoSlots, completedBingoLines, scoreWithBingoLines, planLineCelebrations, bingoLineBonus } from '../lib/bingoLines'
import { scanControls, controlRing, pressControl, typeControl, giveFile, tapControl, type RemoteControl } from '../lib/remoteControls'
import { useSampleRemote, makeRemoteCode, HEARTBEAT_MS, HEARTBEAT_TIMEOUT_MS, type RemoteCommand, type RemoteState, type SampleView, type DetailStep, type JoinQrMode } from '../hooks/useSampleRemote'
import { useBingoTaskPages } from '../hooks/useBingoTaskPages'
import { useBingoTaskPhotos } from '../hooks/useBingoTaskPhotos'
import { useTaskLinks } from '../hooks/useTaskLinks'
import { TaskLinkButtons, type LinkItem } from '../components/TaskLinkButtons'
import { SupportChat } from '../components/SupportChat'
import { MyQrButton } from '../components/MyQrButton'
import { BoardBottomBar, BoardBarSpacer } from '../components/BoardBottomBar'
import { ChainTrail, type TrailStep } from '../components/ChainTrail'
import { parseAnswerBlocks } from '../lib/answerBlocks'
import { JoinLinkButton, JoinQrOverlay } from '../components/JoinLinkButton'
import { DemoBundleCard } from '../components/DemoBundleCard'
import { AitbMissionModule } from '../components/AitbMissionModule'
import { CardBonusTimer } from '../components/CardBonusTimer'
import { resolveBonusWindow, type BonusDefaults } from '../lib/timeBonus'
import { LanguageToggle } from '../components/LanguageToggle'
import { useLang, setLang } from '../hooks/useLanguage'
import { aitbByName, aitbToolUrl, aitbToolCaption, AITB_POINTS } from '../lib/aitbActivities'
import { InstructionPage } from '../components/InstructionPage'
import { PageNavigator } from '../components/PageNavigator'
import { SwipeablePages } from '../components/SwipeablePages'
import { ParticleBackground } from '../components/ParticleBackground'
import { PlayerBackdrop } from '../components/PlayerBackdrop'
import { TimeUpAlarm } from '../components/TimeUpAlarm'
import { ForestWaitingScreen } from '../components/ForestWaitingScreen'
import { WaitingTiger } from '../components/WaitingTiger'
import { PrizeReveal } from '../lib/prizeCard/PrizeReveal'
import { normalizePlayerTheme, GRAB_GREEN, type PlayerTheme } from '../lib/playerThemes'
import { TileFace } from '../components/BingoTileFace'
import { SpeedEditTargets } from '../components/SpeedEditTargets'
import { SampleTreeApp } from '../components/SampleTreeApp'
import { CardSample } from '../components/CardSample'
import { SignSpliceCard } from '../components/SignSpliceCard'
import { BreakoutHuntCard } from '../components/BreakoutHuntCard'
import { useCardDrawConfig } from '../hooks/useCardDrawConfig'
import { RetroGamesSample } from '../components/RetroGamesSample'
import { normalizeTileDisplay, withCategoryColors, chainInfoFn, prereqResolver, type ChainInfo, type TileDisplay } from '../lib/bingoTileDisplay'
import { normalizeUrl } from '../lib/normalizeUrl'
import { useAutoAdvance, HERO_ROTATE_MS, INSTRUCTION_ROTATE_MS } from '../lib/useAutoAdvance'
import { CardNeeds } from '../components/CardNeeds'
import { HeroCarousel } from '../components/HeroCarousel'
import { getPuzzle } from '../lib/coopGames/registry'
import { gameKeyForTitle } from '../lib/coopGames/gameCards'
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

// ── Board owner labels ───────────────────────────────────────────────────────
// Which account each board belongs to, for the board pickers. bingo_accounts
// is RLS-protected: a signed-in owner sees every account, anyone else sees
// only their own, so emails never leak to a public viewer.
function useOwnerLabel(): (s: BingoSection) => string {
  const [names, setNames] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    supabase.from('bingo_accounts').select('id, email, display_name').then(({ data }) => {
      setNames(new Map((data ?? []).map(a => [a.id as string, (a.email || a.display_name || '') as string])))
    })
  }, [])
  return useCallback((s: BingoSection) => {
    if (!s.owner_id) return 'BRYAN'
    return names.get(s.owner_id) || `Account ${s.owner_id.slice(0, 6)}`
  }, [names])
}

// ── Demo top bar (board switcher + cheat sheet + reset) ──────────────────────

// Header rules (SUGGEST-sample-header, answered by Jiamin 2026-11-18):
//  1. Every control has a word, 44px high. No icon-only buttons at any width.
//  2. Nothing wraps. Below 1280px: row 1 = back, badge, board picker; row 2 = strip of equal-width
//     main buttons (Scores/Board, Join Link, BINGO, More). The rest lives in the More sheet.
//  3. From 1280px: one row of labelled groups (Present | Connect | Demo) and the two labelled
//     password pills on the right. The marshal password stays visible on the projector.
//  4. Strip buttons share the width (flex-1 basis-0 min-w-0), so 320px and 1279px both fit.
const BTN = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border text-xs font-black whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300'
const TONE = {
  plain: 'bg-white/10 text-gray-200 border-white/15 hover:bg-white/20',
  violet: 'bg-violet-500/20 text-violet-200 border-violet-400/40 hover:bg-violet-500/30',
  gold: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/40 hover:bg-yellow-400/30',
  green: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50 hover:bg-emerald-500/30',
  sky: 'bg-sky-500/20 text-sky-200 border-sky-400/50 hover:bg-sky-500/30',
} as const
const STRIP = 'flex-1 basis-0 min-w-0 px-1.5'

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
  waiting, onToggleWaiting, observer, onToggleObserver,
  showViewToggle,
  backHref,
  backLabel,
  locked,
  ownerLabel,
}: {
  sections: BingoSection[]
  selectedId: string | null
  locked: boolean
  ownerLabel: (s: BingoSection) => string
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
  /** Presenter switches that show the screens a real player can land on besides the board. */
  waiting: boolean
  onToggleWaiting: () => void
  observer: boolean
  onToggleObserver: () => void
  showViewToggle: boolean
  backHref: string
  backLabel: string
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])
  const section = sections.find(s => s.id === selectedId)
  const inSheet = (fn: () => void) => () => { setMoreOpen(false); fn() }

  const toggle = (cls: string, wide: boolean) => showViewToggle && (
    <button type="button" onClick={onToggleView} className={`${BTN} ${TONE.violet} ${cls}`}>
      {view === 'board' ? '📊' : '🎯'}
      <span>{view === 'board' ? (wide ? 'Scoreboard' : 'Scores') : 'Board'}</span>
    </button>
  )
  const bingo = (cls: string) => showQuickWin && (
    <button type="button" onClick={onQuickWin} data-remote="quickWin" className={`${BTN} ${TONE.gold} ${cls}`}>⚡<span>BINGO</span></button>
  )
  const join = (cls: string) => (
    <JoinLinkButton slug={section?.slug} boardName={section?.name} className={`${BTN} ${TONE.plain} ${cls}`} />
  )
  const remote = (cls: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`${BTN} ${remoteActive ? TONE.green : TONE.plain} ${cls}`}>
      📡<span>{remoteActive ? 'Paired' : 'Remote'}</span>
    </button>
  )
  const tryIt = (cls: string, onClick: () => void, long: boolean) => (
    <button type="button" onClick={onClick} className={`${BTN} ${TONE.plain} ${cls}`}>📱<span>{long ? 'Try it yourself' : 'Try it'}</span></button>
  )
  const reset = (cls: string, onClick: () => void, long: boolean) => (
    <button type="button" onClick={onClick} className={`${BTN} ${TONE.plain} ${cls}`}>↺<span>{long ? 'Reset demo' : 'Reset'}</span></button>
  )
  const waitBtn = (cls: string, onClick: () => void, long: boolean) => (
    <button type="button" onClick={onClick} data-remote="setWaiting" className={`${BTN} ${waiting ? TONE.green : TONE.plain} ${cls}`}>⏳<span>{long ? 'Waiting screen' : 'Waiting'}</span></button>
  )
  const obsBtn = (cls: string, onClick: () => void, long: boolean) => (
    <button type="button" onClick={onClick} data-remote="setObserver" className={`${BTN} ${observer ? TONE.green : TONE.plain} ${cls}`}>👁<span>{long ? 'Observer view' : 'Observer'}</span></button>
  )
  const pill = (label: string, value: string, tone: string) => (
    <span className="px-2.5 py-2 rounded-xl bg-white/5 text-gray-300 border border-white/10 text-xs font-bold whitespace-nowrap">
      {label} <span className={`font-black ${tone}`}>{value}</span>
    </span>
  )
  const divider = <span className="w-px self-stretch my-1 bg-white/10" aria-hidden="true" />

  return (
    <div className="sticky top-0 z-40 w-full bg-gray-950/95 backdrop-blur border-b border-purple-500/30">
      <div className="max-w-5xl xl:max-w-none mx-auto px-2.5 py-2 flex flex-col gap-1.5 xl:flex-row xl:items-center xl:gap-2">
        {/* Row 1: back + badge + board picker */}
        <div className="flex items-center gap-2 min-w-0">
          {!locked && (
            <Link to={backHref} aria-label={backLabel} className={`${BTN} ${TONE.plain} flex-shrink-0 min-w-[44px] px-2.5`}>
              ←<span className="hidden xl:inline">{backLabel}</span>
            </Link>
          )}
          <span className="flex-shrink-0 px-2 py-1 rounded-lg bg-purple-500 text-black text-[11px] font-black tracking-wider whitespace-nowrap">
            🎬 SAMPLE
          </span>
          {locked ? (
            <span className="flex-1 min-w-0 xl:flex-none xl:w-40 truncate text-white text-xs font-bold px-2.5 py-2">
              {section?.name ?? 'Board not found'}
            </span>
          ) : (
            <select
              value={selectedId ?? ''}
              onChange={e => onSelect(e.target.value)}
              aria-label="Choose board"
              className="flex-1 min-w-0 xl:flex-none xl:w-40 min-h-[44px] bg-white/10 text-white text-xs font-bold rounded-xl px-2.5 border border-white/15 focus:outline-none focus:border-purple-400"
            >
              {sections.length === 0 && <option value="">No boards found</option>}
              {sections.map(s => (
                <option key={s.id} value={s.id} className="bg-gray-900">{s.name} — {ownerLabel(s)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Row 2 below 1280px: equal-width main buttons + More */}
        <div className="flex gap-1.5 xl:hidden">
          {toggle(STRIP, false)}
          {join(STRIP)}
          {bingo(STRIP)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={`${BTN} ${TONE.plain} ${STRIP} relative`}>
            ⋯<span>More</span>
            {remoteActive && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" aria-label="Remote is on" />}
          </button>
        </div>

        {/* From 1280px: one row of labelled groups */}
        <div className="hidden xl:flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {toggle('', true)}
          {join('')}
          {divider}
          {remote('', onRemote)}
          {tryIt('', onTryIt, true)}
          {divider}
          {bingo('')}
          {waitBtn('', onToggleWaiting, true)}
          {obsBtn('', onToggleObserver, true)}
          {reset('', onReset, false)}
          <div className="ml-auto flex items-center gap-2">
            {pill('Team', SAMPLE_TEAM_PASSWORD, 'text-purple-300')}
            {pill('Marshal', marshalPassword, 'text-yellow-300')}
          </div>
        </div>
      </div>

      {moreOpen && createPortal(
        <div role="dialog" aria-modal="true" aria-label="More demo controls" onClick={() => setMoreOpen(false)}
          className="xl:hidden fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-gray-900 border-t border-purple-500/40 px-4 pt-4 flex flex-col gap-4"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
            <p className="text-white font-black text-base">More</p>
            <div className="flex flex-col gap-2">
              <p className="text-white/50 text-[11px] font-black uppercase tracking-wider">Show the room</p>
              {remote('w-full justify-start px-3', inSheet(onRemote))}
              {tryIt('w-full justify-start px-3', inSheet(onTryIt), true)}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-white/50 text-[11px] font-black uppercase tracking-wider">Cheat sheet</p>
              <div className="flex gap-2 flex-wrap">
                {pill('Team password', SAMPLE_TEAM_PASSWORD, 'text-purple-300')}
                {pill('Marshal password', marshalPassword, 'text-yellow-300')}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-white/50 text-[11px] font-black uppercase tracking-wider">Demo</p>
              {waitBtn('w-full justify-start px-3', inSheet(onToggleWaiting), true)}
              {obsBtn('w-full justify-start px-3', inSheet(onToggleObserver), true)}
              {reset('w-full justify-start px-3', inSheet(onReset), true)}
            </div>
            <button type="button" onClick={() => setMoreOpen(false)} className={`${BTN} ${TONE.plain} w-full`}>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Join Screen (sandbox: demo groups + pre-filled sample password) ───────────

// The picked group is held by the projector (not here) so a group chosen on the
// paired phone lands on the same "Enter Password" step as a click on screen.
function JoinScreen({ selected, onSelect, onJoin, theme, name, named, onName, onNameNext, onNameBack }: {
  theme: PlayerTheme
  /** The name step is held by the screen (not here) so the paired remote types, taps Next and goes back in step with it. */
  name: string
  named: boolean
  onName: (name: string) => void
  onNameNext: () => void
  onNameBack: () => void
  selected: string | null
  onSelect: (groupName: string | null) => void
  onJoin: (groupName: string) => void
}) {
  const grab = theme === 'grab'
  const accent = grab ? GRAB_GREEN : '#a855f7'
  // A group the big screen already picked wins, so the remote follows it to the password step.
  const step = selected ? 2 : !named ? 0 : 1
  const [search, setSearch] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Pre-fill the sample password for the demo whenever a group is picked.
  useEffect(() => {
    setPassword(selected ? SAMPLE_TEAM_PASSWORD : '')
    setError('')
  }, [selected])

  const groups = DEMO_GROUPS
    .filter(g => g.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const pick = (name: string) => onSelect(name)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (password !== SAMPLE_TEAM_PASSWORD) { setError('Wrong password (demo password is 1234).'); return }
    onJoin(selected)
  }

  return (
    <div className="min-h-[80vh] bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden px-4 py-8">
      <PlayerBackdrop theme={theme} />

      <div className="relative z-10 text-center mb-8 animate-slide-up">
        {grab ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: '#7CF0A8' }}>Grab</p>
            <h1 className="text-5xl font-black text-white tracking-tight mt-1 [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">GAME DAY BINGO</h1>
            <p className="text-white/80 mt-3 text-lg [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">Complete challenges · Scan tiles · Win</p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">🎯</div>
            <h1 className="text-5xl font-black text-white tracking-tight">BINGO DASH</h1>
            <p className="text-gray-400 mt-3 text-lg">Complete challenges · Scan tiles · Win</p>
          </>
        )}
      </div>

      {step === 0 && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.15s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">What's your name?</h2>
          <p className="text-gray-400 text-center text-sm mb-5">Your team will see this name.</p>
          <form onSubmit={e => { e.preventDefault(); if (name.trim()) onNameNext() }} className="flex flex-col gap-3">
            <input
              type="text" value={name} onChange={e => onName(e.target.value)} placeholder="Your name" maxLength={40}
              aria-label="Your name" data-tap
              className="w-full px-5 py-4 rounded-2xl border-2 text-lg font-bold text-gray-900 focus:outline-none transition-colors text-center"
              style={{ borderColor: name.trim() ? accent : '#e5e7eb' }}
            />
            <button
              type="submit" disabled={!name.trim()} data-tap data-remote="joinNameNext"
              className="w-full py-4 rounded-2xl text-white font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95 mt-1"
              style={{ backgroundColor: accent, boxShadow: `0 8px 24px ${accent}44` }}
            >
              Next →
            </button>
          </form>
        </div>
      )}

      {step === 1 && (
        <div
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm animate-bounce-in"
          style={{ animationDelay: '0.15s', opacity: 0, animationFillMode: 'forwards' }}
        >
          <button data-tap data-remote="joinNameBack" onClick={onNameBack} className="text-sm text-purple-500 font-bold mb-4 hover:text-purple-700 transition-colors">
            &larr; Back
          </button>
          <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Join Game</h2>
          <p className="text-gray-400 text-center text-sm mb-1">Hi <span className="text-purple-500 font-bold">{name.trim()}</span>!</p>
          <p className="text-gray-400 text-center text-sm mb-5">Search and select your group</p>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full px-4 py-3 rounded-2xl border-2 text-base font-medium text-gray-900 focus:outline-none transition-colors text-center mb-3"
            style={{ borderColor: search ? accent : '#e5e7eb' }}
          />

          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            {groups.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No groups match your search.</p>
            ) : (
              groups.map(group => (
                <button
                  key={group}
                  data-tap data-remote="group" data-group={group}
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
            onClick={() => onSelect(null)} data-remote="cancelJoin"
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
              /* Explicit colour: this input sits on a white card but used to
                 inherit its text colour, so on a screen whose wrapper sets
                 text-white the pre-filled password rendered white-on-white -
                 present in the DOM, invisible to the room. */
              className="w-full px-5 py-4 rounded-2xl border-2 text-4xl font-black text-gray-900 focus:outline-none transition-colors text-center tracking-[0.6em]"
              style={{ borderColor: password.length === 4 ? accent : '#e5e7eb' }}
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
              type="submit" data-remote="confirmJoin"
              disabled={password.length !== 4}
              className="w-full py-4 rounded-2xl text-white font-black text-xl transition-all duration-200 disabled:opacity-40 hover:scale-105 active:scale-95 mt-1"
              style={{ backgroundColor: accent, boxShadow: `0 8px 24px ${accent}44` }}
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
  task, status, chained, chain, isInBingoLine, display, glowing, autoContrast, onClick, sched,
}: {
  autoContrast?: boolean
  task: BingoTask
  status: TileStatus
  /** A chained card whose prerequisite this demo team has not finished —
   *  greyed with a padlock, but still tappable. Mirrors the player board. */
  chained: boolean
  chain?: ChainInfo | null
  isInBingoLine: boolean
  display: TileDisplay
  /** Demo only — a tile the presenter has lit up to draw the room's eye. */
  glowing: boolean
  onClick: () => void
  sched?: ScheduleStatus | null
}) {
  return (
    <button
      onClick={onClick}
      data-tap
      title={chained ? `${task.title} (locked)` : task.title}
      aria-label={chained ? `${task.title} (locked)` : task.title}
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
        // Grab: the art behind must not show through, so dim with a filter, not opacity
        opacity: status === 'locked' && !autoContrast ? 0.72 : 1,
        filter: chained || sched?.locked ? 'grayscale(0.85) brightness(0.8)' : status === 'locked' && autoContrast ? 'brightness(0.82)' : undefined,
      }}
    >
      {/* Chained card: its step in the chain, and a pulsing ring on the one
          the team can open next. */}
      {chain && status !== 'completed' && (
        <>
          {!chained && (
            <div className="absolute inset-0 rounded-[inherit] ring-[3px] ring-inset ring-emerald-300 animate-pulse z-20 pointer-events-none" />
          )}
          <div className={`absolute top-0.5 left-0.5 z-20 text-[8px] font-black rounded px-1 leading-tight shadow pointer-events-none ${chained ? 'bg-black/60 text-white' : 'bg-emerald-400 text-black'}`}>
            {chain.role === 'start' ? 'START' : `${chain.step}/${chain.total}`}
          </div>
        </>
      )}
      <ScheduleLockOverlay sched={sched} small={false} />
      {chained && (
        <div className="absolute inset-0 bg-black/35 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-white/85 rounded-full w-7 h-7 flex items-center justify-center shadow">
            {chain?.role === 'end' && task.tile_icon === 'treasure' ? <img src="/grab/icons/treasure.png" alt="" draggable={false} className="w-[80%] h-[80%] object-contain" /> : <span className="text-sm leading-none">🔒</span>}
          </div>
        </div>
      )}
      {/* The lit ring. Drawn as an overlay rather than a border so it sits
          inside the tile's rounded corners and never shifts the layout. */}
      {glowing && (
        <>
          <div className="absolute inset-0 rounded-xl pointer-events-none z-20"
            style={{ boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.92), inset 0 0 14px rgba(255,255,255,0.45)' }} />
          {/* Three sparks tracing the tile's edge, spaced a third of a lap
              apart so one is always somewhere visible. */}
          <div className="tile-sparks absolute inset-[5px] rounded-xl pointer-events-none z-30" aria-hidden="true">
            <span /><span /><span />
          </div>
        </>
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
      <TileFace task={task} display={display} autoContrast={autoContrast} chip={(task.points ?? 0) > 0 ? 'tl' : null} />

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

export type BoardScreenHandle = {
  /** Clear the BINGO celebration — same as tapping it on the projector. */
  dismissPopup: () => void
  /** Show or hide the Invite-teammate QR overlay. */
  setInvite: (open: boolean) => void
  /** Open or close the help-chat message box. */
  setChat: (open: boolean) => void
}

const BoardScreen = forwardRef<BoardScreenHandle, {
  teamName: string
  gridTasks: BingoTask[]
  scanState: ScanState
  /** Slots Quick BINGO lit directly — see handleQuickWin. */
  quickWinSlots: Set<number>
  section: BingoSection | null
  /** Slots lit on THIS board. Held by the page so a board switch keeps them. */
  glowSlots: Set<number>
  glowMode: boolean
  onToggleGlow: (slot: number) => void
  onClearGlow: () => void
  onToggleGlowMode: () => void
  onOpenTask: (task: BingoTask) => void
  onSwitchTeam: () => void
  /** Sandbox link for this board — the same URL the Try-it QR hands out. */
  inviteUrl: string
  onShowScoreboard: () => void
  /** Celebration state, so a paired phone can see and skip it. */
  onPopupChange?: (letters: string | null, queued: number) => void
  /** Invite-QR overlay state, so the phone's toggle reflects the screen. */
  onInviteChange?: (open: boolean) => void
  /** Help-chat state, so the phone's toggle reflects the screen. */
  onChatChange?: (open: boolean) => void
  /** Show the observer's version of the board: badge, no invite, view-only cards. */
  observer?: boolean
}>(function BoardScreen({
  teamName, gridTasks: gridTasksProp, scanState, quickWinSlots, section, glowSlots, glowMode,
  onToggleGlow, onClearGlow, onToggleGlowMode, onOpenTask, onSwitchTeam,
  inviteUrl, onShowScoreboard, onPopupChange, onInviteChange, onChatChange, observer = false,
}, ref) {
  // One colour per category on the board, whatever each card row carries.
  const gridTasks = useMemo(() => withCategoryColors(gridTasksProp), [gridTasksProp])
  const { statusOf: schedOf, alerts: schedAlerts, dismiss: dismissSched } = useCardSchedules(section?.id, gridTasks)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [popupLetters, setPopupLetters] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [popupQueue, setPopupQueue] = useState<string[]>([])
  const celebratedLinesRef = useRef<Set<number> | null>(null)

  const boardNote = section?.board_note ?? ''
  const boardNoteEvery = section?.board_note_every ?? 0
  const tileDisplay = normalizeTileDisplay(section?.tile_display)
  const theme = normalizePlayerTheme(section?.player_theme)
  // Prize cards sit under the grid, not in it (slots 200+); the sandbox claims them locally.
  const [prizeTasks, setPrizeTasks] = useState<BingoTask[]>([])
  const [sandboxClaims, setSandboxClaims] = useState<string[]>([])
  // The winner's reveal page, with made-up details: nothing is read from or saved to the real prize.
  const [revealTask, setRevealTask] = useState<BingoTask | null>(null)
  // The time-up alarm, only if this board's timer was still running when the demo opened.
  const [alarmOn, setAlarmOn] = useState(false)
  useEffect(() => {
    const end = section?.timer_end_at
    setAlarmOn(!!end && new Date(end).getTime() > Date.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.id])
  const sectionId = section?.id ?? null
  useEffect(() => {
    if (!sectionId) return
    let live = true
    fetchPrizeTasks(sectionId).then(t => { if (live) setPrizeTasks(t) })
    return () => { live = false }
  }, [sectionId])

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
  // Per-slot status: quickWinSlots overrides scanState so Quick BINGO's box
  // stays lit regardless of what its (possibly shared) task's real status is.
  const getStatusAt = (taskId: string, slotIdx: number): TileStatus =>
    quickWinSlots.has(slotIdx) ? 'completed' : getStatus(taskId)
  // Chained cards grey out until the demo team has completed the card they
  // follow — same rule as the player board, read from the demo's own state.
  const prereqOf = prereqResolver(gridTasks)
  const isChainLocked = (task: BingoTask) => {
    const p = prereqOf(task)
    return !!p && scanState[p] !== 'completed'
  }

  const chainInfoOf = chainInfoFn(visibleTasks)
  const slots = buildSlots(visibleTasks)
  const completedCount = slots.reduce(
    (n, t, i) => (t && getStatusAt(t.id, i) === 'completed' ? n + 1 : n), 0,
  )

  const completedLineIndices = BINGO_LINES.reduce((acc, line, i) => {
    const allDone = line.every(slotIdx => {
      const task = slots[slotIdx]
      return task && getStatusAt(task.id, slotIdx) === 'completed'
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
    // Same rule as the player board: each step of BINGO once, nothing past the fifth line.
    const { next, popups } = planLineCelebrations(celebratedLinesRef.current, completedLineIndices)
    if (next.size === celebratedLinesRef.current.size) return
    celebratedLinesRef.current = next
    if (popups.length) setPopupQueue(prev => [...prev, ...popups])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedLinesKey])

  useEffect(() => {
    if (popupLetters || popupQueue.length === 0) return
    setPopupLetters(popupQueue[0])
    setPopupQueue(prev => prev.slice(1))
  }, [popupLetters, popupQueue])

  // The celebration waits for a deliberate "continue" — a tap on the screen or
  // the paired phone's button — which is what its own "Tap to continue" label
  // promises. It used to clear itself after 4s regardless, so the remote's
  // continue button appeared and vanished before anyone could reach for it,
  // and the presenter had no say over how long the room saw it.
  const closePopup = useCallback(() => { setPopupLetters(null) }, [])

  // Let a paired phone clear the celebration. Dismisses the current one only,
  // exactly like tapping the screen — the next queued one then takes over, so
  // the presenter taps through a burst at their own pace.
  useImperativeHandle(ref, () => ({
    dismissPopup: closePopup,
    setInvite: (next: boolean) => setInviteOpen(next),
    setChat: (next: boolean) => setChatOpen(next),
  }))

  useEffect(() => {
    onPopupChange?.(popupLetters, popupQueue.length)
  }, [onPopupChange, popupLetters, popupQueue.length])

  useEffect(() => { onInviteChange?.(inviteOpen) }, [onInviteChange, inviteOpen])
  useEffect(() => { onChatChange?.(chatOpen) }, [onChatChange, chatOpen])

  if (revealTask) {
    return <SamplePrizeReveal task={revealTask} teamName={teamName} theme={theme} onBack={() => setRevealTask(null)} />
  }

  return (
    <div className={`min-h-[80vh] bg-gray-950 relative overflow-x-hidden ${theme === 'grab' ? 'grab-ui' : ''}`}>
      <PlayerBackdrop theme={theme} />
      {alarmOn && <TimeUpAlarm settings={section} />}

      {popupLetters && <BingoPopup letters={popupLetters} onDismiss={closePopup} />}

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="board-col flex items-start justify-between gap-3">
          <div>
            <p className="text-purple-400 text-[10px] font-black uppercase tracking-widest" style={theme === 'grab' ? { color: '#7CF0A8' } : undefined}>{theme === 'grab' ? 'Grab Game Day' : 'Bingo Dash'}</p>
            <h1 className="text-white text-xl font-black tracking-tight leading-tight">{teamName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-green-400 text-xs font-bold">{completedCount}/{visibleTasks.length} completed</span>
              {lettersEarned && (
                <span className="text-purple-300 text-xs font-black tracking-widest">{lettersEarned}!</span>
              )}
              {observer && (
                <span className="text-blue-300 text-[10px] font-black uppercase tracking-wider bg-blue-900/40 px-1.5 py-0.5 rounded">👁 Observer</span>
              )}
            </div>
            {/* Same help bubble as the player board; demo-only messages. */}
            <div className="mt-3">
              <SupportChat
                inline demo
                sectionId={section?.id ?? 'demo'}
                teamId={`demo-${teamName}`}
                teamName={teamName}
                open={chatOpen}
                onOpenChange={setChatOpen}
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
            <TimerDisplay settings={section} />
            <LanguageToggle />
            {/* Mirrors the real player board (BingoDashHome), so the demo shows
                the controls a participant actually has. The QR hands out the
                sandbox link rather than a team invite — nothing here is saved,
                so each scan opens its own private board. */}
            {/* Phone: these two live in the bottom bar, as on the real board. */}
            <div className="hidden">
              <MyQrButton
                label="Invite teammate"
                teamName={teamName}
                hint="Teammate scans this to open their own demo board"
                value={inviteUrl}
                open={inviteOpen}
                onOpenChange={setInviteOpen}
              />
            </div>
            <button
              onClick={onShowScoreboard}
              className="hidden text-xs font-bold text-purple-300 hover:text-purple-200 transition-colors"
            >
              🏆 Scoreboard
            </button>
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
                background: theme === 'grab' ? `linear-gradient(90deg, ${GRAB_GREEN}, #7CF0A8)` : 'linear-gradient(90deg, #a855f7, #ec4899)',
              }}
            />
          </div>
        </div>
      </header>

      <ScheduleBanner alerts={schedAlerts} onDismiss={dismissSched} />
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
            <div className="board-grid grid grid-cols-5 gap-2">
              {slots.map((task, i) =>
                task ? (
                  <BingoTile
                    key={`${i}-${task.id}`}
                    task={task}
                    status={getStatusAt(task.id, i)}
                    chained={isChainLocked(task)}
                    sched={schedOf(task)}
                    chain={chainInfoOf(task)}
                    isInBingoLine={bingoSlots.has(i)}
                    display={tileDisplay}
                    autoContrast={theme === 'grab'}
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
          {/* Prize card preview: a local sandbox claim, nothing is written. */}
          {visibleTasks.length > 0 && prizeTasks.map(t => {
            const doneTasks = gridTasks.filter(c => getStatus(c.id) === 'completed')
            const lineCount = completedLineIndices.size
            let points = doneTasks.reduce((n, c) => n + (c.points ?? 0), 0)
            for (let k = 1; k <= Math.min(lineCount, 5); k++) points += bingoLineBonus(k)
            const view = prizeView({
              rule: t, grid: gridTasks, isDone: c => getStatus(c.id) === 'completed',
              teamId: 'sample', role: observer ? 'observer' : 'player', points, lines: lineCount,
              claims: sandboxClaims.filter(id => id === t.id).map((id, i) => (
                { id: `${id}-${i}`, board_card_id: t.placement_id ?? t.id, team_id: 'sample', team_name: teamName, claimed_at: new Date(i).toISOString() })),
            })
            return (
              <div key={t.placement_id ?? t.id} className="mt-3">
                <PrizeStrip
                  state={view.state} slots={view.slots} notes={view.notes} slotIcon={sl => <CategoryIcon category={sl.category} iconKey={sl.iconKey} className="w-7 h-7" />}
                  theme={theme} busy={false} message={null} title={t.title} hint={t.completion_warning}
                  onClaim={() => setSandboxClaims(c => [...c, t.id])}
                  onOpen={() => setRevealTask(t)}
                />
              </div>
            )
          })}
        </div>
      </main>

      {/* Phone bottom bar, same component and tabs as the real player board. */}
      <BoardBottomBar always theme={theme} teamName={teamName} inviteUrl={observer ? '' : inviteUrl} scoreboardPath=""
        onInvite={() => setInviteOpen(true)} onScores={onShowScoreboard} />
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
      <BoardBarSpacer always />
    </div>
  )
})

// ── Task Detail (sandbox overlay) ─────────────────────────────────────────────

/** The "Waiting to start" screen a player sees until the host sets the game live (copy of the real one in BingoDashHome). */
/**
 * Demo of the real co-op game panel (components/CoopPlay.tsx): same "Play in the app"
 * card, lobby and game panel, but played locally. No server session: the demo
 * player taps, the puzzle's own reducer runs here. As an observer the icons show.
 */
function SampleCoopPlay({ gameKey, color, observer, completed, onSolved, onOpenChange }: {
  gameKey: string; color: string; observer: boolean; completed: boolean
  onSolved: () => void; onOpenChange: (open: boolean) => void
}) {
  const puzzle = useMemo(() => getPuzzle(gameKey), [gameKey])
  const [phase, setPhase] = useState<'card' | 'lobby' | 'play'>('card')
  const [state, setState] = useState<unknown>(() => puzzle.initState())
  const solved = puzzle.isSolved(state)
  const PANEL = { background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }
  const btn = 'w-full min-h-[60px] rounded-2xl font-black uppercase tracking-wide text-white active:scale-95 transition-transform shadow-[0_4px_0_rgba(0,0,0,0.35)]'
  const chip = (
    <span className="px-2 py-1 rounded-lg text-xs font-black uppercase" style={{ background: observer ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.12)', color: observer ? '#7dd3fc' : '#e5e7eb' }}>
      {observer ? 'Observer' : 'Player'}
    </span>
  )
  useEffect(() => { if (solved && !completed) onSolved() }, [solved, completed, onSolved])
  useEffect(() => { onOpenChange(phase !== 'card') }, [phase, onOpenChange])

  if (phase === 'card') return (
    <div className="rounded-2xl p-4 mb-6" style={PANEL}>
      <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-1">Play in the app</p>
      <p className="text-gray-300 text-sm mb-3">Play this challenge together with your team. The player acts, observers watch.</p>
      {gameKey === 'icon-matching' && <p className="text-gray-300 text-sm mb-3">Use 1 player and at least 1 observer (up to 9). The player taps two different cards, one at a time. Only observers see both icons after the second tap. Observers call out the positions and help the player remember pairs. Matches stay revealed; non-matches hide after 2.5 seconds. Match all 8 pairs to complete the card.</p>}
      <div className="mb-3">{chip}</div>
      <button type="button" className={btn} style={{ background: color }} onClick={() => setPhase('lobby')}>
        {completed ? 'View game' : 'Play'}
      </button>
    </div>
  )

  return (
    <div className="rounded-3xl p-4 mb-6" style={{ background: 'rgba(0,0,0,0.30)', border: '2px solid rgba(255,255,255,0.15)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-black uppercase tracking-widest text-gray-300">{phase === 'lobby' ? 'Lobby' : solved || completed ? 'Completed' : 'In play'}</span>
        <span className="flex items-center gap-2"><span className="text-xs font-black text-emerald-300">● Live</span>{chip}</span>
      </div>
      {phase === 'lobby' ? (
        <>
          <ul className="text-sm text-gray-300 mb-3 space-y-1">
            <li>✓ Player 1 of 1 needed</li>
            <li>✓ Observers 1 (at least 1, up to 9)</li>
          </ul>
          <ul className="space-y-2 mb-4" aria-label="Who is in the lobby">
            <li className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 min-h-[44px] bg-white/5"><span className="font-bold text-white truncate">Sample player</span><span className="text-xs font-black text-gray-300">PLAYER</span></li>
            <li className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 min-h-[44px] bg-white/5"><span className="font-bold text-white truncate">Sample observer</span><span className="text-xs font-black text-sky-300">OBSERVER</span></li>
          </ul>
          <button type="button" className={btn} style={{ background: color }} onClick={() => { setState(puzzle.initState()); setPhase('play') }}>Start game</button>
          <button type="button" onClick={() => setPhase('card')} className="w-full min-h-[44px] mt-2 text-sm font-bold text-gray-300 underline">Leave lobby</button>
        </>
      ) : (
        <>
          {(solved || completed) && <p className="rounded-xl px-3 py-2 mb-3 text-sm font-bold bg-emerald-400/15 text-emerald-300">Solved. Locked: this game is completed. Your team was credited once.</p>}
          <puzzle.View state={state} canAct={!observer && !solved} isPlayer={!observer} mySlot={0}
            dispatch={a => setState((s: unknown) => puzzle.reduce(s, a))} />
          <button type="button" onClick={() => setPhase('card')} className="w-full min-h-[44px] mt-4 text-sm font-bold text-gray-300 underline">Back to the card</button>
        </>
      )}
    </div>
  )
}

function SampleWaiting({ theme, boardName, teamName, onBack }: { theme: PlayerTheme; boardName: string; teamName: string; onBack: () => void }) {
  return (
    <div className="relative overflow-hidden flex flex-col items-center justify-end" style={{ minHeight: '80dvh' }}>
      {theme === 'grab' ? <PlayerBackdrop theme={theme} /> : <ForestWaitingScreen />}
      <div className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 5, background: 'linear-gradient(to bottom, rgba(4,15,12,0.60) 0%, rgba(4,15,12,0.28) 42%, rgba(4,15,12,0.75) 100%)' }} />
      <div className="relative z-10 text-center px-6 pt-16 flex-1 flex flex-col justify-center [text-shadow:0_2px_14px_rgba(0,0,0,0.75)]">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-200/90 mb-2">{boardName}</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">Waiting to start</h1>
        <p className="text-white/85 text-sm">
          You're in <span className="text-amber-300 font-bold">{teamName}</span>.
          <br className="sm:hidden" /> The game begins when your host says go.
        </p>
        <div className="w-48 mx-auto mt-7">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full tiger-bar" style={{ background: '#fbbf24' }} />
          </div>
        </div>
        {/* Demo only: the real screen has "Switch team" here. */}
        <button onClick={onBack} className="mt-8 min-h-[44px] px-5 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-black hover:bg-white/25">
          ▶ Start the game
        </button>
      </div>
      <div className="relative z-10 w-full">{theme !== 'grab' && <WaitingTiger />}</div>
    </div>
  )
}

/** The prize winner's page as the demo team would see it. The details are placeholders. */
/** The lock screen a team sees on a card that is closed or not open yet. */
function SampleScheduleLock({ task, sched, onClose }: { task: BingoTask; sched: ScheduleStatus; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto flex flex-col items-center justify-center bg-gray-950 text-center px-6" data-schedule-locked>
      <ParticleBackground hexCode={task.hex_code} />
      <div className="relative z-10 max-w-sm w-full">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-white text-2xl font-black mb-2 [overflow-wrap:anywhere]">{task.title}</h2>
        <p className="text-amber-200 font-black text-lg leading-snug">{sched.text}</p>
        {sched.state === 'before' && sched.opensInMs != null && (
          <p className="mt-3 text-5xl font-black text-white tabular-nums">{sched.short}</p>
        )}
        <p className="text-white/50 text-xs font-bold mt-3">
          {sched.state === 'before' ? 'This card opens on its own. Keep this page open.' : 'Teams that already started it can still finish.'}
        </p>
        <button onClick={onClose} data-remote="closeTask"
          className="mt-6 w-full py-3 rounded-2xl text-white/80 font-bold border border-white/15 hover:bg-white/5 transition-colors">
          ← Back to Board
        </button>
      </div>
    </div>
  )
}

function SamplePrizeReveal({ task, teamName, theme, onBack }: { task: BingoTask; teamName: string; theme: PlayerTheme; onBack: () => void }) {
  const { photos } = useBingoTaskPhotos(task.id)
  return (
    <PrizeReveal
      status="ready" theme={theme} eventEnded={false}
      data={{ title: task.title, message: task.completion_warning || 'Show this page to the marshal to collect your prize.', marshal_name: 'Demo marshal', location_text: 'Collect from the facilitator desk', maps_url: null, maps_label: null }}
      photos={photos.map(p => ({ id: p.id, photo_url: p.photo_url, caption: p.caption ?? null, position_x: p.position_x ?? null, position_y: p.position_y ?? null }))}
      winner={teamName} claimedAt={new Date().toISOString()}
      onBack={onBack} onRetry={() => {}}
    />
  )
}

/** Every card in this card's chain, in order, for the "Step n of N" trail (same walk as the player page). */
function chainTrailOf(gridTasks: BingoTask[], task: BingoTask, scanState: Record<string, string>): Array<TrailStep & { task: BingoTask }> {
  const prereqOf = prereqResolver(gridTasks)
  const byId = new Map(gridTasks.map(t => [t.id, t]))
  const nextOf = new Map<string, BingoTask>()
  for (const t of gridTasks) { const p = prereqOf(t); if (p) nextOf.set(p, t) }
  let first = task
  for (let g = 0; g < 100; g++) { const p = prereqOf(first); const prev = p ? byId.get(p) : undefined; if (!prev) break; first = prev }
  const steps: Array<TrailStep & { task: BingoTask }> = []
  for (let cur: BingoTask | undefined = first, g = 0; cur && g < 100; g++) {
    steps.push({ id: cur.id, title: cur.title, done: scanState[cur.id] === 'completed', task: cur })
    cur = nextOf.get(cur.id)
  }
  return steps.length > 1 && steps.some(x => x.id === task.id) ? steps : []
}

// Imperative handle so the phone remote can drive the open tile's flow.
export type SampleTaskDetailHandle = {
  start: () => void
  nextPage: () => void
  prevPage: () => void
  fillMarshal: () => void
  submitComplete: () => void
  /** Demo shortcut for cards with their own mechanism: mark the card done without playing it. */
  autoComplete: () => void
  scroll: (direction: 'up' | 'down') => void
  /** Jump to a fraction of the scrollable range, for mirroring. */
  scrollTo: (frac: number) => void
}

/** When each card was first opened in this demo session, by task id. */
const cardClock = new Map<string, number>()

export const SampleTaskDetail = forwardRef<SampleTaskDetailHandle, {
  task: BingoTask
  teamName: string
  marshalPassword: string
  completed: boolean
  /** The board's default bonus window, so the card timer matches the real card page. */
  bonusDefaults?: BonusDefaults
  /** The chain around this card, resolved by the page from the demo's own
   *  state: the card it unlocks after (and whether that is done), and the
   *  card it unlocks. */
  chain: { prev: BingoTask | null; locked: boolean; next: BingoTask | null; trail?: Array<TrailStep & { task: BingoTask }> }
  onJump: (task: BingoTask) => void
  onComplete: () => void
  onUncomplete: () => void
  onClose: () => void
  onStep?: (s: DetailStep) => void
  /** Scroll position as a fraction, so a shared screen can follow along. */
  onScrollFrac?: (frac: number) => void
  /** Admin walkthrough: open straight on the instructions, without the tap-to-start splash. */
  skipSplash?: boolean
  /** An observer reads the card but cannot complete it. */
  observer?: boolean
}>(function SampleTaskDetail({
  task, teamName, marshalPassword, completed, bonusDefaults, chain, onJump, onComplete, onUncomplete, onClose, onStep,
  onScrollFrac, skipSplash, observer = false,
}, ref) {
  const { pages } = useBingoTaskPages(task.id)
  const { photos } = useBingoTaskPhotos(task.id)
  const { links } = useTaskLinks(task.id, 'bingo_task_links')

  const [showSplash, setShowSplash] = useState(!skipSplash)
  const pagesAuto = useAutoAdvance(pages.length, INSTRUCTION_ROTATE_MS, pages.some(p => p.media_type === 'video'))
  const currentPage = pagesAuto.idx
  const setCurrentPage = pagesAuto.go
  const coopGameKey = gameKeyForTitle(task.title)
  const [coopOpen, setCoopOpen] = useState(false)
  const heroAuto = useAutoAdvance(photos.length, HERO_ROTATE_MS)
  // Station cards: the timer waits for the station marshal's Start, as on the player's phone.
  const [stationStartedAt, setStationStartedAt] = useState<number | null>(null)
  const stationLocked = !!task.is_station && stationStartedAt === null
  const carouselIdx = heroAuto.idx
  const setCarouselIdx = heroAuto.go
  const [marshalInput, setMarshalInput] = useState('')
  const [marshalError, setMarshalError] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  // The demo keeps a submitted link on screen rather than sending it anywhere.
  // Escape the Mall: the answer belongs to the riddle the team drew, so it is
  // checked in the database rather than against anything held here.
  const [guess, setGuess] = useState('')
  const [guessBusy, setGuessBusy] = useState(false)
  const [guessWrong, setGuessWrong] = useState(0)
  const [riddleOk, setRiddleOk] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [linkSent, setLinkSent] = useState('')
  // Versus (demo): opponent picked from the sample groups, and the result.
  const [opponent, setOpponent] = useState('')
  const [versusWon, setVersusWon] = useState<boolean | null>(null)
  const [versusSent, setVersusSent] = useState(false)
  const [freeText, setFreeText] = useState('')
  const [freeTextSent, setFreeTextSent] = useState(false)
  const [photoSubmitted, setPhotoSubmitted] = useState(false)
  const [staged, setStaged] = useState<{ id: string; file: File; preview: string }[]>([])
  const inputs = effectiveInputs(task.task_type, task.completion_inputs)
  const [sentCount, setSentCount] = useState(0)
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const letterRefs = useRef<(HTMLInputElement | null)[][]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // A standalone AITB card (not opened via the bundle tile) still carries the
  // same interactive module — the demo has no per-team progress row for it,
  // so the result just lives in this component's own state.
  const { config: drawConfig } = useCardDrawConfig(task.id)
  const aitbBase = aitbByName(task.title)
  const aitbActivity = aitbBase
  const [aitbWords, setAitbWords] = useState<string[]>([])

  // Several typed questions (answer_blocks), checked here instead of in the database.
  const answerBlocks = useMemo(() => parseAnswerBlocks(task.answer_blocks), [task.answer_blocks])
  const blocksMode = !!inputs.answer && answerBlocks.length > 0
  const [blockValues, setBlockValues] = useState<string[]>([])
  const [blockResults, setBlockResults] = useState<boolean[] | null>(null)
  const [blocksOk, setBlocksOk] = useState(false)
  // A number with a floor (answer_min), like the player view: type the total, it must reach the floor.
  const numberMode = !!inputs.answer && task.answer_min != null
  const [numberValue, setNumberValue] = useState('')
  const [numberRejected, setNumberRejected] = useState<string | null>(null)
  const [numberOk, setNumberOk] = useState(false)
  const needsDrawnAnswer = !!(inputs.answer && !blocksMode && !task.answer_text && task.answer_min == null && drawConfig)
  // Text input with only a question: free text, approved by the demo marshal.
  const freeTextMode = !!(inputs.answer && !blocksMode && !task.answer_text && task.answer_min == null && !drawConfig)
  const drawnPrompt = needsDrawnAnswer ? (aitbWords[0] || '') : ''
  const riddleSolved = !needsDrawnAnswer || riddleOk

  const checkBlocks = () => {
    const norm = (v: string) => v.replace(/\s/g, '').toLowerCase()
    const res = answerBlocks.map((b, i) => {
      const v = (blockValues[i] ?? '').trim()
      return b.kind === 'number' ? v !== '' && Number(v) >= (b.min ?? 0) : norm(v) === norm(b.answer)
    })
    setBlockResults(res)
    if (res.every(Boolean)) {
      setBlocksOk(true); setBlockResults(null)
      if (!completed && !(inputs.photo || inputs.video || inputs.link || inputs.versus)) onComplete()
    }
  }

  /** The demo knows the floor, so it checks here what the real card asks the database. */
  const checkNumber = (): boolean => {
    const value = Number(numberValue.replace(/[,\s]/g, ''))
    if (numberValue.trim() === '' || !Number.isFinite(value)) return false
    if (value >= (task.answer_min ?? 0)) {
      setNumberOk(true); setNumberRejected(null)
      if (!completed && !(inputs.photo || inputs.video || inputs.link || inputs.versus)) onComplete()
      return true
    }
    setNumberRejected(numberValue)
    return false
  }
  // A number beside a photo/video has no Check button: Submit checks it first, as the player view does.
  const combinedCheck = numberMode && !!(inputs.photo || inputs.video) && !numberOk

  const checkDrawnAnswer = async () => {
    const typed = guess.trim()
    if (!typed || !drawnPrompt) return
    setGuessBusy(true)
    try {
      const { data, error } = await supabase.rpc('check_draw_answer', {
        p_task: task.id, p_prompt: drawnPrompt, p_guess: typed,
      })
      if (error) { alert('Could not check that answer: ' + error.message); return }
      if (data === true) { setRiddleOk(true); setGuess(''); setGuessWrong(0) }
      else setGuessWrong(n => n + 1)
    } finally {
      setGuessBusy(false)
    }
  }

  const [aitbStepsDone, setAitbStepsDone] = useState<number[]>([])
  // The demo has no check-in row to read a start time from, so the clock
  // starts the first time a card is opened and is kept for the session: leaving
  // and reopening a card carries on, as it does for a real team.
  const [now, setNow] = useState(Date.now())
  const openedAt = useMemo(() => {
    const known = cardClock.get(task.id)
    if (known) return known
    const t = Date.now()
    cardClock.set(task.id, t)
    return t
  }, [task.id])
  const finishedAt = useRef<number | null>(null)
  if (completed && finishedAt.current === null) finishedAt.current = Date.now()
  if (!completed) finishedAt.current = null

  useEffect(() => {
    if (completed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [completed])

  const toggleAitbStep = (i: number) => {
    if (completed) return
    setAitbStepsDone(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]))
  }

  const answerRows = inputs.answer && task.answer_text
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

  // A correct drawn answer finishes the card unless it also needs a file, link
  // or result - same rule as the real card page.
  useEffect(() => {
    if (riddleOk && !completed && !(inputs.photo || inputs.video || inputs.link || inputs.versus)) onComplete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riddleOk])

  // Clean up the local object URL preview
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  const focusLetter = (rowIdx: number, charIdx: number) => letterRefs.current[rowIdx]?.[charIdx]?.focus()

  const handlePhotoSelect = (file: File) => {
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
    setPhotoSubmitted(true)
  }

  const stageFiles = (files: File[]) => {
    const room = task.photo_multiple ? Infinity : 1
    setStaged(prev => {
      const next = [...prev]
      for (const file of files) {
        if (next.length >= room) break
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, preview: URL.createObjectURL(file) })
      }
      return next
    })
  }

  const unstage = (id: string) => {
    setStaged(prev => {
      const gone = prev.find(x => x.id === id)
      if (gone) URL.revokeObjectURL(gone.preview)
      return prev.filter(x => x.id !== id)
    })
  }

  // Photo/video + versus: one Submit sends the file and the result together.
  const combinedVersus = !!inputs.versus && !!(inputs.photo || inputs.video) && !versusSent && !photoSubmitted

  const submitStaged = () => {
    if (staged.length === 0 && !combinedVersus) return
    if (combinedCheck && !checkNumber()) return
    if (combinedVersus) setVersusSent(true)
    if (staged.length === 0) return
    // The demo keeps the last frame to show the marshal what arrived, then
    // clears the tray the way a real send does.
    setPhotoPreview(staged[staged.length - 1].preview)
    setSentCount(staged.length)
    staged.slice(0, -1).forEach(x => URL.revokeObjectURL(x.preview))
    setStaged([])
    setPhotoSubmitted(true)
  }

  // Same rule as the on-screen "Complete Challenge" button, reused by the remote.
  const isMarshalTask = task.task_type === 'standard' && !!task.require_marshal
  const marshalFilled = marshalInput.trim() === marshalPassword
  const doComplete = () => {
    if (hasOwnMechanism(task.completion_inputs)) return
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
    autoComplete: () => onComplete(),
    scroll: direction => scrollRef.current?.scrollBy({ top: direction === 'down' ? 400 : -400, behavior: 'smooth' }),
    scrollTo: frac => {
      const el = scrollRef.current
      if (!el) return
      const range = el.scrollHeight - el.clientHeight
      if (range <= 0) return
      const want = frac * range
      // Ignore sub-pixel noise, or mirroring fights the smooth scroll above.
      if (Math.abs(el.scrollTop - want) > 8) el.scrollTo({ top: want })
    },
  }))

  // Report the current step up so the controller renders the right buttons.
  const ownMechanism = hasOwnMechanism(task.completion_inputs)
  useEffect(() => {
    onStep?.({
      phase: showSplash ? 'splash' : 'main',
      pageIndex: currentPage,
      pageCount: pages.length,
      isMarshalTask,
      marshalFilled,
      ownMechanism,
      isStation: !!task.is_station,
    })
  }, [onStep, showSplash, currentPage, pages.length, isMarshalTask, marshalFilled, ownMechanism, task.is_station])

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
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          data-remote="closeTask"
          className="absolute top-5 left-5 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/25 hover:bg-black/35 text-white/90 text-sm font-bold backdrop-blur-sm transition-colors"
        >
          ← Back to Board
        </button>

        <div className="relative z-10 text-center px-8 animate-bounce-in">
          <div className="text-6xl mb-6">🎯</div>
          <p className="text-sm font-bold opacity-70 uppercase tracking-[0.2em] mb-2">
            {/challenge$/i.test((task.color ?? '').trim()) ? task.color : `${task.color} Challenge`}
          </p>
          <h1 className="text-5xl font-black tracking-tight mb-4 leading-tight">{task.title}</h1>
          <div className="w-16 h-1 bg-white/40 rounded-full mx-auto mb-6" />
          <p className="text-lg opacity-80 font-medium mb-2">Team: {teamName}</p>
        </div>

        <button
          data-remote="startChallenge"
          className="relative z-10 mt-8 px-10 py-4 bg-white/20 backdrop-blur-sm rounded-2xl text-xl font-black uppercase tracking-wider border-2 border-white/30 hover:bg-white/30 active:scale-95 transition-all animate-slide-up"
          style={{ animationDelay: '0.4s' }}
          onClick={(e) => { e.stopPropagation(); setShowSplash(false) }}
        >
          {task.is_station ? 'Open Card' : 'Start Challenge'}
        </button>
        <p className="relative z-10 mt-4 text-sm opacity-50 animate-pulse">{task.is_station ? 'Tap anywhere to open' : 'Tap anywhere to begin'}</p>
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
      ref={scrollRef} data-remote-card
      onScroll={e => {
        const el = e.currentTarget
        const range = el.scrollHeight - el.clientHeight
        onScrollFrac?.(range > 0 ? el.scrollTop / range : 0)
      }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: `color-mix(in srgb, ${task.hex_code} 50%, #0a0a0a)` }}
    >
      <ParticleBackground hexCode={task.hex_code} />

      <header className="px-6 py-5 text-white relative z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundColor: task.hex_code, opacity: 0.35 }} />
        <div className="absolute inset-0 bg-black/30" />
        <div className={`${containerMaxW} mx-auto relative z-10 flex flex-wrap items-start justify-between gap-x-4 gap-y-3`}>
          <div className="flex items-start gap-3">
            <button
              onClick={onClose} data-remote="closeTask"
              className="mt-1 flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white/80 hover:text-white text-xs font-bold transition-colors"
            >
              ← Board
            </button>
            <LanguageToggle className="mt-1 flex-shrink-0" />
          </div>
          <div className="w-full">
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
      </header>

      <main className={`${containerMaxW} mx-auto px-6 py-8 relative z-10`}>
        {/* Hero photos: current one centred, neighbours peeking in. */}
        <HeroCarousel photos={photos} index={carouselIdx} onGo={setCarouselIdx} hexCode={task.hex_code} title={task.title} />

        {/* People needed and where to play: under the hero image, above the instructions. */}
        <CardNeeds task={task} hexCode={task.hex_code} mapsHref={task.maps_url ? normalizeUrl(task.maps_url) : null} />


        {/* Bonus timer — every card, from the moment the team opens it. */}
        {!chain.locked && stationLocked && (
          <CardBonusTimer elapsedMs={0} window={resolveBonusWindow(task, bonusDefaults)} basePoints={task.points ?? 0} completed={false}
            waiting="marshal" onStart={observer ? undefined : () => setStationStartedAt(Date.now())} />
        )}
        {!chain.locked && !stationLocked && (
          <CardBonusTimer
            elapsedMs={Math.max(0, (completed ? (finishedAt.current ?? now) : now) - (stationStartedAt ?? openedAt))}
            window={resolveBonusWindow(task, bonusDefaults)}
            basePoints={task.points ?? 0}
            completed={completed}
          />
        )}

        {/* AI Team Building brief — a live bonus bar, the real description
            + skill tag, then the module and a tickable mission checklist
            instead of swipeable instruction pages. */}
        {!chain.locked && !stationLocked && coopGameKey && (
          <SampleCoopPlay gameKey={coopGameKey} color={task.hex_code} observer={observer} completed={completed}
            onSolved={onComplete} onOpenChange={setCoopOpen} />
        )}

        {coopOpen ? null : aitbActivity ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-1 rounded-lg text-xs font-black uppercase" style={{ background: `${aitbActivity.color}22`, color: aitbActivity.color }}>
                {aitbActivity.difficulty}
              </span>
              {completed && (
                <span className="px-2 py-1 rounded-lg text-xs font-black bg-emerald-400/20 text-emerald-300">✓ Completed</span>
              )}
            </div>
            <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
              <h2 className="text-white font-black text-lg mb-2">{aitbActivity.tagline}</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{aitbActivity.description}</p>
              <p className="text-gray-500 text-xs font-black uppercase tracking-wide mt-3">{aitbActivity.skillTag}</p>
            </div>
          </>
        ) : pages.length > 0 ? (
          <SwipeablePages currentPage={currentPage} total={pages.length} onChange={setCurrentPage} onInteract={pagesAuto.stop}>
            <InstructionPage key={currentPage} page={pages[currentPage]} hexCode={task.hex_code} />
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


        {/* A worked sample for the cards that are really camera tricks. */}
        <CardSample title={task.title} color={task.hex_code} taskId={task.id} />


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
        <ChainTrail hex={task.hex_code} steps={chain.trail ?? []} currentId={task.id} onOpen={id => { const t = chain.trail?.find(x => x.id === id); if (t) onJump(t.task) }} />

        {/* Helpful links — plus the chain's neighbours, as on the player
            view. In-app hops go through onJump so the demo swaps cards
            without leaving the page. */}
        {(() => {
          const items: LinkItem[] = [...links]
          return items.length > 0 && (
            <div className="mt-8 animate-slide-up">
              <TaskLinkButtons links={items} hexCode={task.hex_code} heading="Use these links to complete your tasks" />
            </div>
          )
        })()}

        {/* Observer notice */}
        {observer && (
          <div className="mt-8 p-4 rounded-2xl border-2 border-blue-400/40 bg-blue-400/10 text-center">
            <p className="text-blue-300 font-black text-sm">👁 Observer Mode — viewing only</p>
          </div>
        )}

        {/* Complete Activity */}
        {!observer && !stationLocked && <div className="mt-8 animate-slide-up">
          {chain.locked && chain.prev ? (
            <>
              <div className="p-5 rounded-3xl border-2 border-amber-400/50 bg-amber-400/10 text-center">
                <div className="text-4xl mb-2">🔒</div>
                <p className="text-amber-200 font-black text-base leading-snug">
                  {task.completion_warning || `Only teams that have completed ${chain.prev.title} can unlock ${task.title}.`}
                </p>
                <p className="text-white/50 text-xs font-bold mt-2">This card opens on its own once that one is approved.</p>
              </div>
              <button
                onClick={onClose} data-remote="closeTask"
                className="mt-3 w-full py-3 rounded-2xl text-white/70 font-bold border border-white/15 hover:bg-white/5 transition-colors"
              >
                ← Back to Board
              </button>
            </>
          ) : task.is_bundle ? (
            <>
              <DemoBundleCard task={task} marshalPassword={marshalPassword} />
              <button
                onClick={onClose} data-remote="closeTask"
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
                  onClick={onClose} data-remote="closeTask"
                  className="mt-5 w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                  style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                >
                  ← Back to Board
                </button>
              </div>
              <button
                data-remote="uncomplete"
                onClick={() => { onUncomplete(); setBlocksOk(false); setBlockValues([]); if (task.task_type === 'answer') setAnswerInputs(answerRows.map(() => '')) }}
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
                {task.task_type === 'standard' && !hasOwnMechanism(task.completion_inputs) && (
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
                            type="password" data-remote="fillMarshal"
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
                      data-remote="complete"
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

                {/* A number with a floor comes before the evidence: prove the count, then send the screenshots. */}
                {numberMode && !needsDrawnAnswer && (
                  <div className="mb-6">
                    {task.answer_question && (
                      <p className="text-white font-black text-lg mb-4 text-center leading-snug">{task.answer_question}</p>
                    )}
                    {numberOk ? (
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
                            onKeyDown={e => { if (e.key === 'Enter' && !combinedCheck) checkNumber() }}
                            placeholder="Enter the total" aria-label="Total"
                            className="flex-1 min-w-0 px-4 py-3 rounded-2xl border-2 text-center text-xl font-black focus:outline-none bg-white/10 text-white placeholder-white/30"
                            style={{ borderColor: numberRejected ? '#ef4444' : numberValue ? task.hex_code : 'rgba(255,255,255,0.2)' }}
                          />
                          {!combinedCheck && (
                            <button
                              onClick={() => checkNumber()}
                              disabled={!numberValue.trim()}
                              className="px-5 rounded-2xl font-black uppercase tracking-wider text-sm transition-all active:scale-95 disabled:opacity-40"
                              style={{ background: task.hex_code, color: '#000' }}
                            >
                              Check
                            </button>
                          )}
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

                {/* Photo: submit → marshal approve (demo) */}
                {(inputs.photo || inputs.video) && !riddleSolved && drawnPrompt && (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/15 text-center">
                    <div className="text-2xl mb-1">🔒</div>
                    <p className="text-white/60 text-sm font-bold">
                      Answer the riddle first — then you can send your clip.
                    </p>
                  </div>
                )}

                {(inputs.photo || inputs.video) && riddleSolved && (
                  <>
                    <p className="text-white font-black text-lg text-center mb-4">{fileHeading(inputs)}</p>
                    <p className="text-white/50 text-sm text-center mb-5">
                      {task.photo_multiple
                        ? `Add all your ${fileNoun(inputs, true)} first, then press Submit once. You can't add more after sending.`
                        : 'A marshal will review and approve your submission.'}
                    </p>
                    {/* Same tray as the player view: files are held here, can be
                        removed, and only leave on Submit. */}
                    {photoSubmitted && staged.length === 0 && (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center mb-4">
                        {photoPreview && (task.task_type === 'video'
                          ? <video src={photoPreview} controls className="w-full max-h-56 object-cover rounded-xl mb-3 bg-black" />
                          : <img src={photoPreview} alt="submission" className="w-full max-h-56 object-cover rounded-xl mb-3" />)}
                        <div className="text-3xl mb-2">⏳</div>
                        <p className="text-green-300 font-black">
                          {sentCount > 1
                            ? `${sentCount} files submitted!`
                            : `${fileNoun(inputs).replace(/^./, (c: string) => c.toUpperCase())} submitted!`}
                        </p>
                        <p className="text-green-300/60 text-sm mt-1 mb-3">Waiting for marshal review</p>
                        <button
                          onClick={onComplete}
                          className="w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                          style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                        >
                          👮 Approve as marshal (demo)
                        </button>
                      </div>
                    )}

                    {!photoSubmitted && (
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
                                className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black hover:bg-red-600 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          ))}

                          {(task.photo_multiple || staged.length === 0) && (
                            <label className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm cursor-pointer hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all aspect-square">
                              <span className="text-3xl">{fileEmoji(inputs)}</span>
                              <span className="text-center px-2 leading-tight">
                                {staged.length === 0 ? `Add a ${fileNoun(inputs)}` : 'Add more'}
                              </span>
                              <input
                                type="file"
                                accept={fileAccept(inputs) ?? 'image/*'}
                                multiple={task.photo_multiple ?? false}
                                className="hidden"
                                onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; stageFiles(files) }}
                              />
                            </label>
                          )}
                        </div>

                        {inputs.video && (
                          <p className="text-white/40 text-xs font-bold text-center mt-3">Max 100 MB per clip</p>
                        )}

                        {(staged.length > 0 || combinedVersus) && (() => {
                          const fileRequired = isCompulsory(inputs.photo) || isCompulsory(inputs.video)
                          const missingFile = combinedVersus && fileRequired && staged.length === 0
                          const missingVersus = combinedVersus && (!opponent || versusWon === null)
                          const parts = [
                            staged.length > 0 ? `${staged.length} ${fileNoun(inputs, staged.length !== 1)}` : null,
                            combinedVersus ? 'result' : null,
                          ].filter(Boolean).join(' + ')
                          const forApproval = inputKinds(inputs).some(k => inputs[k] === 'required') ? ' for approval' : ''
                          return (
                            <button
                              onClick={submitStaged}
                              disabled={missingFile || missingVersus || (combinedCheck && !numberValue.trim())}
                              className="w-full mt-4 py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                              style={{ backgroundColor: task.hex_code, color: '#000' }}
                            >
                              {missingFile ? `Add your ${fileNoun(inputs)} to submit`
                                : missingVersus ? 'Pick the team and result to submit'
                                : `Submit ${parts}${forApproval}`}
                            </button>
                          )
                        })()}
                      </>
                    )}
                  </>
                )}

                {/* Versus: who they battled and how it went — same fields as
                    the player view, approved with the demo marshal button. */}
                {inputs.versus && (
                  <div className="mb-6">
                    <p className="text-white font-black text-lg text-center mb-1">⚔️ Who did you battle?</p>
                    <p className="text-white/50 text-sm text-center mb-4">Pick the team and the result - the admin approves it.</p>
                    {versusSent ? (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                        <div className="text-3xl mb-2">⏳</div>
                        <p className="text-green-300 font-black">Result submitted!</p>
                        <p className="text-green-300/60 text-xs mt-1 mb-3">vs {opponent} · {versusWon ? 'won' : 'lost'} · waiting for admin review</p>
                        <button
                          onClick={onComplete}
                          className="w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                          style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                        >
                          👮 Approve as marshal (demo)
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <select
                          value={opponent}
                          onChange={e => setOpponent(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white text-sm font-bold focus:outline-none focus:border-white/50"
                        >
                          <option value="" className="text-gray-900 bg-white">Select the team you battled…</option>
                          {DEMO_GROUPS.filter(g => g !== teamName).map(g => <option key={g} value={g} className="text-gray-900 bg-white">{g}</option>)}
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
                        {!combinedVersus && (
                          <button
                            onClick={() => setVersusSent(true)}
                            disabled={!opponent || versusWon === null}
                            className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                            style={{ backgroundColor: task.hex_code, color: '#000' }}
                          >
                            Submit result for approval
                          </button>
                        )}
                        <p className="text-white/40 text-xs font-bold text-center">
                          Only the team that started the challenge sends this.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Free-text answer: a question with nothing to match against. */}
                {freeTextMode && (
                  <div className="mb-6">
                    {task.answer_question && (
                      <p className="text-white font-black text-lg mb-1 text-center leading-snug">{task.answer_question}</p>
                    )}
                    <p className="text-white/50 text-sm text-center mb-4">Write your answer - the admin reads and approves it.</p>
                    {freeTextSent ? (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                        <div className="text-3xl mb-2">⏳</div>
                        <p className="text-green-300 font-black">Answer submitted!</p>
                        <p className="text-green-300/60 text-xs mt-1 mb-3 whitespace-pre-wrap">“{freeText.trim()}”</p>
                        <button
                          onClick={onComplete}
                          className="w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                          style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                        >
                          👮 Approve as marshal (demo)
                        </button>
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
                        <button
                          onClick={() => setFreeTextSent(true)}
                          disabled={!freeText.trim()}
                          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                          style={{ backgroundColor: task.hex_code, color: '#000' }}
                        >
                          Submit answer for approval
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Answer: letter boxes */}
                {/* Link: paste where the thing you built lives */}
                {inputs.link && (
                  <>
                    <p className="text-white font-black text-lg text-center mb-4">🔗 Submit Your Link</p>
                    <p className="text-white/50 text-sm text-center mb-5">
                      Paste the address of what you built — a marshal opens it and approves.
                    </p>
                    {linkSent ? (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                        <div className="text-3xl mb-2">⏳</div>
                        <p className="text-green-300 font-black">Link submitted!</p>
                        <p className="text-green-300/60 text-xs mt-1 mb-3 break-all">{linkSent}</p>
                        <button
                          onClick={onComplete}
                          className="w-full py-3 rounded-2xl text-white font-black uppercase tracking-wider transition-all active:scale-95"
                          style={{ backgroundColor: task.hex_code, boxShadow: `0 4px 0 ${task.hex_code}88` }}
                        >
                          👮 Approve as marshal (demo)
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <input
                          type="url"
                          inputMode="url"
                          value={linkValue}
                          onChange={e => setLinkValue(e.target.value)}
                          placeholder="https://…"
                          className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/25 text-white placeholder-white/30 text-sm font-bold focus:outline-none focus:border-white/50"
                        />
                        <button
                          onClick={() => {
                            const url = linkValue.trim()
                            if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
                              alert('That does not look like a link. It should start with https:// and point somewhere.')
                              return
                            }
                            setLinkSent(url)
                          }}
                          disabled={!linkValue.trim()}
                          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                          style={{ backgroundColor: task.hex_code, color: '#000' }}
                        >
                          Submit link for approval
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
                    {riddleOk ? (
                      <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center mb-4">
                        <div className="text-3xl mb-2">✅</div>
                        <p className="text-green-300 font-black">Cracked it!</p>
                        {(inputs.photo || inputs.video) && (
                          <p className="text-green-300/60 text-sm mt-1">
                            Now film your reaction at the place — doing what the riddle describes.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 mb-4">
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

                {blocksMode && (
                  <div className="mb-6 flex flex-col gap-4">
                    {blocksOk ? (
                      <>
                        <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                          <p className="text-green-300 font-black">✓ All answers correct</p>
                        </div>
                        {/* The real card hands each team its own box code from the card's pool. */}
                        {/passcode/i.test(task.title) && (
                          <div className="p-4 rounded-2xl bg-green-400/15 border border-green-400/40 text-center">
                            <p className="text-green-300 text-xs font-black uppercase tracking-widest mb-1">Correct! Your passcode</p>
                            <p className="text-white text-4xl font-black tracking-[0.35em] pl-[0.35em] tabular-nums" translate="no">193</p>
                            <p className="text-green-300/70 text-xs font-bold mt-2">Use it to open the box.</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {answerBlocks.map((b, i) => {
                          const wrong = blockResults != null && blockResults[i] === false
                          return (
                            <div key={b.id}>
                              {b.question && (
                                <p className="text-white font-black text-base mb-2 leading-snug">
                                  {answerBlocks.length > 1 && <span className="text-white/50 mr-1.5">{i + 1}.</span>}{b.question}
                                </p>
                              )}
                              <input
                                type="text" inputMode={b.kind === 'number' ? 'numeric' : 'text'} autoComplete="off"
                                value={blockValues[i] ?? ''}
                                onChange={e => { const v = e.target.value; setBlockValues(prev => { const n = [...prev]; n[i] = v; return n }); setBlockResults(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') checkBlocks() }}
                                placeholder={b.kind === 'number' ? 'Enter a number' : 'Type your answer'}
                                className={`w-full px-4 py-3 rounded-2xl bg-white/10 border-2 text-white placeholder-white/30 text-sm font-bold focus:outline-none ${wrong ? 'border-red-400/70' : 'border-white/25 focus:border-white/50'}`}
                              />
                              {wrong && <p className="text-red-300 text-xs font-bold mt-1">Not right yet</p>}
                            </div>
                          )
                        })}
                        <button
                          onClick={checkBlocks}
                          disabled={answerBlocks.some((_, i) => !(blockValues[i] ?? '').trim())}
                          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                          style={{ backgroundColor: task.hex_code, color: '#000' }}
                        >
                          {answerBlocks.length > 1 ? 'Check my answers' : 'Check my answer'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {inputs.answer && !freeTextMode && !blocksMode && !numberMode && !needsDrawnAnswer && (
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
                  onClick={onClose} data-remote="closeTask"
                  className="mt-5 w-full py-3 rounded-2xl text-white/70 font-bold text-sm uppercase tracking-wider border border-white/20 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                >
                  ← Back to Board
                </button>
              </div>

              {/* Optional evidence photo for tasks that don't already collect media */}
              {!hasOwnMechanism(task.completion_inputs) && !inputs.photo && !inputs.video && !inputs.link && !inputs.versus && (
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
        </div>}
      </main>
    </div>
  )
})

// ── Main Page ─────────────────────────────────────────────────────────────────

// Entry point:
//   ?remote=<code> → the phone controller
//   otherwise      → the normal sample view, which doubles as the "projector"
export function BingoDashSample() {
  const params = new URLSearchParams(window.location.search)
  const remoteCode = params.get('remote')
  return remoteCode ? <SampleController code={remoteCode} /> : <SampleProjector />
}

// Quick BINGO: five presses, one row per press, top to bottom — so the board
// visibly fills a row at a time and the letters walk B → I → N → G → O.
//
// The fifth press fills the board, which also closes the five columns and both
// diagonals: 8 new lines at once, so that team's line count jumps 4 → 12. The
// celebration still reads a single 'BINGO' (the popup queue collapses
// duplicates), and a full board scoring every line is what the demo is
// showing off, so the jump is the honest result rather than a glitch.
//
// An earlier version made the last press a single box closing one column, to
// keep strictly one line per press — but it left the bottom row unticked,
// which is wrong on screen. Ticking the row is what the room reads.
const QUICK_WIN_STEPS: number[][] = [
  [0, 1, 2, 3, 4],       // row 0 → B
  [5, 6, 7, 8, 9],       // row 1 → I
  [10, 11, 12, 13, 14],  // row 2 → N
  [15, 16, 17, 18, 19],  // row 3 → G
  [20, 21, 22, 23, 24],  // row 4 → O (fills the board)
]

// Board to come back to after "Reset demo" reloads the page.
const RESET_BOARD_KEY = 'sample_reset_board'

// ── Remote taps shown on the screen ───────────────────────────────────────────
// When the paired phone presses something, the screen shows the press first (a yellow ring round the
// button) and acts a moment later, so the room can see which
// button was pressed. The buttons are found through their data-remote markers.
const REMOTE_TAP_MS = 240

/** The name shown for a remote command, or null for ones that are not button presses (scrolling, typing). */
function remoteTapLabel(c: RemoteCommand): string | null {
  switch (c.action) {
    case 'join': return c.teamName
    case 'confirmJoin': return 'Join group'
    case 'cancelJoin': case 'joinNameBack': return 'Back'
    case 'joinNameNext': return 'Next'
    case 'leave': return 'Leave team'
    case 'openTask': return 'Open card'
    case 'closeTask': return 'Back to board'
    case 'complete': case 'submitComplete': case 'autoComplete': return 'Complete'
    case 'uncomplete': return 'Undo complete'
    case 'startChallenge': return 'Start challenge'
    case 'nextPage': return 'Next'
    case 'prevPage': return 'Back'
    case 'fillMarshal': return 'Marshal password'
    case 'quickWin': return 'Quick BINGO'
    case 'reset': return 'Reset demo'
    case 'setView': return c.view === 'scoreboard' ? 'Scoreboard' : 'Board'
    case 'selectBoard': return 'Switch board'
    case 'dismissPopup': return 'Continue'
    case 'setChat': return c.open ? 'Message' : 'Close message'
    case 'setInvite': return c.open ? 'Invite QR' : 'Close QR'
    case 'setJoinQr': return c.mode === 'off' ? 'Close QR' : c.mode === 'player' ? 'Player QR' : 'Observer QR'
    case 'setWaiting': return 'Waiting screen'
    case 'setObserver': return 'Observer view'
    case 'setLang': return c.lang === 'ms' ? 'BM' : 'EN'
    case 'uiClick': case 'uiFile': case 'uiTap': return c.label // typing (uiType) is not a press: it applies as it comes
    default: return null
  }
}

/** The button on this screen that a remote command stands for, if it is showing. */
function remoteTapTarget(c: RemoteCommand, tileIndex: number): HTMLElement | null {
  const marked = (name: string) =>
    [...document.querySelectorAll<HTMLElement>(`[data-remote="${name}"]`)].find(e => e.getClientRects().length > 0) ?? null
  switch (c.action) {
    case 'openTask': return tileIndex >= 0 ? document.querySelectorAll<HTMLElement>('.board-grid > *')[tileIndex] ?? null : null
    case 'join': return [...document.querySelectorAll<HTMLElement>('[data-remote="group"]')].find(e => e.dataset.group === c.teamName) ?? null
    case 'setView': return marked(c.view === 'scoreboard' ? 'viewScoreboard' : 'viewBoard')
    case 'setInvite': return c.open ? marked('invite') : null
    case 'setLang': return marked(`lang-${c.lang}`)
    case 'complete': case 'submitComplete': case 'autoComplete': return marked('complete')
    case 'uiClick': case 'uiFile': case 'uiTap': return controlRing(c.i, c.label)
    case 'confirmJoin': case 'cancelJoin': case 'joinNameNext': case 'joinNameBack': case 'closeTask': case 'uncomplete':
    case 'startChallenge': case 'nextPage': case 'prevPage': case 'fillMarshal': case 'quickWin': case 'setWaiting': case 'setObserver':
      return marked(c.action)
    default: return null
  }
}

/**
 * Show a remote press on this screen. The yellow ring is at full strength from the first frame and is removed
 * the moment the press is acted on (the returned function), so it can never sit over what the press just
 * changed. A press with no button to ring (Board, a QR toggle) shows a short label at the top instead, which
 * is clear of the card and the board.
 */
function showRemoteTap(el: HTMLElement | null, label: string): () => void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;'
  document.body.appendChild(layer)
  if (el) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    const ring = document.createElement('div')
    ring.style.cssText = `position:absolute;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;` +
      `border-radius:${getComputedStyle(el).borderRadius};border:3px solid #facc15;box-sizing:border-box;box-shadow:0 0 14px 3px rgba(250,204,21,.8);`
    layer.append(ring)
    if (!reduce) {
      ring.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' })
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: REMOTE_TAP_MS })
    }
    return () => layer.remove()
  }
  const pill = document.createElement('div')
  pill.textContent = `📱 Remote: ${label}`
  pill.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:calc(8px + env(safe-area-inset-top));' +
    'padding:6px 14px;border-radius:9999px;background:#facc15;color:#111827;font:800 13px/1.2 system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 14px rgba(0,0,0,.4);'
  layer.appendChild(pill)
  window.setTimeout(() => layer.remove(), 800)
  return () => {}
}

function SampleProjector() {
  // `?board=<sectionId>` lets the admin launch the demo pre-scoped to a
  // specific event's board (from the Run Event panel); when present it also
  // swaps the "← Hub" link for a way back to that event's admin page.
  const boardParam = new URLSearchParams(window.location.search).get('board')
  // A ?board= link is a shared demo of that one board: only it is loaded and
  // the picker is replaced by its name, so the viewer cannot switch boards.
  const locked = !!boardParam
  const ownerLabel = useOwnerLabel()
  // Read once at mount (not in the load effect, which StrictMode runs twice).
  const [resetBoard] = useState(() => {
    try { return sessionStorage.getItem(RESET_BOARD_KEY) } catch { return null }
  })

  const [sections, setSections] = useState<BingoSection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(false)

  const [teamName, setTeamName] = useState<string | null>(null)
  // Group picked on the join screen but not yet past "Enter Password".
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  // The join screen's name step. Pre-filled so a demo (or its remote) can just tap Next.
  const [joinName, setJoinName] = useState('Player')
  const [joinNamed, setJoinNamed] = useState(false)
  const [scanState, setScanState] = useState<ScanState>({})
  const [openTask, setOpenTask] = useState<BingoTask | null>(null)
  // Quick BINGO's own completion, tracked by SLOT rather than task id. A card
  // can legitimately sit in several boxes (see boardCards.ts), and scanState
  // is keyed by task id, so completing a repeated card there lights every box
  // it occupies. Quick BINGO is a demo trick that must always light exactly
  // the top row and nothing else, so it marks slots directly instead.
  const [quickWinSlots, setQuickWinSlots] = useState<Set<number>>(new Set())

  // What the big screen is showing: the bingo board or the scoreboard.
  const [view, setView] = useState<SampleView>('board')

  // Tiles the presenter has lit. Held on the board row so everyone who opens
  // the link sees the same board, and kept here rather than in BoardScreen,
  // which remounts on every board switch.
  const [glowMode, setGlowMode] = useState(false)

  // Someone else's change — another presenter, or the same one on their phone —
  // reaches this page without a reload.
  useEffect(() => {
    const channel = supabase
      .channel('sample-board-glow')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections' }, payload => {
        const row = payload.new as BingoSection
        setSections(prev => prev.map(s => (s.id === row.id ? { ...s, glow_slots: row.glow_slots } : s)))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Write through: the board row is the truth, and the local copy updates with
  // it so the tile lights the moment it is tapped.
  const setGlow = async (slots: number[]) => {
    if (!selectedId) return
    setSections(prev => prev.map(s => (s.id === selectedId ? { ...s, glow_slots: slots } : s)))
    // Awaited, not fired and forgotten: a Supabase query builder is lazy and
    // never sends the request unless something subscribes to it.
    const { error } = await supabase.rpc('set_section_glow', { p_section: selectedId, p_slots: slots })
    if (error) console.error('Could not save the lit tiles', error)
  }

  // Remote control: a code (generated on first "Remote" click) opens a broadcast
  // channel; a paired phone drives the state below via commands.
  //
  // The code lives in the URL as ?pair=<code>. Held only in React state it did
  // not survive a reload of the projector — the page came back on a different
  // channel while the phone, which has no way to know, went on showing
  // "Connected" and silently dropped every tap. Reading it back on mount means
  // a refreshed projector rejoins the channel the phone is already on.
  const [remoteCode, setRemoteCode] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('pair'),
  )
  const [showPair, setShowPair] = useState(false)
  const [showTryIt, setShowTryIt] = useState(false)
  // Live step of the open task detail, reported up so the phone shows the right
  // buttons (Start Challenge → pages → marshal password → Complete).
  const [detailStep, setDetailStep] = useState<DetailStep | null>(null)
  // Celebration on screen, mirrored to the paired phone.
  const [popup, setPopup] = useState<{ letters: string | null; queued: number }>({ letters: null, queued: 0 })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [joinQr, setJoinQr] = useState<JoinQrMode>('off')
  const [chatOpen, setChatOpen] = useState(false)
  const boardRef = useRef<BoardScreenHandle>(null)
  const detailRef = useRef<SampleTaskDetailHandle | null>(null)

  const selectedSection = sections.find(s => s.id === selectedId) ?? null
  // Card schedule, read here too so a locked card cannot be opened. Alerts are the board's job, not this page's.
  const { statusOf: schedOf } = useCardSchedules(selectedSection?.id, gridTasks, false)
  const marshalPassword = DEMO_MARSHAL_PASSWORD

  // Where this screen is scrolled to, as a fraction, so shared viewers can
  // follow. The open tile reports its own (it scrolls inside the overlay);
  // otherwise it is the page itself.
  const [scrollFrac, setScrollFrac] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const range = document.documentElement.scrollHeight - window.innerHeight
      setScrollFrac(range > 0 ? window.scrollY / range : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Opening or closing a tile swaps which element scrolls, and the new one
  // starts at the top. Without this reset the last fraction from the old one
  // leaks across and a viewer jumps to the middle of a tile nobody scrolled.
  useEffect(() => { setScrollFrac(0) }, [openTask?.id])

  // Load all boards once. Prefer the admin's active board as the initial pick.
  useEffect(() => {
    (async () => {
      const [{ data: secs }, { data: settings }] = await Promise.all([
        locked
          ? supabase.from('bingo_sections').select('*').eq('id', boardParam!)
          : supabase.from('bingo_sections').select('*').order('sort_order'),
        supabase.from('bingo_settings').select('active_section_id').eq('id', 'main').maybeSingle(),
      ])
      const list = (secs ?? []) as BingoSection[]
      setSections(list)
      const active = settings?.active_section_id
      try { sessionStorage.removeItem(RESET_BOARD_KEY) } catch { /* private mode */ }
      const initial = (resetBoard && list.find(s => s.id === resetBoard)?.id)
        ?? (boardParam && list.find(s => s.id === boardParam)?.id)
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
    cardClock.clear()
    setQuickWinSlots(new Set())
    setOpenTask(null)
    return () => { cancelled = true }
  }, [selectedId])

  // Presses taken so far — the phone shows this as 3/5 so the presenter knows
  // how many are left before BINGO.
  const quickWinRows = useMemo(
    () => QUICK_WIN_STEPS.filter(slots => slots.every(slot => quickWinSlots.has(slot))).length,
    [quickWinSlots],
  )

  const handleSelectBoard = (id: string) => { setSelectedId(id) }

  // Stable identity: BoardScreen reports on every popup change, and a fresh
  // callback each render would re-fire the effect that calls it.
  const handlePopupChange = useCallback((letters: string | null, queued: number) => {
    setPopup(prev => (prev.letters === letters && prev.queued === queued ? prev : { letters, queued }))
  }, [])

  // A full page reload, so nothing from the last run (open overlays, timers,
  // module state) can linger. The ?pair= code is in the URL, so a paired phone
  // picks the projector straight back up; the board on screen is carried over
  // via sessionStorage so a reset doesn't jump to a different board.
  const handleReset = () => {
    // Roulette-style modules (spin wheels) track their spin count in
    // localStorage, keyed per activity — "nothing is saved" for the demo
    // otherwise, but that one exception needs clearing explicitly or a
    // reset demo would still show wheels locked from the last run.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key?.startsWith('aitb_spins_')) localStorage.removeItem(key)
      }
      if (selectedId) sessionStorage.setItem(RESET_BOARD_KEY, selectedId)
    } catch { /* private mode — nothing to clear */ }
    window.location.reload()
  }

  const lang = useLang()
  // What a player sees before the host starts the game, and what an observer sees instead of a player.
  const [waiting, setWaiting] = useState(false)
  const [observer, setObserver] = useState(false)
  // What the open card has on screen that the phone can press, type into or tap (see lib/remoteControls).
  const [cardControls, setCardControls] = useState<RemoteControl[]>([])

  const handleOpenTask = (task: BingoTask) => {
    setScanState(prev => prev[task.id] ? prev : { ...prev, [task.id]: 'scanned' })
    setOpenTask(task)
  }

  const markComplete = (taskId: string) => setScanState(prev => ({ ...prev, [taskId]: 'completed' }))
  const markUncomplete = (taskId: string) => setScanState(prev => ({ ...prev, [taskId]: 'scanned' }))

  // Demo helper: each press completes the next ROW, so five presses walk the
  // board through B → I → N → G → O with a celebration at every step. Always
  // the same five rows on every board, so the demo is predictable regardless
  // of how a board is laid out.
  //
  // Tracked by slot (quickWinSlots), not scanState, so a card that also sits
  // in other boxes elsewhere on the board doesn't light those too.
  //
  const handleQuickWin = () => setQuickWinSlots(prev => {
    const step = QUICK_WIN_STEPS.findIndex(slots => slots.some(slot => !prev.has(slot)))
    if (step === -1) return prev
    const next = new Set(prev)
    QUICK_WIN_STEPS[step].forEach(slot => next.add(slot))
    return next
  })

  // ── Remote control wiring ──────────────────────────────────────────────────
  const snapshot = (): RemoteState => ({
    selectedId,
    locked,
    teamName,
    pendingGroup,
    joinName,
    joinNamed,
    scanState,
    openTaskId: openTask?.id ?? null,
    view,
    detail: openTask ? detailStep : null,
    popup: popup.letters,
    popupQueued: popup.queued,
    inviteOpen,
    joinQr,
    quickWinRows,
    chatOpen,
    waiting,
    observer,
    lang,
    controls: openTask ? cardControls : [],
    scroll: scrollFrac,
  })

  const applyCommand = (c: RemoteCommand) => {
    switch (c.action) {
      case 'selectBoard': if (!locked) handleSelectBoard(c.id); break
      case 'join': setPendingGroup(c.teamName); break // → "Enter Password" step
      case 'cancelJoin': setPendingGroup(null); break
      case 'setJoinName': setJoinName(c.name.slice(0, 40)); break
      case 'joinNameNext': if (joinName.trim()) setJoinNamed(true); break
      case 'joinNameBack': setJoinNamed(false); setPendingGroup(null); break
      case 'confirmJoin':
        if (pendingGroup) { setTeamName(pendingGroup); setPendingGroup(null) }
        break
      case 'leave': setTeamName(null); setPendingGroup(null); setJoinNamed(false); setOpenTask(null); break
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
      case 'autoComplete': detailRef.current?.autoComplete(); break
      case 'scroll':
        if (openTask && detailRef.current) detailRef.current.scroll(c.direction)
        else window.scrollBy({ top: c.direction === 'down' ? 400 : -400, behavior: 'smooth' })
        break
      case 'scrollTo': {
        // Phone-driven scroll: a fraction, so different screen heights still line up.
        const f = Math.min(1, Math.max(0, c.frac))
        if (openTask && detailRef.current) detailRef.current.scrollTo(f)
        else {
          const range = document.documentElement.scrollHeight - window.innerHeight
          if (range > 0) window.scrollTo({ top: f * range })
        }
        break
      }
      case 'dismissPopup': boardRef.current?.dismissPopup(); break
      case 'setInvite': boardRef.current?.setInvite(c.open); break
      case 'setChat': boardRef.current?.setChat(c.open); break
      case 'setJoinQr': setJoinQr(c.mode); break
      case 'setWaiting': setWaiting(c.on); setOpenTask(null); setView('board'); break
      case 'setObserver': setObserver(c.on); break
      case 'setLang': setLang(c.lang); break
      case 'uiClick': pressControl(c.i, c.label); break
      case 'uiType': typeControl(c.i, c.label, c.value); break
      case 'uiFile': void giveFile(c.i, c.label); break
      case 'uiTap': tapControl(c.i, c.label, c.x, c.y); break
      case 'requestState': sendState(snapshot()); break
    }
  }

  // A button press from the phone is shown on this screen first, then acted on REMOTE_TAP_MS later.
  // The timer runs the newest applyCommand, since it reads state (the name typed, the group picked...).
  const applyRef = useRef(applyCommand)
  applyRef.current = applyCommand
  const onRemoteCommand = (c: RemoteCommand) => {
    const label = remoteTapLabel(c)
    if (!label) { applyCommand(c); return }
    const tileIndex = c.action === 'openTask' ? buildBingoSlots(gridTasks).findIndex(t => t?.id === c.taskId) : -1
    const clear = showRemoteTap(remoteTapTarget(c, tileIndex), label)
    window.setTimeout(() => { clear(); applyRef.current(c) }, REMOTE_TAP_MS)
  }
  const { sendState } = useSampleRemote(remoteCode, { onCommand: onRemoteCommand })

  // Push a fresh snapshot to the paired phone on every meaningful change.
  useEffect(() => {
    if (!remoteCode) return
    sendState(snapshot())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteCode, selectedId, teamName, pendingGroup, joinName, joinNamed, scanState, openTask, view, detailStep, popup, inviteOpen, joinQr, quickWinRows, chatOpen, waiting, observer, lang, cardControls, scrollFrac, sendState])

  // The card's own controls change as it is played (a game starts, an answer is accepted), so look again
  // while a card is open and a phone is paired; state only changes when what was found did.
  useEffect(() => {
    if (!remoteCode || !openTask) { setCardControls(prev => (prev.length ? [] : prev)); return }
    const look = () => {
      const next = scanControls()
      setCardControls(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    look()
    const id = window.setInterval(look, 400)
    return () => window.clearInterval(id)
  }, [remoteCode, openTask])

  // Heartbeat. The phone cannot tell "nothing has changed" from "the projector
  // is gone", so the projector re-broadcasts its state every few seconds and
  // the phone treats silence as a disconnect. Cheap: one small broadcast on an
  // ephemeral channel, only while a remote is actually paired.
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  useEffect(() => {
    if (!remoteCode) return
    const id = setInterval(() => sendState(snapshotRef.current()), HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [remoteCode, sendState])

  const enableRemote = () => {
    setRemoteCode(prev => {
      if (prev) return prev
      const code = makeRemoteCode()
      // replaceState, not push: the pairing is a property of this screen, not
      // a place in history the presenter should be able to go "back" out of.
      const url = new URL(window.location.href)
      url.searchParams.set('pair', code)
      window.history.replaceState(null, '', url)
      return code
    })
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
        waiting={waiting}
        onToggleWaiting={() => { setWaiting(v => !v); setOpenTask(null); setView('board') }}
        observer={observer}
        onToggleObserver={() => setObserver(v => !v)}
        showViewToggle={sections.length > 0}
        backHref="/"
        backLabel="Hub"
        locked={locked}
        ownerLabel={ownerLabel}
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
          quickWinSlots={quickWinSlots}
        />
      ) : !teamName ? (
        <JoinScreen
          theme={normalizePlayerTheme(selectedSection?.player_theme)}
          selected={pendingGroup}
          onSelect={setPendingGroup}
          onJoin={name => { setTeamName(name); setPendingGroup(null) }}
          name={joinName} named={joinNamed} onName={setJoinName}
          onNameNext={() => setJoinNamed(true)} onNameBack={() => { setJoinNamed(false); setPendingGroup(null) }}
        />
      ) : waiting ? (
        <SampleWaiting theme={normalizePlayerTheme(selectedSection?.player_theme)} boardName={selectedSection?.name ?? ''} teamName={teamName} onBack={() => setWaiting(false)} />
      ) : tasksLoading ? (
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="text-gray-400 text-xl font-bold animate-pulse">Loading board…</div>
        </div>
      ) : (
        <BoardScreen
          observer={observer}
          key={selectedId ?? 'none'}
          teamName={teamName}
          gridTasks={gridTasks}
          scanState={scanState}
          quickWinSlots={quickWinSlots}
          section={selectedSection}
          glowSlots={new Set(selectedSection?.glow_slots ?? [])}
          glowMode={glowMode}
          onToggleGlowMode={() => setGlowMode(v => !v)}
          onToggleGlow={slot => {
            const lit = new Set(selectedSection?.glow_slots ?? [])
            if (!lit.delete(slot)) lit.add(slot)
            void setGlow([...lit].sort((a, b) => a - b))
          }}
          onClearGlow={() => { void setGlow([]) }}
          onOpenTask={handleOpenTask}
          onSwitchTeam={() => { setTeamName(null); setOpenTask(null) }}
          inviteUrl={selectedId
            ? `${window.location.origin}/bingo-dash/sample?board=${selectedId}`
            : `${window.location.origin}/bingo-dash/sample`}
          onShowScoreboard={() => setView('scoreboard')}
          ref={boardRef}
          onPopupChange={handlePopupChange}
          onInviteChange={setInviteOpen}
          onChatChange={setChatOpen}
        />
      )}

      {/* Card schedule: a locked card shows the lock screen, as on a player's phone. Nothing on the card can be reached. */}
      {openTask && view === 'board' && schedOf(openTask)?.locked && (
        <SampleScheduleLock task={openTask} sched={schedOf(openTask)!} onClose={() => setOpenTask(null)} />
      )}

      {openTask && view === 'board' && !schedOf(openTask)?.locked && (
        <SampleTaskDetail
          key={openTask.id}
          ref={detailRef}
          observer={observer}
          task={openTask}
          teamName={teamName ?? 'Sample Team'}
          marshalPassword={marshalPassword}
          completed={scanState[openTask.id] === 'completed'}
          bonusDefaults={selectedSection ?? undefined}
          chain={{
            prev: gridTasks.find(t => t.id === prereqResolver(gridTasks)(openTask)) ?? null,
            locked: (() => { const p = prereqResolver(gridTasks)(openTask); return !!p && scanState[p] !== 'completed' })(),
            next: gridTasks.find(t => prereqResolver(gridTasks)(t) === openTask.id) ?? null,
            trail: chainTrailOf(gridTasks, openTask, scanState),
          }}
          onJump={handleOpenTask}
          onComplete={() => markComplete(openTask.id)}
          onUncomplete={() => markUncomplete(openTask.id)}
          onClose={() => setOpenTask(null)}
          onStep={setDetailStep}
          onScrollFrac={setScrollFrac}
        />
      )}

      {showPair && remoteCode && (
        <RemotePairModal code={remoteCode} onClose={() => setShowPair(false)} />
      )}
      {showTryIt && (
        <TryItModal
          boardId={selectedId}
          onClose={() => setShowTryIt(false)}
          onShowScoreboard={() => setView('scoreboard')}
        />
      )}

      {joinQr !== 'off' && selectedSection?.slug && (
        <JoinQrOverlay slug={selectedSection.slug} boardName={selectedSection.name} role={joinQr} onClose={() => setJoinQr('off')} />
      )}
    </div>
  )
}

// ── Pairing / sharing modal (projector side) ──────────────────────────────────
// Shows the QR + code a phone scans. Same markup serves the phone remote and
// the audience "share screen" link - only the words and the query param differ,
// which is not worth a second copy of a QR, a code chip and a copy button.

function RemotePairModal({
  code, onClose, param = 'remote', title = '📡 Phone Remote',
  subtitle = 'Scan on a 2nd device to control this screen',
  codeLabel = 'Pairing code',
  footer = 'Keep this device on the projector. The phone becomes your remote — every tap here shows up on the big screen.',
}: {
  code: string
  onClose: () => void
  param?: 'remote' | 'watch'
  title?: string
  subtitle?: string
  codeLabel?: string
  footer?: string
}) {
  // VITE_APP_URL first in a real build: a QR pointing at localhost cannot be scanned from a phone,
  // which is the entire point of showing one. In the dev server the link stays on this page's own
  // address, so a remote opened from it runs the local code instead of the deployed one.
  const base = (!import.meta.env.DEV && import.meta.env.VITE_APP_URL) || window.location.origin
  const url = `${base.replace(/\/$/, '')}/bingo-dash/sample?${param}=${code}`
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
            <h3 className="text-lg font-black text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-light">&times;</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <QRCodeSVG value={url} size={220} level="H" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-bold">{codeLabel}</span>
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
          <p className="text-[11px] text-gray-400 text-center">{footer}</p>
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

function TryItModal({
  boardId, onClose, onShowScoreboard,
}: {
  boardId: string | null
  onClose: () => void
  onShowScoreboard: () => void
}) {
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
    <div className="fixed inset-0 bg-gray-950 z-[70] overflow-y-auto">
      <ParticleBackground />
      <button onClick={onClose}
        className="fixed top-5 right-5 z-10 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-bold transition-colors">
        <span className="text-lg leading-none">&times;</span> Close
      </button>

      <div className="relative z-[1] min-h-screen flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-4xl animate-bounce-in">
          <div className="text-center mb-10">
            <p className="text-pink-400 text-xs font-black uppercase tracking-[0.35em] mb-3">Bingo Dash · Live Demo</p>
            <h2 className="text-white text-4xl sm:text-6xl font-black tracking-tight">Scan to Play</h2>
            <p className="text-gray-400 text-sm sm:text-lg font-bold mt-3">
              Point your camera here — everyone gets their own board the moment they join
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12 justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-2xl flex-shrink-0">
              <QRCodeSVG value={url} size={280} level="H" />
            </div>

            <div className="flex flex-col gap-4 w-full max-w-sm">
              <div className="flex gap-3">
                <div className="flex-1 px-4 py-3 rounded-xl bg-purple-500/15 border border-purple-400/30">
                  <p className="text-purple-300 text-[10px] font-black uppercase tracking-wide">🔑 Team password</p>
                  <p className="text-white text-2xl font-black tracking-widest mt-0.5">{SAMPLE_TEAM_PASSWORD}</p>
                </div>
                <div className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/15">
                  <p className="text-yellow-400 text-[10px] font-black uppercase tracking-wide">🧑‍✈️ Marshal</p>
                  <p className="text-white text-2xl font-black tracking-widest mt-0.5">{DEMO_MARSHAL_PASSWORD}</p>
                </div>
              </div>

              <p className="text-gray-500 text-xs leading-relaxed">
                Each scan opens a private sandbox on that phone — its own join screen, its own board, its own BINGO.
                Nothing anyone does here is saved.
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2.5 bg-white/5 rounded-lg text-[11px] font-mono text-gray-400 break-all select-all border border-white/10">
                  {url}
                </div>
                <button onClick={copy}
                  className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                    copied ? 'bg-green-500/20 text-green-300 border border-green-400/40' : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="text-center mt-10">
            <button onClick={() => { onShowScoreboard(); onClose() }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold transition-colors">
              📊 Show the live scoreboard
            </button>
          </div>
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
  gridTasks, section, playedTeamName, scanState, quickWinSlots,
}: {
  gridTasks: BingoTask[]
  section: BingoSection | null
  playedTeamName: string | null
  scanState: ScanState
  /** Slots Quick BINGO lit. It marks by SLOT and never touches scanState, so
   *  without this the board fills up while the scoreboard still reads zero. */
  quickWinSlots: Set<number>
}) {
  const slots = buildBingoSlots(gridTasks)
  const orderedTasks = slots.filter((t): t is BingoTask => t !== null)
  const total = gridTasks.length

  // Resolve the lit slots to task ids, the same reconciliation the board does.
  const quickIds = new Set(
    [...quickWinSlots].map(i => slots[i]?.id).filter((id): id is string => !!id),
  )

  const rows = DEMO_GROUPS.map((name, idx) => {
    const isPlayed = name === playedTeamName
    const completedIds = isPlayed
      ? new Set([
          ...Object.entries(scanState).filter(([, v]) => v === 'completed').map(([k]) => k),
          ...quickIds,
        ])
      : new Set(orderedTasks.slice(0, Math.round((SCOREBOARD_PRESET[name] ?? 0.3) * total)).map(t => t.id))
    const bingos = completedBingoLines(slots, completedIds).length
    // Same rule the live scoreboard uses: each line lifts the running total as
    // it lands. The demo has no scan timestamps, so tiles replay in board
    // order — enough to show the mechanic on a pitch.
    const points = scoreWithBingoLines(
      gridTasks.filter(t => completedIds.has(t.id)).map(t => ({ id: t.id, points: t.points ?? 0, at: 0 })),
      slots,
    ).total
    const tasksDone = completedIds.size
    return { name, points, bingos, tasksDone, isPlayed, idx }
  })

  rows.sort((a, b) =>
    b.points - a.points || b.bingos - a.bingos || b.tasksDone - a.tasksDone || a.idx - b.idx)

  const rankColors = ['#fbbf24', '#cbd5e1', '#d97706']

  // Same backdrop the real scoreboard uses for this board: the Grab art for a
  // Grab board, the particle field otherwise.
  const grabLook = normalizePlayerTheme(section?.player_theme) === 'grab'

  return (
    <div className="relative min-h-[80vh]">
      {grabLook ? <PlayerBackdrop theme="grab" /> : <ParticleBackground />}
      <header className="relative z-10 px-4 sm:px-8 pt-6 sm:pt-8 pb-3">
        <div className="max-w-4xl mx-auto flex items-end justify-between gap-4">
          <div>
            <p className="text-purple-400 text-xs font-black uppercase tracking-[0.3em]">Bingo Dash</p>
            <h1 className="text-white text-3xl sm:text-5xl font-black tracking-tight mt-1">Scoreboard</h1>
            {section && <p className="text-gray-400 text-sm sm:text-lg font-bold mt-1">{section.name}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-gray-500 text-xs sm:text-sm font-bold whitespace-nowrap">{DEMO_GROUPS.length} teams competing</p>
            <JoinLinkButton slug={section?.slug} boardName={section?.name} />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-4 sm:px-8 pb-10">
        <div className="max-w-4xl mx-auto flex flex-col gap-2.5">
          <div className="grid grid-cols-[34px_minmax(0,1fr)_58px_54px_48px] sm:grid-cols-[64px_1fr_140px_140px_140px] gap-1.5 sm:gap-4 px-3 sm:px-6 text-gray-500 text-[10px] sm:text-xs font-black uppercase tracking-widest">
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
                className="grid grid-cols-[34px_minmax(0,1fr)_58px_54px_48px] sm:grid-cols-[64px_1fr_140px_140px_140px] gap-1.5 sm:gap-4 items-center px-3 sm:px-6 py-3 sm:py-4 rounded-2xl transition-all duration-500"
                style={{
                  background: row.isPlayed
                    ? 'linear-gradient(90deg, rgba(168,85,247,0.25) 0%, rgba(255,255,255,0.03) 100%)'
                    : isTop3
                      ? `linear-gradient(90deg, ${rankColor}22 0%, rgba(255,255,255,0.03) 100%)`
                      : 'rgba(255,255,255,0.04)',
                  border: row.isPlayed ? '1px solid rgba(168,85,247,0.6)' : isTop3 ? `1px solid ${rankColor}55` : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div className="text-xl sm:text-4xl font-black tabular-nums" style={{ color: rankColor }}>
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-lg sm:text-3xl font-black tracking-tight truncate">{row.name}</p>
                  {row.isPlayed && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-purple-500 text-white text-[9px] sm:text-[11px] font-black uppercase tracking-wider">You · live</span>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-white text-xl sm:text-4xl font-black tabular-nums">{Math.round(row.points * 10) / 10}</p>
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

// ── Phone remote ──────────────────────────────────────────────────────────────
// Loads at /bingo-dash/sample?remote=<code>. A controls-only panel for the demo screen: it draws no copy of
// the screen. The board is a grid of coloured squares, every other step is a big button, and a scroll rail
// moves the screen. State comes from the projector (RemoteState); commands go back to it. No DB writes.
//
// Layout: one phone-width column, centred on a laptop (a rounded "phone" with a soft backdrop around it),
// full width on a phone. header · body (controls + scroll rail) · footer (notices, popup, dock).
const SEND_MS = 100    // at most ~10 scroll messages a second

const remoteBtn = 'inline-flex items-center justify-center gap-1.5 min-h-[48px] px-2.5 whitespace-nowrap rounded-xl border text-sm font-black transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300'
const rTone = {
  plain: 'bg-white/10 text-gray-100 border-white/15 hover:bg-white/20',
  go: 'bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400',
  primary: 'bg-purple-500 text-white border-purple-400 hover:bg-purple-400',
  gold: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/40 hover:bg-yellow-400/30',
} as const
const bigBtn = 'w-full min-h-[60px] text-lg'

/** A tall rail the presenter drags to scroll the screen. The thumb follows the screen when it scrolls on its own. */
function ScrollRail({ frac, disabled, onFrac }: { frac: number; disabled: boolean; onFrac: (f: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const last = useRef(0)
  const fracAt = (e: React.PointerEvent) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.height <= 0) return 0
    return Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  }
  const move = (e: React.PointerEvent) => {
    const f = fracAt(e)
    setDrag(f)
    if (Date.now() - last.current >= SEND_MS) { last.current = Date.now(); onFrac(f) }
  }
  const shown = drag ?? frac
  return (
    <div
      role="slider" aria-label="Scroll the screen" aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)} tabIndex={disabled ? -1 : 0}
      onKeyDown={e => {
        if (disabled) return
        if (e.key === 'ArrowDown') { e.preventDefault(); onFrac(Math.min(1, shown + 0.1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); onFrac(Math.max(0, shown - 0.1)) }
      }}
      onPointerDown={e => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
      onPointerMove={e => { if (drag !== null) move(e) }}
      onPointerUp={e => { if (drag !== null) { onFrac(fracAt(e)); setDrag(null) } }}
      onPointerCancel={() => setDrag(null)}
      className={`flex-1 min-h-[96px] w-full rounded-xl bg-white/10 border border-white/15 touch-none select-none px-1.5 py-3 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300 ${disabled ? 'opacity-40' : ''}`}
    >
      <div ref={track} className="relative h-full">
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 rounded-full bg-white/20" />
        <div className="absolute left-0 right-0 h-8 -translate-y-1/2 rounded-lg bg-purple-400 border border-purple-200 shadow" style={{ top: `${shown * 100}%` }} />
      </div>
    </div>
  )
}

/** A text box on the card, mirrored on the phone. Typing goes across as it is typed; the screen's own value comes back when the box is not being used. */
function CardText({ c, off, send }: { c: RemoteControl; off: boolean; send: (c: RemoteCommand) => void }) {
  const [v, setV] = useState(c.value ?? '')
  const focused = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => { if (!focused.current) setV(c.value ?? '') }, [c.value])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const change = (next: string) => {
    setV(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => send({ action: 'uiType', i: c.i, label: c.label, value: next }), 120)
  }
  return (
    <label className="block">
      <span className="block mb-1 text-[11px] font-black uppercase tracking-wider text-gray-300">{c.label}</span>
      <input
        type="text" value={v} disabled={off || c.disabled} maxLength={c.maxLen} aria-label={c.label}
        inputMode={c.numeric ? 'numeric' : 'text'} autoComplete="off" autoCapitalize={c.maxLen && c.maxLen > 1 && c.label.toLowerCase().includes('word') ? 'characters' : 'off'}
        onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false }}
        onChange={e => change(e.target.value)}
        className="w-full min-h-[52px] px-3 rounded-xl bg-white/10 border-2 border-white/25 text-white text-base font-bold placeholder-white/30 focus:outline-none focus:border-yellow-300 disabled:opacity-40"
      />
    </label>
  )
}

/** The picture on the card, as a pad: tap where the demo screen should be tapped. */
function CardTap({ c, off, send }: { c: RemoteControl; off: boolean; send: (c: RemoteCommand) => void }) {
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => { if (!dot) return; const t = window.setTimeout(() => setDot(null), 700); return () => window.clearTimeout(t) }, [dot])
  return (
    <div>
      <span className="block mb-1 text-[11px] font-black uppercase tracking-wider text-gray-300">{c.label} <span className="normal-case tracking-normal text-gray-400">· tap the spot</span></span>
      <button
        type="button" disabled={off} aria-label={c.label}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width
          const y = (e.clientY - r.top) / r.height
          setDot({ x, y })
          send({ action: 'uiTap', i: c.i, label: c.label, x, y })
        }}
        className="relative block w-full overflow-hidden rounded-xl border-2 border-yellow-300/60 bg-black/40 cursor-crosshair disabled:opacity-40"
        style={c.image ? undefined : { aspectRatio: String(c.ratio ?? 1.5) }}
      >
        {c.image && <img src={c.image} alt="" draggable={false} className="block w-full h-auto pointer-events-none select-none" />}
        {dot && <span aria-hidden className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-yellow-300 pointer-events-none" style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }} />}
      </button>
    </div>
  )
}

/** The open card's own controls, as the demo screen has them right now. */
function CardControls({ controls, off, send }: { controls: RemoteControl[]; off: boolean; send: (c: RemoteCommand) => void }) {
  if (controls.length === 0) return null
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl p-3 bg-white/5 border border-white/15" aria-label="Controls on this card">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-300">On this card</p>
      {controls.map(c => {
        const key = `${c.kind}:${c.label}:${c.i}`
        if (c.kind === 'text') return <CardText key={key} c={c} off={off} send={send} />
        if (c.kind === 'tap') return <CardTap key={key} c={c} off={off} send={send} />
        if (c.kind === 'select') return (
          <label key={key} className="block">
            <span className="block mb-1 text-[11px] font-black uppercase tracking-wider text-gray-300">{c.label}</span>
            <select
              value={c.value} disabled={off || c.disabled} aria-label={c.label}
              onChange={e => send({ action: 'uiType', i: c.i, label: c.label, value: e.target.value })}
              className="w-full min-h-[52px] px-3 rounded-xl bg-white/10 border-2 border-white/25 text-white text-base font-bold focus:outline-none focus:border-yellow-300 disabled:opacity-40"
            >
              {(c.options ?? []).map(o => <option key={o} value={o} className="text-black">{o}</option>)}
            </select>
          </label>
        )
        if (c.kind === 'file') return (
          <button key={key} disabled={off} aria-label={c.label} onClick={() => send({ action: 'uiFile', i: c.i, label: c.label })} className={`${remoteBtn} ${rTone.gold} w-full min-h-[52px]`}>📷 Add a demo photo</button>
        )
        const main = /^(play|start|submit|check|send|draw|deal|ready|join|roll|reveal|next round|go)\b/i.test(c.label)
        return (
          <button key={key} disabled={off || c.disabled} onClick={() => send({ action: 'uiClick', i: c.i, label: c.label })} className={`${remoteBtn} ${main ? rTone.go : rTone.plain} w-full min-h-[52px] whitespace-normal text-center leading-tight py-2`}>{c.label}</button>
        )
      })}
    </div>
  )
}

function SampleController({ code }: { code: string }) {
  const [sections, setSections] = useState<BingoSection[]>([])
  const [gridTasks, setGridTasks] = useState<BingoTask[]>([])
  const [state, setState] = useState<RemoteState | null>(null)

  // When the last state broadcast landed. The projector beats every HEARTBEAT_MS, so silence past
  // HEARTBEAT_TIMEOUT_MS means it is gone: reloaded, closed, or off the network.
  const [lastSeen, setLastSeen] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const { sendCommand } = useSampleRemote(code, {
    onState: s => { setState(s); setLastSeen(Date.now()) },
  })

  // Load board names once (for the picker labels).
  useEffect(() => {
    supabase.from('bingo_sections').select('*').order('sort_order').then(({ data }) => {
      setSections((data ?? []) as BingoSection[])
    })
  }, [])

  const live = lastSeen > 0 && now - lastSeen < HEARTBEAT_TIMEOUT_MS

  // Keep asking the projector to introduce itself whenever we are not hearing from it: on first open,
  // and again after it drops.
  const liveRef = useRef(live)
  liveRef.current = live
  useEffect(() => {
    sendCommand({ action: 'requestState' })
    const iv = setInterval(() => {
      if (!liveRef.current) sendCommand({ action: 'requestState' })
    }, 2000)
    return () => clearInterval(iv)
  }, [sendCommand])

  const selectedId = state?.selectedId ?? null
  const ownerLabel = useOwnerLabel()

  // The projector's board, so the colours and tile taps map to the right tasks.
  useEffect(() => {
    if (!selectedId) { setGridTasks([]); return }
    let cancelled = false
    fetchBoardTasks(selectedId).then(tasks => { if (!cancelled) setGridTasks(tasks) })
    return () => { cancelled = true }
  }, [selectedId])

  // Had a state at some point AND still hearing beats.
  const connected = !!state && live
  const off = !connected
  const teamName = state?.teamName ?? null
  const pendingGroup = state?.pendingGroup ?? null
  const screenName = state?.joinName ?? 'Player'
  const joinNamed = state?.joinNamed ?? false
  // What this phone has typed but the screen has not echoed back yet, so fast typing never flickers.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  useEffect(() => { if (nameDraft !== null && nameDraft === screenName) setNameDraft(null) }, [nameDraft, screenName])
  const joinName = nameDraft ?? screenName
  const scanState = state?.scanState ?? {}
  const openTaskId = state?.openTaskId ?? null
  const openTaskObj = gridTasks.find(t => t.id === openTaskId) ?? null
  const view = state?.view ?? 'board'
  const detail = state?.detail ?? null
  const popup = state?.popup ?? null
  const popupQueued = state?.popupQueued ?? 0
  const inviteOpen = state?.inviteOpen ?? false
  const joinQr: JoinQrMode = state?.joinQr ?? 'off'
  const quickWinRows = state?.quickWinRows ?? 0
  const chatOpen = state?.chatOpen ?? false
  const waiting = state?.waiting ?? false
  const observer = state?.observer ?? false
  const section = sections.find(x => x.id === selectedId) ?? null
  // Quick BINGO lights whole rows by SLOT, not by scanState (see handleQuickWin), and the snapshot carries
  // only the row count, so rebuild the lit slots from it.
  const quickSlots = new Set(QUICK_WIN_STEPS.slice(0, quickWinRows).flat())
  const slots = buildBingoSlots(gridTasks)

  const [sheet, setSheet] = useState<'none' | 'qr' | 'more'>('none')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1200)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const send = (c: RemoteCommand) => { if (connected) sendCommand(c) }

  // ── Body: one panel per step ──
  const panelTitle = (text: string, sub?: string) => (
    <div className="text-center mb-4">
      <h1 className="text-[clamp(1.35rem,6vw,1.75rem)] font-black text-white leading-tight">{text}</h1>
      {sub && <p className="text-sm text-gray-400 font-bold mt-1">{sub}</p>}
    </div>
  )
  const linkBtn = 'min-h-[44px] px-3 text-sm font-bold text-purple-300 underline underline-offset-4 disabled:opacity-40'

  const groups = [...DEMO_GROUPS].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const joinPanel = pendingGroup ? (
    // Password step: the sample password is already filled in on the screen, so it is one tap.
    <div className="flex flex-col gap-3">
      {panelTitle(`Join ${pendingGroup}`, `Password ${SAMPLE_TEAM_PASSWORD} is filled in`)}
      <button disabled={off} onClick={() => send({ action: 'confirmJoin' })} className={`${remoteBtn} ${rTone.primary} ${bigBtn}`}>Join group →</button>
      <button disabled={off} onClick={() => send({ action: 'cancelJoin' })} className={linkBtn}>← Pick another group</button>
    </div>
  ) : !joinNamed ? (
    // Name step: "Player" is filled in, so it is one tap. Change it if you like.
    <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); if (joinName.trim()) send({ action: 'joinNameNext' }) }}>
      {panelTitle("What's your name?", 'Filled in for you. Change it if you like.')}
      <input
        type="text" value={joinName} maxLength={40} aria-label="Your name" autoComplete="off" enterKeyHint="next"
        onChange={e => { setNameDraft(e.target.value); send({ action: 'setJoinName', name: e.target.value }) }}
        className="w-full min-h-[56px] px-4 rounded-xl bg-white/10 border-2 border-white/20 focus:border-purple-400 focus:outline-none text-center text-lg font-bold text-white"
      />
      <button type="submit" disabled={off || !joinName.trim()} className={`${remoteBtn} ${rTone.primary} ${bigBtn}`}>Next →</button>
    </form>
  ) : (
    <div className="flex flex-col gap-2">
      {panelTitle('Pick a group', `Hi ${joinName.trim()}!`)}
      {groups.map(g => (
        <button key={g} disabled={off} onClick={() => { showToast('Opening on screen…'); send({ action: 'join', teamName: g }) }}
          className={`${remoteBtn} ${rTone.plain} w-full min-h-[56px] text-base justify-start px-4`}>{g}</button>
      ))}
      <button disabled={off} onClick={() => send({ action: 'joinNameBack' })} className={linkBtn}>← Change name</button>
    </div>
  )

  const swatch = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-300">
      <span className={`w-3.5 h-3.5 rounded bg-gray-500 ${cls}`} aria-hidden="true" />{label}
    </span>
  )
  const boardPanel = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="Board">
        {slots.map((t, i) => {
          if (!t) return <div key={i} className="aspect-square rounded-xl border border-dashed border-white/15" aria-hidden="true" />
          const done = scanState[t.id] === 'completed' || quickSlots.has(i)
          const started = !done && scanState[t.id] === 'scanned'
          return (
            <button
              key={i} disabled={off || !!popup}
              aria-label={`${t.title}${done ? ', done' : started ? ', in progress' : ''}`}
              onClick={() => { showToast('Opening on screen…'); send({ action: 'openTask', taskId: t.id }) }}
              className={`aspect-square min-h-[44px] rounded-xl border-2 flex items-center justify-center text-xl font-black text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300 ${
                done ? 'border-white ring-2 ring-emerald-300' : started ? 'border-white animate-pulse' : 'border-black/30'}`}
              style={{ backgroundColor: t.hex_code }}
            >{done ? '✓' : ''}</button>
          )
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {swatch('', 'Not started')}
        {swatch('ring-2 ring-white animate-pulse', 'In progress')}
        {swatch('ring-2 ring-emerald-300', 'Done')}
      </div>
      <button disabled={off || !!popup || quickWinRows >= 5} onClick={() => send({ action: 'quickWin' })} className={`${remoteBtn} ${rTone.gold} w-full min-h-[52px]`}>
        ⚡ Quick BINGO <span className="tabular-nums">{quickWinRows}/5</span>
      </button>
    </div>
  )

  const cardDone = !!openTaskObj && scanState[openTaskObj.id] === 'completed'
  const step = cardDone ? 'Completed'
    : detail?.phase === 'splash' ? 'Intro screen'
    : detail && detail.pageCount > 1 ? `Page ${detail.pageIndex + 1} of ${detail.pageCount}`
    : 'On the card'
  const needMarshal = !!detail?.isMarshalTask && !detail.marshalFilled
  const cardPanel = openTaskObj ? (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 text-center border border-white/20" style={{ backgroundColor: openTaskObj.hex_code }}>
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">{step}</p>
        <h1 className="mt-1 text-[clamp(1.35rem,6vw,1.75rem)] font-black text-white leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.5)] break-words">{openTaskObj.title}</h1>
      </div>
      {cardDone ? (
        <button disabled={off} onClick={() => send({ action: 'uncomplete', taskId: openTaskObj.id })} className={`${remoteBtn} ${rTone.plain} ${bigBtn}`}>↺ Undo complete</button>
      ) : detail?.phase === 'splash' ? (
        <button disabled={off} onClick={() => send({ action: 'startChallenge' })} className={`${remoteBtn} ${rTone.go} ${bigBtn}`}>{detail.isStation ? '▶ Open card' : '▶ Start challenge'}</button>
      ) : (
        <>
          {detail?.isMarshalTask && !detail.marshalFilled && (
            <button disabled={off} onClick={() => send({ action: 'fillMarshal' })} className={`${remoteBtn} ${rTone.gold} ${bigBtn}`}>👮 Fill marshal {DEMO_MARSHAL_PASSWORD}</button>
          )}
          {detail && detail.pageCount > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <button disabled={off || detail.pageIndex <= 0} onClick={() => send({ action: 'prevPage' })} className={`${remoteBtn} ${rTone.plain} min-h-[56px] text-base`}>‹ Prev</button>
              <button disabled={off || detail.pageIndex >= detail.pageCount - 1} onClick={() => send({ action: 'nextPage' })} className={`${remoteBtn} ${rTone.plain} min-h-[56px] text-base`}>Next ›</button>
            </div>
          )}
          <CardControls controls={state?.controls ?? []} off={off} send={send} />
          {detail?.ownMechanism ? (
            // The card's own game or answer can be played from "On this card" above; this is the shortcut that just marks it done.
            <button disabled={off} onClick={() => send({ action: 'autoComplete' })} className={`${remoteBtn} ${rTone.go} ${bigBtn}`}>✓ Auto-complete</button>
          ) : (
            <button disabled={off || needMarshal} onClick={() => send({ action: 'submitComplete' })} className={`${remoteBtn} ${rTone.go} ${bigBtn}`}>✓ Complete</button>
          )}
        </>
      )}
      <button disabled={off} onClick={() => send({ action: 'closeTask' })} className={`${remoteBtn} ${rTone.plain} w-full min-h-[52px]`}>← Back to board</button>
    </div>
  ) : null

  const scoresPanel = (
    <div className="flex flex-col gap-3">
      {panelTitle('Scoreboard', 'It is on the screen now.')}
      <button disabled={off} onClick={() => send({ action: 'setView', view: 'board' })} className={`${remoteBtn} ${rTone.plain} ${bigBtn}`}>← Back to board</button>
    </div>
  )

  const body = !teamName ? joinPanel : view === 'scoreboard' ? scoresPanel : openTaskObj ? cardPanel : boardPanel

  // ── Footer: notices, celebration, dock ──
  const tab = (label: string, icon: string, on: boolean, onClick: () => void, extra = '', blocked = false) => (
    <button key={label} type="button" disabled={off || blocked} onClick={onClick} aria-pressed={on}
      className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] rounded-2xl text-[11px] font-black transition-colors active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300 ${extra} ${on ? 'text-purple-200 bg-purple-500/20' : 'text-gray-300'}`}>
      <span className="text-lg leading-none" aria-hidden="true">{icon}</span>{label}
    </button>
  )
  const dock = (
    <div className="grid grid-cols-5 gap-0.5 rounded-[20px] border border-white/10 backdrop-blur-xl p-1" style={{ background: 'rgba(17,20,30,.86)' }}>
      {tab('Board', '🎯', view === 'board', () => send({ action: 'setView', view: 'board' }))}
      {tab('Scores', '📊', view === 'scoreboard', () => send({ action: 'setView', view: 'scoreboard' }))}
      {tab(joinQr !== 'off' ? 'Close QR' : 'Join QR', '▦', joinQr !== 'off', () => (joinQr !== 'off' ? send({ action: 'setJoinQr', mode: 'off' }) : setSheet('qr')), joinQr !== 'off' ? '!text-emerald-200 !bg-emerald-500/20' : '')}
      {tab(inviteOpen ? 'Close QR' : 'Invite', '👥', inviteOpen, () => send({ action: 'setInvite', open: !inviteOpen }), inviteOpen ? '!text-emerald-200 !bg-emerald-500/20' : '', !teamName)}
      {tab('More', '⋯', sheet === 'more', () => setSheet('more'))}
    </div>
  )

  const sheetBody = sheet === 'none' ? null : (
    <div role="dialog" aria-modal="true" aria-label={sheet === 'qr' ? 'Join QR' : 'More controls'} onClick={() => setSheet('none')}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-gray-900 border-t border-purple-500/40 px-4 pt-4 flex flex-col gap-3"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <p className="text-white font-black text-base">{sheet === 'qr' ? 'Show a join QR on the screen' : 'More'}</p>
        {sheet === 'qr' ? (
          <div className="grid grid-cols-2 gap-2">
            {(['player', 'observer'] as const).map(r => (
              <button key={r} disabled={!section?.slug} onClick={() => { send({ action: 'setJoinQr', mode: r }); setSheet('none') }}
                className={`${remoteBtn} ${rTone.plain}`}>▦ {r === 'player' ? 'Player QR' : 'Observer QR'}</button>
            ))}
          </div>
        ) : (
          <>
            <div>
              <label className="text-[11px] text-gray-400 font-black uppercase tracking-wide">Board</label>
              {state?.locked ? (
                <p className="mt-1 text-white text-sm font-bold px-1 py-2">{sections.find(s => s.id === selectedId)?.name ?? 'This board'}</p>
              ) : (
                <select value={selectedId ?? ''} onChange={e => send({ action: 'selectBoard', id: e.target.value })}
                  className="w-full mt-1 min-h-[48px] bg-white/10 text-white text-base font-bold rounded-xl px-3 border border-white/15 focus:outline-none focus:border-emerald-400">
                  {sections.length === 0 && <option value="">No boards</option>}
                  {sections.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.name} — {ownerLabel(s)}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { send({ action: 'setWaiting', on: !waiting }); setSheet('none') }} className={`${remoteBtn} ${waiting ? rTone.go : rTone.plain}`}>⏳ {waiting ? 'End waiting' : 'Waiting screen'}</button>
              <button onClick={() => send({ action: 'setObserver', on: !observer })} className={`${remoteBtn} ${observer ? rTone.go : rTone.plain}`}>👁 {observer ? 'End observer' : 'Observer view'}</button>
            </div>
            {teamName && (
              <button onClick={() => send({ action: 'setChat', open: !chatOpen })} className={`${remoteBtn} ${chatOpen ? rTone.go : rTone.plain} w-full`}>{chatOpen ? '✕ Close message' : '💬 Message'}</button>
            )}
            {teamName && (
              <button onClick={() => { send({ action: 'leave' }); setSheet('none') }} className={`${remoteBtn} ${rTone.plain} w-full`}>👥 Leave team ({teamName})</button>
            )}
            <button onClick={() => { send({ action: 'reset' }); setSheet('none') }} className={`${remoteBtn} ${rTone.plain} w-full mt-2`}>↺ Reset demo</button>
          </>
        )}
        <button type="button" onClick={() => setSheet('none')} className={`${remoteBtn} ${rTone.plain} w-full`}>Close</button>
      </div>
    </div>
  )

  const railBtn = 'w-full min-h-[48px] rounded-xl border text-lg font-black bg-white/10 text-gray-100 border-white/15 active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300'

  return (
    // On a laptop the remote is a phone-sized card centred on a soft backdrop; on a phone it fills the screen.
    <div className="h-[100dvh] overflow-hidden text-white flex justify-center sm:items-center sm:p-4"
      style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(124,58,237,.28), transparent 65%), radial-gradient(80% 60% at 50% 100%, rgba(16,185,129,.18), transparent 65%), #030712' }}>
      <div className="flex flex-col w-full max-w-[520px] h-full sm:max-h-[860px] bg-gray-950 sm:rounded-3xl sm:border sm:border-white/15 sm:shadow-2xl overflow-hidden">
        <div className="border-b border-emerald-500/30 px-3 flex items-center gap-2 h-[52px] flex-shrink-0">
          <span className="px-2 py-1 rounded-lg bg-emerald-500 text-black text-[11px] font-black tracking-wider">📡 REMOTE</span>
          <span className="hidden min-[400px]:inline text-[11px] text-gray-400 font-bold tracking-[0.2em]">{code}</span>
          {/* Switches the language on the demo screen (it is kept per device, so the screen holds it). */}
          <div role="group" aria-label="Screen language" translate="no" className="ml-auto flex items-center rounded-full border border-white/20 bg-white/5 p-0.5">
            {(['en', 'ms'] as const).map(l => (
              <button key={l} type="button" disabled={off} onClick={() => send({ action: 'setLang', lang: l })}
                aria-pressed={(state?.lang ?? 'en') === l}
                aria-label={l === 'en' ? 'Screen in English' : 'Screen in Bahasa Malaysia'}
                className={`min-w-[44px] min-h-[44px] rounded-full text-xs font-black tracking-wider transition-colors active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-yellow-300 ${(state?.lang ?? 'en') === l ? 'bg-white text-gray-900' : 'text-gray-300'}`}>
                {l === 'en' ? 'EN' : 'BM'}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : state ? 'bg-red-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
            {connected ? 'Connected' : state ? 'Reconnecting' : 'Connecting…'}
          </span>
        </div>
        {state && !connected && (
          <div className="flex-shrink-0 bg-red-500/15 text-red-200 text-[11px] font-black text-center py-1">⚠ Lost the screen, reconnecting…</div>
        )}

        {!state ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
            <div className="text-4xl animate-pulse">📡</div>
            <p className="text-gray-300 font-bold">Looking for the screen…</p>
            <p className="text-gray-500 text-sm">Make sure the sample screen is open and shows <span className="text-emerald-300 font-bold">Paired</span>.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex gap-2 px-3 pt-3">
              <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain pb-3">{body}</div>
              {teamName && (
                <div className="w-14 flex-shrink-0 flex flex-col gap-2 pb-3" role="group" aria-label="Scroll the screen">
                  <button disabled={off} onClick={() => send({ action: 'scrollTo', frac: 0 })} aria-label="Scroll to top" className={railBtn}>⤒</button>
                  <button disabled={off} onClick={() => send({ action: 'scroll', direction: 'up' })} aria-label="Scroll up" className={railBtn}>▲</button>
                  <ScrollRail frac={state.scroll ?? 0} disabled={off} onFrac={f => send({ action: 'scrollTo', frac: f })} />
                  <button disabled={off} onClick={() => send({ action: 'scroll', direction: 'down' })} aria-label="Scroll down" className={railBtn}>▼</button>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col gap-2 px-3 pt-2 border-t border-white/10"
              style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
              {toast && <p role="status" className="rounded-xl bg-emerald-500 text-black text-xs font-black px-3 py-2 text-center">{toast}</p>}
              {popup && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-black text-purple-200 text-center">
                    🎉 On screen: <span className="text-white tracking-widest">{popup}!</span>{popupQueued > 0 && <span className="text-purple-300/80"> · {popupQueued} more to come</span>}
                  </p>
                  <button disabled={off} onClick={() => send({ action: 'dismissPopup' })} className={`${remoteBtn} ${rTone.primary} min-h-[56px] w-full text-base`}>▶ Tap to continue</button>
                </div>
              )}
              {off && <p className="text-xs text-gray-400 font-bold text-center">Taps will not land until the screen is back.</p>}
              {dock}
            </div>
          </>
        )}
        {sheetBody}
      </div>
    </div>
  )
}
