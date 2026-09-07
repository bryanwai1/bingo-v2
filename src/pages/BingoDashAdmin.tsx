import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import type { BingoTask, BingoTeam, BingoScan, BingoSettings, BingoSection, BingoCategory, BingoChallengeSection, BingoMember, BingoPhotoSubmission, BingoBoardCard, BingoDuel, BonusItem } from '../types/database'
import { BINGO_LINES, buildBingoSlots, completedBingoLines } from '../lib/bingoLines'
import { TileFace } from '../components/BingoTileFace'
import { SharedLibraryPanel } from '../components/SharedLibraryPanel'
import { SCOREBOARD_THEMES, getScoreboardTheme } from '../lib/scoreboardThemes'
import { Menu, MenuItem, MenuDivider } from '../components/AdminHeader'
import { AdminSection } from '../components/AdminSection'
import { AdminSidebar, type AdminView } from '../components/AdminSidebar'
import { activeFaces, faceName, faceColor, slotFor, normaliseFaceCount, TILES_PER_FACE } from '../lib/cubeFaces'
import { CubeBoard } from '../components/CubeBoard'
import { RunEventPanel, Step } from '../components/RunEventPanel'
import { CONTEST_GAMES, getContestGame } from '../lib/contestGames'
import { aitbByName } from '../lib/aitbActivities'
import { LED_HEX, LED_KEYS } from '../lib/ledColors'
import { duelBonusByTeam } from '../hooks/useBingoDuels'

// Sanitize a string into a filesystem-safe filename component.
function sanitizeForFilename(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'unknown'
}

function extFromUrl(url: string): string {
  const match = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)
  return match ? match[1].toLowerCase() : 'jpg'
}

function SubmissionThumb({ url, fill = false }: { url: string; fill?: boolean }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div
        className={`${fill ? "w-full aspect-square" : "w-28 h-28"} flex flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-[10px] font-bold flex-shrink-0 text-center px-2`}
        title="The photo file is missing from storage. The submission row can be deleted."
      >
        <span className="text-2xl mb-1">🚫</span>
        <span>Photo missing</span>
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={fill ? "block" : "flex-shrink-0"}>
      <img
        src={url}
        alt="submission"
        onError={() => setBroken(true)}
        className={`${fill ? "w-full aspect-square" : "w-28 h-28 rounded-lg border a-border"} object-cover hover:opacity-90 transition-opacity`}
      />
    </a>
  )
}

const PRESET_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Sky Blue', hex: '#38BDF8' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Fuchsia', hex: '#D946EF' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
]

// Mall Hunt acts. Acts are colour tags on individual cards (not their own
// category level) — see the "Mall Hunt" category in the Card Library.
const ACT_COLORS = [
  { name: 'Act 1 · Setup', hex: '#FF7F5C' },
  { name: 'Act 2 · The Hunt', hex: '#14A79A' },
  { name: 'Act 3 · The Mission', hex: '#6C63D9' },
  { name: 'Act 4 · Action', hex: '#E4536B' },
  { name: 'Act 5 · The Cut', hex: '#2E9E63' },
]

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// .in() filters with many ids can blow past URL limits — fetch in chunks.
async function fetchInChunks<T>(table: string, column: string, ids: string[]): Promise<T[]> {
  if (ids.length === 0) return []
  const CHUNK = 150
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase.from(table).select('*').in(column, ids.slice(i, i + CHUNK))
    if (data) out.push(...(data as T[]))
  }
  return out
}

// ── Import helpers ─────────────────────────────────────────────────────────────
interface ImportRow {
  title: string
  color: string
  hex_code: string
  clues: string[]
}

function parseImport(raw: string): ImportRow[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects')
  return parsed.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) throw new Error(`Item ${i + 1} is not an object`)
    const obj = item as Record<string, unknown>
    if (!obj.title || typeof obj.title !== 'string') throw new Error(`Item ${i + 1} missing "title"`)
    if (!obj.color || typeof obj.color !== 'string') throw new Error(`Item ${i + 1} missing "color"`)
    if (!obj.hex_code || typeof obj.hex_code !== 'string') throw new Error(`Item ${i + 1} missing "hex_code"`)
    const clues: string[] = []
    if (typeof obj.clue === 'string' && obj.clue.trim()) clues.push(obj.clue.trim())
    if (Array.isArray(obj.clues)) {
      for (const c of obj.clues) {
        if (typeof c === 'string' && c.trim()) clues.push(c.trim())
      }
    }
    return { title: obj.title.trim(), color: obj.color.trim(), hex_code: obj.hex_code.trim(), clues }
  })
}

// ── Color picker sub-form ──────────────────────────────────────────────────────
function ColorPicker({
  hex,
  colorName,
  onHexChange,
  onNameChange,
}: {
  hex: string
  colorName: string
  onHexChange: (h: string) => void
  onNameChange: (n: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-sm font-medium a-text-3 mb-1">Color Name</label>
        <input
          type="text"
          value={colorName}
          onChange={e => onNameChange(e.target.value)}
          placeholder="e.g. Blue"
          className="w-full px-3 py-2 rounded-lg border a-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium a-text-3 mb-2">Color</label>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {PRESET_COLORS.map(c => (
            <button
              key={c.hex}
              type="button"
              onClick={() => { onHexChange(c.hex); if (!colorName) onNameChange(c.name) }}
              className={`w-7 h-7 rounded-full border-2 transition-all ${hex === c.hex ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>
        <p className="text-[10px] font-black a-text-3 uppercase tracking-widest mb-1.5">Mall Hunt acts</p>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {ACT_COLORS.map(c => (
            <button
              key={c.hex}
              type="button"
              onClick={() => { onHexChange(c.hex); onNameChange(c.name) }}
              className={`px-2 h-7 rounded-full border-2 text-[10px] font-black text-white transition-all ${hex === c.hex ? 'border-gray-900 scale-105' : 'border-transparent'}`}
              style={{ backgroundColor: c.hex }}
              title={c.name}
            >
              {c.name.split(' ')[1]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={hex} onChange={e => onHexChange(e.target.value)} className="w-9 h-9 rounded cursor-pointer" />
          <input type="text" value={hex} onChange={e => onHexChange(e.target.value)} className="px-3 py-2 rounded-lg border a-border font-mono text-sm w-28" />
        </div>
      </div>
    </div>
  )
}

// ── Board tile (interactive editor with drag support) ──────────────────────────
function BoardTile({
  task,
  index,
  total,
  isDragOver,
  isBeingDragged,
  onMoveLeft,
  onMoveRight,
  onRemove,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
}: {
  task: BingoTask
  index: number
  total: number
  isDragOver: boolean
  isBeingDragged: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
  onRemove: () => void
  onEdit: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragLeave: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      className={`relative group aspect-square rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none transition-all duration-150 ${
        isBeingDragged ? 'opacity-40 scale-95' : ''
      } ${isDragOver ? 'ring-2 ring-white scale-105' : ''}`}
      style={{ backgroundColor: task.hex_code }}
    >
      {/* Drag-over highlight */}
      {isDragOver && (
        <div className="absolute inset-0 a-surface/30 z-30 rounded-lg pointer-events-none" />
      )}

      {/* Category badge */}
      {task.category && (
        <div className="absolute top-0.5 left-0.5 right-0.5 z-10 pointer-events-none">
          <span className="block text-[7px] bg-black/40 a-text rounded px-1 py-px truncate leading-tight font-bold">
            {task.category}
          </span>
        </div>
      )}

      {/* Title */}
      <div className="absolute inset-0 flex items-center justify-center p-1.5 pt-4">
        <p className="a-text font-black text-[9px] text-center leading-tight line-clamp-3 break-words">
          {task.title}
        </p>
      </div>

      {/* Hover controls */}
      <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col z-20">
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="text-base hover:scale-125 transition-transform"
            title="Edit tile"
          >
            ✏️
          </button>
        </div>
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <button
            onClick={e => { e.stopPropagation(); onMoveLeft() }}
            disabled={index === 0}
            className="a-text hover:a-text disabled:opacity-20 font-bold text-xs leading-none px-0.5"
            title="Move left"
          >
            ◀
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-red-300 hover:text-red-100 font-bold text-xs leading-none"
            title="Remove from grid"
          >
            ✕
          </button>
          <button
            onClick={e => { e.stopPropagation(); onMoveRight() }}
            disabled={index === total - 1}
            className="a-text hover:a-text disabled:opacity-20 font-bold text-xs leading-none px-0.5"
            title="Move right"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Category group block (used in Board tab gallery) ──────────────────────────
function CategoryGroupBlock({
  group,
  editingCategoryId, setEditingCategoryId,
  categories, scans, copiedId,
  boardCountByTask,
  navigate,
  saveCategoryInline, setBulkCategoryColor, setBulkCategoryPoints,
  renameCategoryByLabel,
  setQrTask, copyLink, duplicateTask, openTileEdit, deleteTask,
}: {
  group: { label: string; key: string; tasks: BingoTask[] }
  editingCategoryId: string | null
  setEditingCategoryId: (id: string | null) => void
  categories: BingoCategory[]
  scans: BingoScan[]
  copiedId: string | null
  boardCountByTask: Map<string, number>
  navigate: (path: string) => void
  saveCategoryInline: (taskId: string, cat: string) => void
  setBulkCategoryColor: (key: string, hex: string) => void
  setBulkCategoryPoints: (key: string, pts: number) => void
  renameCategoryByLabel: (label: string, newName: string) => void
  setQrTask: (t: BingoTask) => void
  copyLink: (id: string) => void
  duplicateTask: (t: BingoTask) => void
  openTileEdit: (t: BingoTask) => void
  deleteTask: (id: string, title: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div>
      {/* Category header */}
      <div className="flex items-center gap-3 mb-3">
        {renaming ? (
          <input
            type="text"
            autoFocus
            defaultValue={group.label}
            onBlur={e => { renameCategoryByLabel(group.label, e.target.value); setRenaming(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { (e.target as HTMLInputElement).value = group.label; (e.target as HTMLInputElement).blur() }
            }}
            className="text-xs font-black uppercase tracking-widest bg-gray-800 a-text border border-teal-500 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        ) : (
          <h3 className="text-xs font-black a-text-2 uppercase tracking-widest">{group.label}</h3>
        )}
        {group.key !== '__none__' && !renaming && (
          <button
            onClick={() => setRenaming(true)}
            className="text-xs a-text-3 hover:text-teal-500 transition-colors flex-shrink-0"
            title={`Rename "${group.label}"`}
          >
            ✏️
          </button>
        )}
        <span className="text-xs a-text-3 font-medium">{group.tasks.length}</span>
        <div className="flex-1 h-px a-surface/10" />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs a-text-3">color for all:</span>
          <input
            type="color"
            defaultValue={group.tasks[0]?.hex_code ?? '#3B82F6'}
            key={group.key + '-color'}
            className="w-7 h-7 rounded cursor-pointer border border-white/20"
            onChange={e => setBulkCategoryColor(group.key, e.target.value)}
            title={`Set color for all ${group.label} tasks`}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs a-text-3">pts for all:</span>
          <input
            type="number" min={0}
            defaultValue={group.tasks[0]?.points ?? 0}
            key={group.key + '-pts'}
            className="w-14 px-1.5 py-0.5 text-xs border border-white/20 bg-gray-800 a-text rounded text-center font-bold focus:outline-none focus:ring-1 focus:ring-teal-500"
            onBlur={e => setBulkCategoryPoints(group.key, Math.max(0, parseInt(e.target.value) || 0))}
            onKeyDown={e => {
              if (e.key === 'Enter') setBulkCategoryPoints(group.key, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0))
            }}
            title={`Set points for all ${group.label} tasks`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {group.tasks.map(task => (
          <div key={task.id} className="rounded-2xl overflow-hidden flex flex-col shadow-sm"
            style={{ backgroundColor: task.hex_code }}>
            <div className="px-4 pt-4 pb-3 flex-1">
              <p className="a-text-2 text-xs font-bold uppercase tracking-widest mb-1">{task.color}</p>
              <h3 className="a-text font-black text-lg leading-tight">{task.title}</h3>
              {editingCategoryId === task.id ? (
                <select
                  autoFocus
                  defaultValue={task.category || ''}
                  onChange={e => saveCategoryInline(task.id, e.target.value)}
                  onBlur={() => setEditingCategoryId(null)}
                  className="w-full bg-black/20 a-text text-xs px-2 py-1 rounded border border-white/30 focus:outline-none focus:border-white/60 mt-2"
                >
                  <option value="">— Uncategorized —</option>
                  {categories.filter(c => c.section_id === task.section_id).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="__new__">+ New category…</option>
                </select>
              ) : (
                <button
                  onClick={() => setEditingCategoryId(task.id)}
                  className="mt-1.5 a-text-3 text-xs hover:a-text transition-colors text-left block"
                >
                  {task.category ? `📂 ${task.category}` : '+ category'}
                </button>
              )}
              <div className="flex items-center gap-2 mt-2">
                <p className="a-text-3 text-xs">
                  {scans.filter(s => s.task_id === task.id && s.completed).length} completed ·{' '}
                  {scans.filter(s => s.task_id === task.id).length} scanned
                </p>
                {(task.points ?? 0) > 0 && (
                  <span className="bg-black/50 a-text text-[10px] font-black rounded px-1.5 py-0.5 shadow shadow-black/30 ring-1 ring-white/20">
                    {task.points} pts
                  </span>
                )}
              </div>
              <p className="a-text-3 text-xs mt-0.5">
                {(() => {
                  const n = boardCountByTask.get(task.id) ?? 0
                  return n > 0 ? `✓ On ${n} board${n > 1 ? 's' : ''}` : 'Not on any board'
                })()}
              </p>
            </div>
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              <button onClick={() => navigate(`/bingo-dash/admin/task/${task.id}?from=board`)}
                className="px-3 py-1.5 a-surface/20 rounded-lg a-text text-xs font-bold hover:a-surface/30 transition-colors">
                Edit
              </button>
              <button onClick={() => setQrTask(task)}
                className="px-3 py-1.5 a-surface/20 rounded-lg a-text text-xs font-bold hover:a-surface/30 transition-colors">
                QR
              </button>
              <button onClick={() => copyLink(task.id)}
                className="px-3 py-1.5 a-surface/20 rounded-lg a-text text-xs font-bold hover:a-surface/30 transition-colors">
                {copiedId === task.id ? '✓' : '🔗'}
              </button>
              <button onClick={() => duplicateTask(task)}
                className="px-3 py-1.5 a-surface/20 rounded-lg a-text text-xs font-bold hover:a-surface/30 transition-colors"
                title="Duplicate this card in this section">
                ⎘ Copy
              </button>
              <button onClick={() => openTileEdit(task)}
                className="px-3 py-1.5 a-surface/20 rounded-lg a-text text-xs font-bold hover:a-surface/30 transition-colors"
                title="Move to another section or category">
                Move
              </button>
              <button onClick={() => deleteTask(task.id, task.title)}
                className="px-3 py-1.5 bg-red-500/30 rounded-lg a-text text-xs font-bold hover:bg-red-500/50 transition-colors">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Remember which board the admin was editing across navigations (e.g. Preview → back)
const ADMIN_SECTION_KEY = 'bingo-dash-admin-section-id'

/**
 * Explain a board write that didn't stick.
 *
 * The "tenant update" policy on bingo_sections requires BOTH
 * can_use_game('bingo') AND bingo_can_write(owner_id). When either fails the
 * UPDATE matches zero rows rather than raising, so Start game / Set live /
 * timer changes used to fail completely silently and read as a dead button.
 */
function boardWriteFailureMessage(dbMessage?: string): string {
  return [
    "Couldn't save that change to the board.",
    '',
    'This usually means the account is not enabled for Bingo Dash — ask the',
    'main account holder to open Accounts and check that it is Approved, that',
    'the "Bingo Dash" toggle is ON, and that any temporary access has not expired.',
    dbMessage ? `\nDatabase said: ${dbMessage}` : '',
  ].join('\n')
}

// ── Main component ─────────────────────────────────────────────────────────────

/** Readable ink for a given card colour. A challenge can be any hex the
 *  trainer picked, so neither theme token works — dark cards need light text
 *  and pale cards need dark text, in either theme. */
// Card lights. Fixed palette so the value is safe to store and render
// identically on the phone and the projector.


// Cards are neutral now, so text follows the theme rather than the swatch.
const CARD_INK = { strong: 'var(--a-text)', mid: 'var(--a-text-2)', faint: 'var(--a-text-3)' }

// A card as it sits on a board. placementId identifies the bingo_board_cards
// row, which is the only stable identity here: the same task can hold several
// slots, and two rows can even share a slot number, so neither task id nor slot
// index can address one tile on its own.
type PlacedCard = BingoTask & { placementId: string }

// Synthetic compartment id for the flat Complete Library group.
const LIBRARY_ALL_ID = '__all__'

const emptySlots = new Set<number>()

export function BingoDashAdmin() {
  const navigate = useNavigate()
  const { account, isOwner, workingOwnerValue, signOut } = useBingoAuth()
  const uid = account?.id ?? null
  // Tenancy convention: owner_id NULL = main-account (house) data. The hook
  // resolves the working tenant: owner -> null, facilitator -> host tenant,
  // sub -> own uid.
  const myOwnerValue = workingOwnerValue
  const isMineRow = (ownerId: string | null | undefined) =>
    (ownerId ?? null) === myOwnerValue
  const [tasks, setTasks] = useState<BingoTask[]>([])
  const [boardCards, setBoardCards] = useState<BingoBoardCard[]>([])
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [sections, setSections] = useState<BingoSection[]>([])
  const [categories, setCategories] = useState<BingoCategory[]>([])
  const [challengeSections, setChallengeSections] = useState<BingoChallengeSection[]>([])
  const [duels, setDuels] = useState<BingoDuel[]>([])
  
  // Remembered board is namespaced per signed-in account so switching accounts
  // on the same browser never inherits someone else's stale board id.
  const sectionStorageKey = `${ADMIN_SECTION_KEY}:${uid ?? 'anon'}`
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(() => localStorage.getItem(sectionStorageKey))
  // Per-account "live board" pointer (subs); the owner's pointer stays in the
  // global bingo_settings row so the anonymous front-door pages keep working.
  const [myActiveBoard, setMyActiveBoard] = useState<string | null>(account?.active_section_id ?? null)
  // Owner-only: sub-account emails for the "Sub-account cards" library group.
  const [accountEmails, setAccountEmails] = useState<Map<string, string>>(new Map())
  const [showSectionManager, setShowSectionManager] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [showInlineBoardCreate, setShowInlineBoardCreate] = useState(false)
  const [inlineBoardName, setInlineBoardName] = useState('')
  // Category management
  const [showCategoryManager, setShowCategoryManager] = useState<string | null>(null) // section id or null
  const [newCategoryName, setNewCategoryName] = useState('')
  // Card Library header: inline "+ New Category" creator for the current compartment
  const [showLibNewCategory, setShowLibNewCategory] = useState(false)
  const [libNewCategoryName, setLibNewCategoryName] = useState('')
  // Challenge section management (grouping above categories in the Board tab)
  const [showChallengeSectionManager, setShowChallengeSectionManager] = useState(false)
  const [newChallengeSectionName, setNewChallengeSectionName] = useState('')
  const [renamingCSId, setRenamingCSId] = useState<string | null>(null)
  const [renamingCSName, setRenamingCSName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [qrTask, setQrTask] = useState<BingoTask | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showJoinLink, setShowJoinLink] = useState(false)
  const [joinLinkCopied, setJoinLinkCopied] = useState(false)
  const [joinLinkTab, setJoinLinkTab] = useState<'player' | 'observer'>('player')

  // Add challenge form
  const [formTitle, setFormTitle] = useState('')
  const [formColor, setFormColor] = useState('')
  const [formHex, setFormHex] = useState('#3B82F6')
  const [formCategory, setFormCategory] = useState('')
  const [formPoints, setFormPoints] = useState(0)
  const [formTaskType, setFormTaskType] = useState<'standard' | 'answer' | 'photo' | 'sign_splice'>('standard')
  const [formAnswerQuestion, setFormAnswerQuestion] = useState('')
  const [formAnswerText, setFormAnswerText] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Import
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<ImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)

  // Timer
  const [settings, setSettings] = useState<BingoSettings | null>(null)
  const [timerDisplay, setTimerDisplay] = useState('00:00')
  const [timerMinutesInput, setTimerMinutesInput] = useState('')
  const [timerSaving, setTimerSaving] = useState(false)

  // Tile editor modal
  const [editingTile, setEditingTile] = useState<BingoTask | null>(null)
  const [tileTitle, setTileTitle] = useState('')
  const [tileColor, setTileColor] = useState('')
  const [tileHex, setTileHex] = useState('#3B82F6')
  const [tileCategory, setTileCategory] = useState('')
  const [tilePoints, setTilePoints] = useState(0)
  const [tileSectionId, setTileSectionId] = useState<string>('')
  const [tileTaskType, setTileTaskType] = useState<'standard' | 'answer' | 'photo' | 'sign_splice'>('standard')
  const [tileAnswerQuestion, setTileAnswerQuestion] = useState('')
  const [tileAnswerText, setTileAnswerText] = useState('')
  const [tileSaving, setTileSaving] = useState(false)

  // Inline category picker on gallery cards (shows a <select> dropdown)
  // Collapsed card grids, keyed section+group.
  //
  // This is a live-event control, not a preference: with the grid open a
  // facilitator briefing a room is also showing them every card they are
  // about to hunt for. Collapse it, talk, reveal on cue.
  //
  // Persisted because a mid-event refresh should not silently reveal a board
  // that was deliberately hidden.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('bingo-admin-collapsed')
      return new Set<string>(raw ? JSON.parse(raw) : [])
    } catch { return new Set<string>() }
  })

  const [ledMenuId, setLedMenuId] = useState<string | null>(null)

  const setLed = async (taskId: string, led: string | null) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, led } : t))
    setLedMenuId(null)
    await supabase.from('bingo_tasks').update({ led }).eq('id', taskId)
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem('bingo-admin-collapsed', JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)

  // Category filter for challenges gallery
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Category filter for off-grid list
  const [offGridCategoryFilter, setOffGridCategoryFilter] = useState('all')

  // Cross-section card library filters (Add to Grid panel)
  // 'current' = only this section's off-grid cards; 'all' = every section.
  const [addListSectionFilter, setAddListSectionFilter] = useState<'current' | 'all' | string>('current')
  const [addListSearch, setAddListSearch] = useState('')

  // Drag state
  // A grid drag identifies a SLOT (a card may sit in several), a list drag a task.
  const [dragState, setDragState] = useState<
    { type: 'grid'; slot: number } | { type: 'list'; id: string } | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)

  // Slot picker: which empty grid slot is being filled via click
  const [slotPickerIndex, setSlotPickerIndex] = useState<number | null>(null)
  const [slotPickerFilter, setSlotPickerFilter] = useState('all')

  // Tab navigation
  // Sidebar views. 'run' is the guided landing screen; 'settings' collects the
  // board options that used to sit stacked under the board editor.
  // The open tab lives in the URL (?tab=…) so returning here from a card's
  // edit page lands back on the tab you left, instead of always on Run Event.
  const [searchParams, setSearchParams] = useSearchParams()
  const ADMIN_VIEWS: AdminView[] = ['run', 'board', 'library', 'teams', 'submissions', 'settings']
  const tabParam = searchParams.get('tab') as AdminView | null
  const [activeTab, setActiveTabState] = useState<AdminView>(
    tabParam && ADMIN_VIEWS.includes(tabParam) ? tabParam : 'run'
  )
  const setActiveTab = (v: AdminView) => {
    setActiveTabState(v)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (v === 'run') next.delete('tab'); else next.set('tab', v)
      return next
    }, { replace: true })
  }
  // Which cube face the grid editor is showing. Faces beyond the board's
  // face_count are not offered, so a 1-face board behaves exactly as before.
  const [editFace, setEditFace] = useState(0)
  // Flat stays the default: dropping a card onto a rotating face is harder
  // than dropping it on a grid. Cube view is for reading the shape of a
  // multi-face board, not for building it.
  const [editView, setEditView] = useState<'flat' | 'cube'>('flat')
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [submissionBoardFilter, setSubmissionBoardFilter] = useState<'current' | 'all'>('all')

  // Team grid viewer modal
  const [viewingTeam, setViewingTeam] = useState<BingoTeam | null>(null)
  // Per-team "live members link" share modal
  const [membersLinkTeam, setMembersLinkTeam] = useState<BingoTeam | null>(null)
  const [membersLinkCopied, setMembersLinkCopied] = useState(false)
  // Per-team bonus-points breakdown popup: which team is open + its editable draft
  const [bonusTeam, setBonusTeam] = useState<BingoTeam | null>(null)
  const [bonusDraft, setBonusDraft] = useState<BonusItem[]>([])
  const [bonusSaving, setBonusSaving] = useState(false)
  // Section-wide "live teams link" share modal
  const [showAllTeamsLink, setShowAllTeamsLink] = useState(false)
  const [allTeamsLinkCopied, setAllTeamsLinkCopied] = useState(false)
  const [members, setMembers] = useState<BingoMember[]>([])
  const [photoSubmissions, setPhotoSubmissions] = useState<BingoPhotoSubmission[]>([])
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupPassword, setNewGroupPassword] = useState('')
  const [uploadingTeamPhoto, setUploadingTeamPhoto] = useState<string | null>(null)
  const [resettingGame, setResettingGame] = useState(false)
  const [resettingTeams, setResettingTeams] = useState(false)

  // Library: compartment filter
  const [libraryCompartmentFilter, setLibraryCompartmentFilter] = useState<'all' | string>('all')
  // Library: category filter, only meaningful on the "All Compartments" view
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<'all' | string>('all')
  // Library: free-text search across card title / category / colour label
  const [librarySearch, setLibrarySearch] = useState('')
  // Which card's three-dot action menu is open (library cards)
  const [cardMenuId, setCardMenuId] = useState<string | null>(null)
  const [cardMenuPos, setCardMenuPos] = useState<{ top: number; right: number } | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  // Boards this account actually manages: house boards for the owner, own
  // boards for subs. (For subs, `sections` also holds the owner's boards for
  // library labels — those must never appear as manageable boards.)
  const myBoards = sections.filter(s => isMineRow(s.owner_id))
  // Which board is "live for players" from this account's point of view.
  const activeBoardPointer = isOwner ? (settings?.active_section_id ?? null) : myActiveBoard
  const scopedTasks = currentSectionId ? tasks.filter(t => t.section_id === currentSectionId) : []
  const scopedTeams = currentSectionId
    ? teams.filter(t => t.section_id === currentSectionId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    : []
  // Cards are universal: grid membership lives in bingo_board_cards, one
  // placement row per slot the card occupies, not on the task itself.
  //
  // A card may be reused — the same task can hold several slots on one board,
  // and each placement row is an independent tile. Everything downstream is
  // therefore keyed by SLOT, not task id: removeTileAt deletes the clicked
  // slot alone, and a grid drag carries its slot so dragging one instance
  // never moves its twin.
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const boardTasksForSection = (sectionId: string): PlacedCard[] =>
    boardCards
      .filter(bc => bc.section_id === sectionId)
      .sort((a, b) => a.slot - b.slot)
      .map(bc => {
        const t = taskById.get(bc.task_id)
        return t ? { ...t, sort_order: bc.slot, in_grid: true, placementId: bc.id } : null
      })
      .filter((t): t is PlacedCard => t !== null)
      .sort((a, b) => a.sort_order - b.sort_order)
  const gridTasks = currentSectionId ? boardTasksForSection(currentSectionId) : []
  // Contest bonuses won in duels, folded into each team's earned points.
  const duelBonuses = duelBonusByTeam(duels)
  // How many boards each card sits on (for the "On N boards" labels). Counts
  // distinct boards, not placements — a card reused in three slots of one board
  // is still on one board.
  const boardCountByTask = (() => {
    const bySection = new Map<string, Set<string>>()
    for (const bc of boardCards) {
      const set = bySection.get(bc.task_id) ?? new Set<string>()
      set.add(bc.section_id)
      bySection.set(bc.task_id, set)
    }
    const m = new Map<string, number>()
    for (const [taskId, set] of bySection) m.set(taskId, set.size)
    return m
  })()

  // Sparse 25-slot layout: each placed task sits at slot = sort_order (0-24).
  // Any legacy placement whose slot is out of range or colliding is placed in
  // the next available slot so existing data migrates gracefully.
  const gridSlots: (PlacedCard | null)[] = (() => {
    const slots: (PlacedCard | null)[] = Array(25).fill(null)
    const overflow: PlacedCard[] = []
    for (const t of gridTasks) {
      const s = t.sort_order
      if (Number.isInteger(s) && s >= 0 && s < 25 && slots[s] === null) slots[s] = t
      else overflow.push(t)
    }
    for (const t of overflow) {
      const i = slots.findIndex(x => x === null)
      if (i !== -1) slots[i] = t
    }
    return slots
  })()
  const allCategories = [...new Set(scopedTasks.map(t => t.category).filter(Boolean))].sort() as string[]
  // Timer + alarm + marshal password + photo toggle are per board (bingo_sections).
  const currentBoard = sections.find(s => s.id === currentSectionId) ?? null
  // Where THIS account's players actually land. /bingo-dash resolves its board
  // from the single global bingo_settings pointer, which set_active_board only
  // moves for the owner — so it always serves the house board. Sub accounts must
  // use their own slug or they (and their players) get someone else's game.
  const playerViewPath = myOwnerValue === null
    ? '/bingo-dash'
    : currentBoard ? `/bingo-dash/play/${currentBoard.slug}` : '/bingo-dash'
  const isTimerRunning = !!currentBoard?.timer_end_at && new Date(currentBoard.timer_end_at) > new Date()

  // Library view: candidates for "Add to Grid" across sections.
  // Cards are universal — adding places the existing card on this board, no
  // copying. A card may be placed in as many slots as needed, so already-placed
  // cards stay in the list (placedTaskIds is only used for the "on board" badge).
  // In the "All sections" view, legacy duplicates from the old copy-per-board
  // flow (same title) are collapsed to one entry: prefer this section's copy,
  // otherwise the oldest (the original).
  const addListTasks = (() => {
    const search = addListSearch.trim().toLowerCase()
    let list = tasks.slice()
    if (addListSectionFilter === 'current') list = list.filter(t => t.section_id === currentSectionId)
    else if (addListSectionFilter !== 'all') list = list.filter(t => t.section_id === addListSectionFilter)
    else {
      const byTitle = new Map<string, BingoTask>()
      for (const t of list) {
        const key = t.title.trim().toLowerCase()
        const kept = byTitle.get(key)
        if (!kept) { byTitle.set(key, t); continue }
        const tCurrent = t.section_id === currentSectionId
        const keptCurrent = kept.section_id === currentSectionId
        if ((tCurrent && !keptCurrent) || (tCurrent === keptCurrent && t.created_at < kept.created_at)) {
          byTitle.set(key, t)
        }
      }
      list = [...byTitle.values()]
    }
    if (offGridCategoryFilter !== 'all') list = list.filter(t => t.category === offGridCategoryFilter)
    if (search) list = list.filter(t =>
      t.title.toLowerCase().includes(search) ||
      (t.category ?? '').toLowerCase().includes(search) ||
      (t.color ?? '').toLowerCase().includes(search)
    )
    return list.sort((a, b) => a.title.localeCompare(b.title))
  })()

  const addListCategories = (() => {
    let base = tasks.slice()
    if (addListSectionFilter === 'current') base = base.filter(t => t.section_id === currentSectionId)
    else if (addListSectionFilter !== 'all') base = base.filter(t => t.section_id === addListSectionFilter)
    return [...new Set(base.map(t => t.category).filter(Boolean))].sort() as string[]
  })()

  const filteredTasks = categoryFilter === 'all'
    ? scopedTasks
    : categoryFilter === '__none__'
      ? scopedTasks.filter(t => !t.category)
      : scopedTasks.filter(t => t.category === categoryFilter)

  // Group filtered tasks by category for the gallery
  const groupedTasks = (() => {
    if (categoryFilter !== 'all') {
      const label = categoryFilter === '__none__' ? 'Uncategorized' : categoryFilter
      return [{ label, key: categoryFilter, tasks: filteredTasks }]
    }
    const byCategory = new Map<string, BingoTask[]>()
    const uncategorized: BingoTask[] = []
    for (const task of scopedTasks) {
      if (!task.category) { uncategorized.push(task); continue }
      if (!byCategory.has(task.category)) byCategory.set(task.category, [])
      byCategory.get(task.category)!.push(task)
    }
    const groups = [...byCategory.keys()].sort().map(cat => ({ label: cat, key: cat, tasks: byCategory.get(cat)! }))
    if (uncategorized.length > 0) groups.push({ label: 'Uncategorized', key: '__none__', tasks: uncategorized })
    return groups
  })()

  // Group tasks by challenge section → category (for the Board tab gallery)
  const groupedByChallengeSections = (() => {
    const scopedCS = challengeSections
      .filter(cs => cs.game_section_id === currentSectionId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const scopedCats = categories.filter(c => c.section_id === currentSectionId)

    const catTaskGroups = (catName: string) => scopedTasks.filter(t => t.category === catName)

    type CatGroup = { label: string; key: string; tasks: BingoTask[] }
    type CSGroup = { cs: BingoChallengeSection | null; groups: CatGroup[] }
    const result: CSGroup[] = []

    for (const cs of scopedCS) {
      const csCats = scopedCats.filter(c => c.challenge_section_id === cs.id)
      const groups = csCats
        .map(cat => ({ label: cat.name, key: cat.name, tasks: catTaskGroups(cat.name) }))
        .sort((a, b) => a.label.localeCompare(b.label))
      result.push({ cs, groups })
    }

    // Unassigned: categories not linked to any challenge section + tasks with no category
    const unassignedCats = scopedCats.filter(c => !c.challenge_section_id)
    const unassignedGroups: CatGroup[] = unassignedCats
      .map(cat => ({ label: cat.name, key: cat.name, tasks: catTaskGroups(cat.name) }))
      .sort((a, b) => a.label.localeCompare(b.label))
    const noCategory = scopedTasks.filter(t => !t.category)
    if (noCategory.length > 0) unassignedGroups.push({ label: 'Uncategorized', key: '__none__', tasks: noCategory })
    if (unassignedGroups.length > 0 || scopedCS.length === 0) {
      result.push({ cs: null, groups: unassignedGroups })
    }

    return result
  })()

  // Library: Compartment > Category > Cards.
  // "Mine" groups are this account's own compartments (editable). Foreign
  // groups follow: subs see the main account's shared cards; the owner sees a
  // "Sub-account cards" group per sub account. Foreign cards are read-only —
  // placing one on a board creates an independent copy (copy-on-use).
  const groupedLibraryAll = (() => {
    const byCategory = (list: BingoTask[]) => {
      const map = new Map<string, BingoTask[]>()
      const uncategorized: BingoTask[] = []
      for (const task of list) {
        if (!task.category) { uncategorized.push(task); continue }
        if (!map.has(task.category)) map.set(task.category, [])
        map.get(task.category)!.push(task)
      }
      const cats = [...map.keys()].sort().map(cat => ({
        label: cat, key: cat, tasks: map.get(cat)!.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      if (uncategorized.length > 0) cats.push({ label: 'Uncategorized', key: '__none__', tasks: uncategorized })
      return cats
    }

    // "Complete Library" is every card this account can use: its own
    // compartments first, then the shared / sub-account cards it can copy in.
    // It used to list only the foreign groups, which left the view completely
    // empty for a facilitator working on house data.
    const mineSections = libraryCompartmentFilter === 'all'
      ? myBoards
      : myBoards.filter(s => s.id === libraryCompartmentFilter)
    // A compartment shows what is ON that board — boards take their cards from
    // the shared Complete Library, so a card sitting in the section but never
    // placed is catalogue content, not board content. Complete Library itself
    // still reads every card, since that is the catalogue.
    const groups = mineSections.map(section => {
      const sectionTasks = libraryCompartmentFilter === 'all'
        ? tasks.filter(t => t.section_id === section.id && isMineRow(t.owner_id))
        : boardTasksForSection(section.id)
      return { section: { id: section.id, name: section.name, foreign: false }, categories: byCategory(sectionTasks), totalTasks: sectionTasks.length }
    })

    if (libraryCompartmentFilter !== 'all') return groups

    if (isOwner) {
      const byAccount = new Map<string, BingoTask[]>()
      for (const t of tasks) {
        if (!t.owner_id) continue
        if (!byAccount.has(t.owner_id)) byAccount.set(t.owner_id, [])
        byAccount.get(t.owner_id)!.push(t)
      }
      for (const [ownerId, list] of byAccount) {
        groups.push({
          section: { id: `sub:${ownerId}`, name: `Sub-account cards — ${accountEmails.get(ownerId) ?? ownerId.slice(0, 8)}`, foreign: true },
          categories: byCategory(list),
          totalTasks: list.length,
        })
      }
    } else if (myOwnerValue !== null) {
      // House shared library — skipped for a facilitator working on house
      // data (myOwnerValue null): those sections already ARE their boards.
      for (const section of sections.filter(s => s.owner_id === null)) {
        const list = tasks.filter(t => t.section_id === section.id && t.owner_id === null)
        if (list.length === 0) continue
        groups.push({
          section: { id: `house:${section.id}`, name: `Main library — ${section.name}`, foreign: true },
          categories: byCategory(list),
          totalTasks: list.length,
        })
      }
    }
    // Complete Library is one flat catalogue grouped by category alone — which
    // board a card lives on is not a heading here.
    //
    // Copies of the same challenge on other boards collapse to one entry, but
    // only ACROSS boards: a board that legitimately holds four cards all called
    // "Paper Scissors Rock!" keeps all four, so the catalogue can never come out
    // smaller than a single board. Dedupe is therefore applied per group against
    // titles claimed by earlier groups, never within a group.
    if (libraryCompartmentFilter === 'all') {
      const claimed = new Set<string>()
      const keyOf = (t: BingoTask) =>
        `${t.title.trim().toLowerCase()}\u0000${(t.category ?? '').trim().toLowerCase()}`
      const flat: BingoTask[] = []
      for (const g of groups) {
        const mine: BingoTask[] = []
        for (const c of g.categories) {
          for (const t of c.tasks) {
            if (claimed.has(keyOf(t))) continue
            mine.push(t)
          }
        }
        // Claim after the whole group, so duplicates inside one board survive.
        for (const t of mine) claimed.add(keyOf(t))
        flat.push(...mine)
      }
      if (flat.length === 0) return []
      return [{
        section: { id: LIBRARY_ALL_ID, name: 'Complete Library', foreign: false },
        categories: byCategory(flat),
        totalTasks: flat.length,
      }]
    }

    return groups
  })()

  // Every category present in the current library view, for the filter dropdown.
  // Declared-but-empty categories are included too: a category created via
  // "+ New Category" has no cards yet, and leaving it out made it look as
  // though the create had silently failed.
  const libraryCategoryOptions = (() => {
    const seen = new Map<string, string>()
    for (const g of groupedLibraryAll) for (const c of g.categories) if (!seen.has(c.key)) seen.set(c.key, c.label)
    const visibleSectionIds = new Set(
      libraryCompartmentFilter === 'all'
        ? myBoards.map(s => s.id)
        : [libraryCompartmentFilter]
    )
    for (const c of categories) {
      if (!visibleSectionIds.has(c.section_id)) continue
      if (!seen.has(c.name)) seen.set(c.name, c.name)
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
  })()

  // True when the picked category exists but holds no cards yet — drives an
  // explanatory empty state instead of a blank library.
  const libraryFilterIsEmptyCategory =
    libraryCategoryFilter !== 'all' &&
    !groupedLibraryAll.some(g => g.categories.some(c => c.key === libraryCategoryFilter))

  // Category dropdown narrows every group to one category
  // (hunt challenge, physical challenge, …).
  const groupedLibrary = (() => {
    const q = librarySearch.trim().toLowerCase()
    if (libraryCategoryFilter === 'all' && !q) return groupedLibraryAll
    const matches = (t: BingoTask) =>
      !q ||
      t.title.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q) ||
      (t.color ?? '').toLowerCase().includes(q)
    return groupedLibraryAll
      .map(g => {
        const categories = g.categories
          .filter(c => libraryCategoryFilter === 'all' || c.key === libraryCategoryFilter)
          .map(c => ({ ...c, tasks: c.tasks.filter(matches) }))
          .filter(c => c.tasks.length > 0)
        return { ...g, categories, totalTasks: categories.reduce((n, c) => n + c.tasks.length, 0) }
      })
      .filter(g => g.categories.length > 0)
  })()

  // How many cards the shared ("Complete Library") view covers, independent of
  // the current chip so the chip label never lies.
  // What Complete Library will list: every card, minus copies of a challenge
  // already claimed by an earlier board. Computed from the same board order the
  // grouping uses rather than read off the current view, so the chip stays
  // truthful while another compartment is selected.
  const sharedLibraryCount = (() => {
    const key = (t: BingoTask) =>
      `${t.title.trim().toLowerCase()}\u0000${(t.category ?? '').trim().toLowerCase()}`
    const claimed = new Set<string>()
    let total = 0
    const countBucket = (list: BingoTask[]) => {
      const fresh = list.filter(t => !claimed.has(key(t)))
      for (const t of fresh) claimed.add(key(t))
      total += fresh.length
    }
    for (const section of myBoards) {
      countBucket(tasks.filter(t => t.section_id === section.id && isMineRow(t.owner_id)))
    }
    if (isOwner) {
      const byAccount = new Map<string, BingoTask[]>()
      for (const t of tasks) {
        if (!t.owner_id) continue
        if (!byAccount.has(t.owner_id)) byAccount.set(t.owner_id, [])
        byAccount.get(t.owner_id)!.push(t)
      }
      for (const list of byAccount.values()) countBucket(list)
    } else if (myOwnerValue !== null) {
      for (const section of sections.filter(x => x.owner_id === null)) {
        countBucket(tasks.filter(t => t.section_id === section.id && t.owner_id === null))
      }
    }
    return total
  })()

  // ── Data fetching ──────────────────────────────────────────────────────────
  // Two-stage, tenancy-scoped fetch (hub model):
  //  - owner: all sections + tasks (needs sub content for the shared library),
  //    but gameplay data only for house boards
  //  - sub: own sections + own tasks + the owner's shared (house) tasks;
  //    gameplay data only for their own boards
  const fetchAll = useCallback(async () => {
    // Stage 1: boards + cards + per-board config.
    // Non-owner scope is the WORKING tenant: a sub (or facilitator of a sub)
    // fetches that tenant's rows plus the house shared library; a facilitator
    // of the owner works on house data directly, so house rows only.
    const orMine = `owner_id.eq.${myOwnerValue},owner_id.is.null`
    const [sectionsRes, tasksRes] = await Promise.all([
      isOwner
        ? supabase.from('bingo_sections').select('*').order('sort_order')
        : myOwnerValue === null
          ? supabase.from('bingo_sections').select('*').is('owner_id', null).order('sort_order')
          : supabase.from('bingo_sections').select('*').or(orMine).order('sort_order'),
      isOwner
        ? supabase.from('bingo_tasks').select('*').order('sort_order')
        : myOwnerValue === null
          ? supabase.from('bingo_tasks').select('*').is('owner_id', null).order('sort_order')
          : supabase.from('bingo_tasks').select('*').or(orMine).order('sort_order'),
    ])
    const allSections = (sectionsRes.data ?? []) as BingoSection[]
    const mineSections = allSections.filter(s => isMineRow(s.owner_id))
    const mySectionIds = mineSections.map(s => s.id)

    // Stage 2: everything keyed to my boards (teams first — scans/photo
    // submissions have no section_id and hang off the team).
    const [boardCardsData, teamsData, categoriesData, challengeSectionsData, accountsData] = await Promise.all([
      isOwner
        ? supabase.from('bingo_board_cards').select('*').order('slot').then(r => r.data ?? [])
        : fetchInChunks<BingoBoardCard>('bingo_board_cards', 'section_id', mySectionIds),
      fetchInChunks<BingoTeam>('bingo_teams', 'section_id', mySectionIds),
      isOwner
        ? supabase.from('bingo_categories').select('*').order('sort_order').then(r => r.data ?? [])
        : fetchInChunks<BingoCategory>('bingo_categories', 'section_id', mySectionIds),
      isOwner
        ? supabase.from('bingo_challenge_sections').select('*').order('sort_order').then(r => r.data ?? [])
        : fetchInChunks<BingoChallengeSection>('bingo_challenge_sections', 'game_section_id', mySectionIds),
      isOwner
        ? supabase.from('bingo_accounts').select('id, email').then(r => r.data ?? [])
        : Promise.resolve([] as { id: string; email: string | null }[]),
    ])
    const myTeamIds = teamsData.map(t => t.id)
    const [scansData, membersData, photoSubsData, duelsData] = await Promise.all([
      fetchInChunks<BingoScan>('bingo_scans', 'team_id', myTeamIds),
      fetchInChunks<BingoMember>('bingo_members', 'section_id', mySectionIds),
      fetchInChunks<BingoPhotoSubmission>('bingo_photo_submissions', 'team_id', myTeamIds),
      fetchInChunks<BingoDuel>('bingo_duels', 'section_id', mySectionIds),
    ])

    setSections(allSections)
    setTasks((tasksRes.data ?? []) as BingoTask[])
    const sortedBoardCards = boardCardsData.sort((a, b) => a.slot - b.slot)
    setBoardCards(sortedBoardCards)

    // A card may deliberately occupy several slots on the same board, so
    // repeat (section, task) placements are kept. Each placement row is its own
    // tile: removeTileAt deletes the clicked slot only, never every instance.
    setTeams(teamsData.sort((a, b) => a.created_at.localeCompare(b.created_at)))
    setScans(scansData)
    setCategories(categoriesData.sort((a, b) => a.sort_order - b.sort_order))
    setChallengeSections(challengeSectionsData.sort((a, b) => a.sort_order - b.sort_order))
    setMembers(membersData.sort((a, b) => a.created_at.localeCompare(b.created_at)))
    setPhotoSubmissions(photoSubsData.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setDuels(duelsData.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    if (isOwner) setAccountEmails(new Map(accountsData.map(a => [a.id, a.email ?? a.id])))
    // Keep the remembered board if it's still one of MINE; otherwise fall back
    // to my first board (never someone else's).
    setCurrentSectionId(prev =>
      prev && mineSections.some(s => s.id === prev) ? prev : mineSections[0]?.id ?? null
    )
    setLoading(false)
  }, [isOwner, uid, myOwnerValue]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the selected board so returning from Preview / task edit restores it
  useEffect(() => {
    if (currentSectionId) localStorage.setItem(sectionStorageKey, currentSectionId)
  }, [currentSectionId, sectionStorageKey])

  // ── Section CRUD ──────────────────────────────────────────────────────────
  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const createSection = async (overrideName?: string) => {
    const name = (overrideName ?? newSectionName).trim()
    if (!name) return
    const baseSlug = slugify(name) || `section-${Date.now()}`
    let slug = baseSlug
    let i = 2
    while (sections.some(s => s.slug === slug)) { slug = `${baseSlug}-${i++}` }
    const maxOrder = myBoards.reduce((m, s) => Math.max(m, s.sort_order), -1)
    let { data, error } = await supabase.from('bingo_sections')
      .insert({ name, slug, sort_order: maxOrder + 1, owner_id: myOwnerValue })
      .select().single()
    if (error) {
      // Slugs are globally unique across accounts and other accounts' boards
      // aren't visible here — retry once with a random suffix on collision.
      const retry = await supabase.from('bingo_sections')
        .insert({ name, slug: `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`, sort_order: maxOrder + 1, owner_id: myOwnerValue })
        .select().single()
      data = retry.data; error = retry.error
    }
    if (error || !data) { alert('Failed to create section'); return }
    setSections(prev => [...prev, data])
    setCurrentSectionId(data.id)
    if (overrideName) setInlineBoardName('')
    else setNewSectionName('')
  }

  const renameSection = async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSections(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s))
    await supabase.from('bingo_sections').update({ name: trimmed }).eq('id', id)
  }

  const deleteSection = async (id: string) => {
    const section = sections.find(s => s.id === id)
    if (!section) return
    if (myBoards.length <= 1) { alert('Cannot delete the last section.'); return }
    const taskCount = tasks.filter(t => t.section_id === id).length
    const teamCount = teams.filter(t => t.section_id === id).length
    if (!confirm(`Delete "${section.name}"? This will remove ${taskCount} challenges and ${teamCount} teams.`)) return
    await supabase.from('bingo_sections').delete().eq('id', id)
    const remaining = sections.filter(s => s.id !== id)
    setSections(remaining)
    if (currentSectionId === id) setCurrentSectionId(remaining[0]?.id ?? null)
    await fetchAll()
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const createCategoryByName = async (sectionId: string, rawName: string): Promise<BingoCategory | null> => {
    const name = rawName.trim()
    if (!name || !sectionId) return null
    const existing = categories.find(c => c.section_id === sectionId && c.name === name)
    if (existing) return existing
    const maxOrder = categories.filter(c => c.section_id === sectionId)
      .reduce((m, c) => Math.max(m, c.sort_order), -1)
    const { data, error } = await supabase.from('bingo_categories')
      .insert({ section_id: sectionId, name, sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) { alert('Failed to create category'); return null }
    setCategories(prev => [...prev, data])
    return data
  }

  const createCategory = async (sectionId: string) => {
    const created = await createCategoryByName(sectionId, newCategoryName)
    if (created) setNewCategoryName('')
  }

  // Handle the "+ New category…" sentinel from category <select>s.
  // Returns the chosen category name, or null if the user cancelled.
  const promptAndCreateCategory = async (sectionId: string): Promise<string | null> => {
    const raw = window.prompt('New category name:')
    if (!raw || !raw.trim()) return null
    const cat = await createCategoryByName(sectionId, raw)
    return cat?.name ?? null
  }

  const renameCategory = async (id: string, sectionId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const old = categories.find(c => c.id === id)
    if (!old || old.name === trimmed) return
    if (categories.some(c => c.section_id === sectionId && c.name === trimmed && c.id !== id)) {
      alert(`Category "${trimmed}" already exists.`)
      return
    }
    // Update category name and cascade to all tasks in this section that reference it
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
    setTasks(prev => prev.map(t =>
      t.section_id === sectionId && t.category === old.name ? { ...t, category: trimmed } : t
    ))
    await supabase.from('bingo_categories').update({ name: trimmed }).eq('id', id)
    await supabase.from('bingo_tasks')
      .update({ category: trimmed })
      .eq('section_id', sectionId)
      .eq('category', old.name)
  }

  // Rename a category from the Board tab gallery header (resolves name → id)
  const renameCategoryByLabel = async (label: string, newName: string) => {
    if (!currentSectionId) return
    const trimmed = newName.trim()
    if (!trimmed || trimmed === label) return
    const cat = categories.find(c => c.section_id === currentSectionId && c.name === label)
    if (!cat) return
    await renameCategory(cat.id, currentSectionId, trimmed)
    // Keep the active category filter pointing at the renamed category
    if (categoryFilter === label) setCategoryFilter(trimmed)
    if (offGridCategoryFilter === label) setOffGridCategoryFilter(trimmed)
  }

  const deleteCategory = async (id: string, sectionId: string) => {
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    const affected = tasks.filter(t => t.section_id === sectionId && t.category === cat.name).length
    if (!confirm(`Delete category "${cat.name}"? ${affected > 0 ? `${affected} card${affected !== 1 ? 's' : ''} will become uncategorized.` : ''}`)) return
    setCategories(prev => prev.filter(c => c.id !== id))
    setTasks(prev => prev.map(t =>
      t.section_id === sectionId && t.category === cat.name ? { ...t, category: '' } : t
    ))
    await supabase.from('bingo_categories').delete().eq('id', id)
    if (affected > 0) {
      await supabase.from('bingo_tasks')
        .update({ category: '' })
        .eq('section_id', sectionId)
        .eq('category', cat.name)
    }
  }

  // Pull the 10 AI Team Building activities into this board's library as a
  // "Special" section. Idempotent — safe to press twice.


  // ── Challenge section CRUD (groupings above categories in Board tab) ──────────
  const createChallengeSection = async () => {
    const name = newChallengeSectionName.trim()
    if (!name || !currentSectionId) return
    const maxOrder = challengeSections.filter(cs => cs.game_section_id === currentSectionId)
      .reduce((m, cs) => Math.max(m, cs.sort_order), -1)
    const { data, error } = await supabase.from('bingo_challenge_sections')
      .insert({ game_section_id: currentSectionId, name, sort_order: maxOrder + 1 })
      .select().single()
    if (error || !data) { alert('Failed to create section'); return }
    setChallengeSections(prev => [...prev, data])
    setNewChallengeSectionName('')
  }

  const renameChallengeSection = async (id: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setChallengeSections(prev => prev.map(cs => cs.id === id ? { ...cs, name: trimmed } : cs))
    await supabase.from('bingo_challenge_sections').update({ name: trimmed }).eq('id', id)
    setRenamingCSId(null)
  }

  const deleteChallengeSection = async (id: string) => {
    const cs = challengeSections.find(s => s.id === id)
    if (!cs) return
    const catCount = categories.filter(c => c.challenge_section_id === id).length
    if (!confirm(`Delete section "${cs.name}"?${catCount > 0 ? ` ${catCount} categor${catCount !== 1 ? 'ies' : 'y'} will become unassigned.` : ''}`)) return
    setChallengeSections(prev => prev.filter(s => s.id !== id))
    setCategories(prev => prev.map(c => c.challenge_section_id === id ? { ...c, challenge_section_id: null } : c))
    await supabase.from('bingo_challenge_sections').delete().eq('id', id)
  }

  const assignCategoryToSection = async (catId: string, challengeSectionId: string | null) => {
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, challenge_section_id: challengeSectionId } : c))
    await supabase.from('bingo_categories').update({ challenge_section_id: challengeSectionId }).eq('id', catId)
  }

  // Per-account active board: the RPC validates ownership server-side and,
  // only for the owner, also moves the global bingo_settings pointer that the
  // anonymous front-door pages read. Subs never touch the global pointer.
  const setActiveSection = async (id: string) => {
    if (isOwner) setSettings(prev => prev ? { ...prev, active_section_id: id } : prev)
    setMyActiveBoard(id)
    const { error } = await supabase.rpc('set_active_board', { p_section: id })
    if (error) alert('Failed to set the live board — has the accounts migration been run in Supabase?')
  }

  // Save the per-board note shown below the bingo board on the player page
  const saveBoardNote = async () => {
    const sec = sections.find(s => s.id === currentSectionId)
    if (!sec) return
    const { error } = await supabase.from('bingo_sections')
      .update({ board_note: sec.board_note ?? '', board_note_every: sec.board_note_every ?? 2 })
      .eq('id', sec.id)
    if (error) alert('Failed to save note — has the board_note migration been run in Supabase?')
  }

  const toggleSectionGameStarted = async (sectionId: string, started: boolean) => {
    // Snapshot for rollback: the UI flips optimistically, so a write the
    // database rejects would otherwise show as LIVE until the next refetch.
    const prevSections = sections
    if (started) {
      // Start the countdown with the game. A board with time on the clock that
      // is not already running gets its timer_end_at set here, so the
      // facilitator does not have to remember a second button at the whistle.
      const board = sections.find(s => s.id === sectionId)
      const alreadyRunning = !!board?.timer_end_at && new Date(board.timer_end_at).getTime() > Date.now()
      const startPatch: Partial<BingoSection> = { game_started: true }
      if (!alreadyRunning && (board?.timer_seconds ?? 0) > 0) {
        startPatch.timer_end_at = new Date(Date.now() + (board!.timer_seconds ?? 0) * 1000).toISOString()
      }
      // Lock every other board OF THIS ACCOUNT and make this one live for its
      // players. Other accounts' boards are never touched.
      setSections(prev => prev.map(s => isMineRow(s.owner_id)
        ? (s.id === sectionId ? { ...s, ...startPatch } : { ...s, game_started: false })
        : s))
      if (isOwner) setSettings(prev => prev ? { ...prev, active_section_id: sectionId } : prev)
      setMyActiveBoard(sectionId)
      const otherIds = myBoards.filter(s => s.id !== sectionId && s.game_started).map(s => s.id)
      const [liveRes, othersRes, rpcRes] = await Promise.all([
        supabase.from('bingo_sections').update(startPatch).eq('id', sectionId).select('id'),
        otherIds.length > 0
          ? supabase.from('bingo_sections').update({ game_started: false }).in('id', otherIds).select('id')
          : Promise.resolve({ error: null, data: [] as { id: string }[] }),
        supabase.rpc('set_active_board', { p_section: sectionId }),
      ])
      // Zero rows updated means RLS refused it — that is the failure to report,
      // not just a thrown error.
      const failure = liveRes.error ?? othersRes.error ?? rpcRes.error
      if (failure || liveRes.data?.length !== 1) {
        setSections(prevSections)
        alert(boardWriteFailureMessage(failure?.message))
      }
    } else {
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, game_started: false } : s))
      const { data, error } = await supabase
        .from('bingo_sections').update({ game_started: false }).eq('id', sectionId).select('id')
      if (error || data?.length !== 1) {
        setSections(prevSections)
        alert(boardWriteFailureMessage(error?.message))
      }
    }
  }

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('bingo_settings').select('*').eq('id', 'main').single()
    if (data) setSettings(data)
  }, [])

  useEffect(() => { fetchAll(); fetchSettings() }, [fetchAll, fetchSettings])

  // Real-time timer sync (global settings row — owner-only concern)
  useEffect(() => {
    if (!isOwner) return
    const channel = supabase
      .channel('bingo-settings-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_settings' }, fetchSettings)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSettings, isOwner])

  // Real-time section game_started sync
  useEffect(() => {
    const channel = supabase
      .channel('bingo-sections-admin')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_sections' }, ({ new: updated }) => {
        setSections(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } as typeof s : s))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Real-time photo submissions sync — without this, new uploads don't appear until the admin refreshes.
  // Realtime events arrive for EVERY account's submissions, so inserts are
  // filtered to teams on this account's boards (updates/deletes merge by id,
  // which is already scoped since state only ever holds this account's rows).
  const myTeamIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => { myTeamIdsRef.current = new Set(teams.map(t => t.id)) }, [teams])
  useEffect(() => {
    const channel = supabase
      .channel('bingo-submissions-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_photo_submissions' }, ({ new: row }) => {
        const sub = row as BingoPhotoSubmission
        if (!myTeamIdsRef.current.has(sub.team_id)) return
        setPhotoSubmissions(prev => prev.some(s => s.id === sub.id) ? prev : [sub, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_photo_submissions' }, ({ new: row }) => {
        const sub = row as BingoPhotoSubmission
        setPhotoSubmissions(prev => prev.map(s => s.id === sub.id ? sub : s))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bingo_photo_submissions' }, ({ old: row }) => {
        const sub = row as BingoPhotoSubmission
        setPhotoSubmissions(prev => prev.filter(s => s.id !== sub.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => {
      if (!currentBoard) { setTimerDisplay('00:00'); return }
      if (currentBoard.timer_end_at) {
        setTimerDisplay(formatTime((new Date(currentBoard.timer_end_at).getTime() - Date.now()) / 1000))
      } else {
        setTimerDisplay(formatTime(currentBoard.timer_seconds ?? 0))
      }
    }, 250)
    return () => clearInterval(id)
  }, [currentBoard?.timer_end_at, currentBoard?.timer_seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer actions (per board — writes the selected bingo_sections row) ─────
  const updateBoardSettings = async (patch: Partial<Omit<BingoSection, 'id' | 'created_at'>>) => {
    if (!currentSectionId) return
    setTimerSaving(true)
    try {
      const { data, error } = await supabase.from('bingo_sections').update(patch).eq('id', currentSectionId).select().single()
      if (data) { setSections(prev => prev.map(s => s.id === data.id ? data : s)); return }
      // A row-level-security rejection is not an error here — the UPDATE simply
      // matches zero rows, so .single() fails and the change vanishes silently.
      // Say so out loud instead: this is what made the timer look broken.
      alert(boardWriteFailureMessage(error?.message))
    } finally { setTimerSaving(false) }
  }

  const adjustTimer = (deltaMinutes: number) => {
    if (!currentBoard) return
    const delta = deltaMinutes * 60
    if (isTimerRunning && currentBoard.timer_end_at) {
      updateBoardSettings({ timer_end_at: new Date(new Date(currentBoard.timer_end_at).getTime() + delta * 1000).toISOString() })
    } else {
      updateBoardSettings({ timer_seconds: Math.max(0, (currentBoard.timer_seconds ?? 0) + delta) })
    }
  }

  const setTimerFromInput = () => {
    const mins = parseFloat(timerMinutesInput)
    if (isNaN(mins) || mins < 0) return
    const seconds = Math.round(mins * 60)
    if (isTimerRunning) {
      updateBoardSettings({ timer_end_at: new Date(Date.now() + seconds * 1000).toISOString(), timer_seconds: seconds })
    } else {
      updateBoardSettings({ timer_seconds: seconds })
    }
    setTimerMinutesInput('')
  }

  const startTimer = () => {
    if (!currentBoard?.timer_seconds) return
    updateBoardSettings({ timer_end_at: new Date(Date.now() + currentBoard.timer_seconds * 1000).toISOString() })
  }

  const pauseTimer = () => {
    if (!currentBoard?.timer_end_at) return
    const remaining = Math.max(0, Math.round((new Date(currentBoard.timer_end_at).getTime() - Date.now()) / 1000))
    updateBoardSettings({ timer_seconds: remaining, timer_end_at: null })
  }

  const resetTimer = () => updateBoardSettings({ timer_end_at: null })

  // ── Board grid actions ─────────────────────────────────────────────────────
  // Grid membership lives in bingo_board_cards: one placement row per
  // (board, card). The card itself is never copied or mutated.

  // Persist a 25-slot layout for the current board: placement.slot = slot index.
  const applySlots = async (slots: (PlacedCard | null)[]) => {
    if (!currentSectionId) return
    // Addressed by placement row, not task: moving one instance of a reused
    // card must not drag its twins along with it.
    const updates: { placementId: string; slot: number }[] = []
    slots.forEach((t, i) => { if (t) updates.push({ placementId: t.placementId, slot: i }) })
    setBoardCards(prev => prev.map(bc => {
      const u = updates.find(x => x.placementId === bc.id)
      return u ? { ...bc, slot: u.slot } : bc
    }))
    await Promise.all(updates.map(u =>
      supabase.from('bingo_board_cards').update({ slot: u.slot }).eq('id', u.placementId),
    ))
  }

  // Swap (or move-to-empty) between two slot indices. Leaves all other tiles untouched.
  const reorderGrid = async (fromSlot: number, toSlot: number) => {
    if (fromSlot === toSlot || fromSlot < 0 || toSlot < 0 || fromSlot > 24 || toSlot > 24) return
    const slots = [...gridSlots]
    ;[slots[fromSlot], slots[toSlot]] = [slots[toSlot], slots[fromSlot]]
    await applySlots(slots)
  }

  // Deep-copy a card (task + instruction pages + photos + links) into one of
  // this account's compartments. Used for copy-on-use (placing another
  // account's card) and for manual duplication.
  const copyTaskFull = async (task: BingoTask, opts: { sectionId: string; title?: string; clonedFrom?: string | null }): Promise<BingoTask> => {
    const [pagesRes, photosRes, linksRes] = await Promise.all([
      supabase.from('bingo_task_pages').select('*').eq('task_id', task.id).order('page_order'),
      supabase.from('bingo_task_photos').select('*').eq('task_id', task.id).order('photo_order'),
      supabase.from('bingo_task_links').select('*').eq('task_id', task.id).order('sort_order'),
    ])
    const { data: created, error } = await supabase.from('bingo_tasks').insert({
      section_id: opts.sectionId,
      owner_id: myOwnerValue,
      cloned_from: opts.clonedFrom !== undefined ? opts.clonedFrom : task.id,
      title: opts.title ?? task.title,
      color: task.color, hex_code: task.hex_code, category: task.category,
      points: task.points, in_grid: false,
      task_type: task.task_type,
      answer_question: task.answer_question, answer_text: task.answer_text,
      completion_warning: task.completion_warning, require_marshal: task.require_marshal,
      maps_url: task.maps_url, maps_label: task.maps_label,
      // Contending settings travel with the card — a copied contest card that
      // silently reverted to a solo task would be a nasty surprise mid-event.
      is_contest: task.is_contest, contest_game: task.contest_game,
      contest_bonus: task.contest_bonus,
      sort_order: Math.max(25, tasks.filter(t => t.section_id === opts.sectionId).length + 25),
    }).select().single()
    if (error || !created) throw new Error(error?.message ?? 'Failed to copy card')
    const reparent = <T extends { id: string; task_id: string; created_at: string }>(rows: T[]) =>
      rows.map(({ id, task_id, created_at, ...rest }) => {
        void id; void task_id; void created_at
        return { ...rest, task_id: created.id }
      })
    await Promise.all([
      pagesRes.data?.length ? supabase.from('bingo_task_pages').insert(reparent(pagesRes.data)) : Promise.resolve(),
      photosRes.data?.length ? supabase.from('bingo_task_photos').insert(reparent(photosRes.data)) : Promise.resolve(),
      linksRes.data?.length ? supabase.from('bingo_task_links').insert(reparent(linksRes.data)) : Promise.resolve(),
    ])
    setTasks(prev => [...prev, created])
    return created as BingoTask
  }

  // Copy-on-use: placing another account's card never places the original —
  // it places (and if needed first creates) this account's own copy, so the
  // card owner editing or deleting theirs can never touch a live board here.
  const resolveOwnTaskForPlacement = async (taskId: string): Promise<string | null> => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || isMineRow(task.owner_id)) return taskId
    const existing = tasks.find(t => t.cloned_from === task.id && isMineRow(t.owner_id))
    if (existing) return existing.id
    if (!currentSectionId) return null
    try {
      const copy = await copyTaskFull(task, { sectionId: currentSectionId })
      return copy.id
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to copy card')
      return null
    }
  }

  // Place a card at the exact slot the user chose. If that slot is taken,
  // fall back to the first empty slot so we never silently overwrite.
  const insertIntoGrid = async (taskId: string, atIndex: number) => {
    if (!currentSectionId) return
    const resolvedId = await resolveOwnTaskForPlacement(taskId)
    if (!resolvedId) return
    let target = atIndex
    if (target < 0 || target >= 25 || gridSlots[target] !== null) {
      target = gridSlots.findIndex(s => s === null)
      if (target === -1) return
    }
    const { data: created, error } = await supabase.from('bingo_board_cards')
      .insert({ section_id: currentSectionId, task_id: resolvedId, slot: target })
      .select().single()
    if (error || !created) { alert('Failed to add card to board'); return }
    setBoardCards(prev => [...prev, created])
  }

  // Deletes one slot, not every copy of the card — a card can sit in several
  // slots on the same board and removing one must leave the others alone.
  const removePlacement = async (placementId: string) => {
    setBoardCards(prev => prev.filter(bc => bc.id !== placementId))
    await supabase.from('bingo_board_cards').delete().eq('id', placementId)
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onGridDragStart = (e: React.DragEvent, slot: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(slot))
    setDragState({ type: 'grid', slot })
  }

  const onListDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', taskId)
    setDragState({ type: 'list', id: taskId })
  }

  const onSlotDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = dragState?.type === 'grid' ? 'move' : 'copy'
    setDragOverSlot(slotIndex)
  }

  const onSlotDrop = async (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault()
    setDragOverSlot(null)
    if (!dragState) return
    if (dragState.type === 'grid') {
      await reorderGrid(dragState.slot, slotIndex)
    } else {
      await insertIntoGrid(dragState.id, slotIndex)
    }
    setDragState(null)
  }

  const onDragEnd = () => { setDragState(null); setDragOverSlot(null) }

  // ── Tile editor ────────────────────────────────────────────────────────────
  const openTileEdit = (task: BingoTask) => {
    setEditingTile(task)
    setTileTitle(task.title)
    setTileColor(task.color)
    setTileHex(task.hex_code)
    setTileCategory(task.category || '')
    setTilePoints(task.points ?? 0)
    setTileSectionId(task.section_id)
    setTileTaskType(task.task_type ?? 'standard')
    setTileAnswerQuestion(task.answer_question ?? '')
    setTileAnswerText(task.answer_text ?? '')
  }

  const saveTile = async () => {
    if (!editingTile || !tileTitle.trim() || !tileColor.trim()) return
    setTileSaving(true)
    try {
      const updates: Partial<BingoTask> = {
        title: tileTitle.trim(), color: tileColor.trim(), hex_code: tileHex,
        category: tileCategory.trim(), points: tilePoints,
        task_type: tileTaskType,
        answer_question: tileTaskType === 'answer' ? tileAnswerQuestion.trim() || null : null,
        answer_text: tileTaskType === 'answer'
          ? tileAnswerText.split('\n').map(l => l.trim()).filter(Boolean).join('\n') || null
          : null,
      }
      // Moving a tile to another compartment only changes where it lives in
      // the library — board placements are separate rows and stay intact.
      if (tileSectionId !== editingTile.section_id) {
        updates.section_id = tileSectionId
      }
      await supabase.from('bingo_tasks').update(updates).eq('id', editingTile.id)
      setTasks(prev => prev.map(t => t.id === editingTile.id ? { ...t, ...updates } : t))
      setEditingTile(null)
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally { setTileSaving(false) }
  }

  // Add a card from any section onto the current board's grid. Cards are
  // universal — this just creates a placement row, never a copy.
  const addCardFromLibrary = async (task: BingoTask) => {
    if (!currentSectionId || gridTasks.length >= 25) return
    const firstEmpty = gridSlots.findIndex(s => s === null)
    if (firstEmpty === -1) return
    await insertIntoGrid(task.id, firstEmpty)
  }

  const duplicateTask = async (task: BingoTask) => {
    try {
      // A manual duplicate is a fresh card, not copy-on-use lineage
      // (clonedFrom null keeps it out of the "already copied" lookup).
      await copyTaskFull(task, { sectionId: task.section_id, title: `${task.title} (copy)`, clonedFrom: null })
    } catch {
      alert('Failed to duplicate')
    }
  }

  const saveCategoryInline = async (taskId: string, categoryName: string) => {
    setEditingCategoryId(null)
    let finalName = categoryName
    if (categoryName === '__new__') {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return
      const created = await promptAndCreateCategory(task.section_id)
      if (!created) return
      finalName = created
    }
    await supabase.from('bingo_tasks').update({ category: finalName }).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, category: finalName } : t))
  }

  const matchesBulkCategory = (t: BingoTask, categoryKey: string) => {
    if (t.section_id !== currentSectionId) return false
    return categoryKey === '__none__' ? !t.category : t.category === categoryKey
  }

  const setBulkCategoryPoints = async (categoryKey: string, points: number) => {
    const affected = tasks.filter(t => matchesBulkCategory(t, categoryKey))
    await Promise.all(affected.map(t => supabase.from('bingo_tasks').update({ points }).eq('id', t.id)))
    setTasks(prev => prev.map(t => matchesBulkCategory(t, categoryKey) ? { ...t, points } : t))
  }

  const setBulkCategoryColor = async (categoryKey: string, hex: string) => {
    const affected = tasks.filter(t => matchesBulkCategory(t, categoryKey))
    setTasks(prev => prev.map(t => matchesBulkCategory(t, categoryKey) ? { ...t, hex_code: hex } : t))
    await Promise.all(affected.map(t => supabase.from('bingo_tasks').update({ hex_code: hex }).eq('id', t.id)))
  }

  // ── Challenge actions ──────────────────────────────────────────────────────
  const createTask = async () => {
    if (!formTitle.trim() || !formColor.trim() || !currentSectionId) return
    setFormSaving(true)
    try {
      // sort_order is kept high so new off-grid tasks don't collide with slot indices (0-24).
      const nextOrder = Math.max(25, scopedTasks.length + 25)
      await supabase.from('bingo_tasks').insert({
        section_id: currentSectionId,
        owner_id: myOwnerValue,
        title: formTitle.trim(), color: formColor.trim(), hex_code: formHex,
        category: formCategory.trim(), sort_order: nextOrder, points: formPoints,
        task_type: formTaskType,
        answer_question: formTaskType === 'answer' ? formAnswerQuestion.trim() || null : null,
        answer_text: formTaskType === 'answer'
          ? formAnswerText.split('\n').map(l => l.trim()).filter(Boolean).join('\n') || null
          : null,
      })
      setFormTitle(''); setFormColor(''); setFormHex('#3B82F6'); setFormCategory(''); setFormPoints(0)
      setFormTaskType('standard'); setFormAnswerQuestion(''); setFormAnswerText('')
      setShowForm(false)
      await fetchAll()
    } catch (err) {
      alert('Failed to create: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally { setFormSaving(false) }
  }

  const deleteTask = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? All scans for this challenge will also be removed.`)) return
    await supabase.from('bingo_tasks').delete().eq('id', id)
    await fetchAll()
  }

  const deleteTeam = async (id: string, name: string) => {
    if (!confirm(`Delete team "${name}" and all their scan records?`)) return
    await supabase.from('bingo_teams').delete().eq('id', id)
    await fetchAll()
  }

  const resetTeamScore = async (id: string, name: string) => {
    if (!confirm(`Reset all progress for "${name}"? This clears scans, photo submissions, and bonus points. The team itself, members, and password are kept.`)) return
    const teamSubs = photoSubmissions.filter(s => s.team_id === id)
    const subIds = teamSubs.map(s => s.id)
    const photoPaths = teamSubs.map(s => extractStoragePath(s.photo_url)).filter((p): p is string => !!p)
    // Optimistic UI
    setScans(prev => prev.filter(s => s.team_id !== id))
    setPhotoSubmissions(prev => prev.filter(s => s.team_id !== id))
    setTeams(prev => prev.map(t => t.id === id ? { ...t, bonus_points: 0, bonus_breakdown: [] } : t))
    // Persist
    await Promise.all([
      supabase.from('bingo_scans').delete().eq('team_id', id),
      subIds.length > 0 ? supabase.from('bingo_photo_submissions').delete().in('id', subIds) : Promise.resolve({ error: null } as any),
      supabase.from('bingo_teams').update({ bonus_points: 0, bonus_breakdown: [] }).eq('id', id),
    ])
    if (photoPaths.length > 0) await supabase.storage.from('media').remove(photoPaths)
    await fetchAll()
  }

  // Delete every team on the CURRENT board, cascading their members, scans and
  // photo submissions (FK ON DELETE CASCADE) and cleaning up storage photos.
  // Strictly scoped to currentSectionId, so other boards are never touched.
  // Returns false if the delete failed. Callers handle the confirm + busy state.
  const wipeSectionTeams = async (): Promise<boolean> => {
    const sectionTeams = teams.filter(t => t.section_id === currentSectionId)
    const teamIds = sectionTeams.map(t => t.id)
    if (teamIds.length === 0) return true
    const sectionSubs = photoSubmissions.filter(s => teamIds.includes(s.team_id))
    const teamPhotoPaths = sectionTeams.map(t => t.photo_url ? extractStoragePath(t.photo_url) : null).filter((p): p is string => !!p)
    const subPhotoPaths = sectionSubs.map(s => extractStoragePath(s.photo_url)).filter((p): p is string => !!p)
    // Optimistic UI — remove the teams and everything tied to them.
    setScans(prev => prev.filter(s => !teamIds.includes(s.team_id)))
    setPhotoSubmissions(prev => prev.filter(s => !teamIds.includes(s.team_id)))
    setMembers(prev => prev.filter(m => !teamIds.includes(m.team_id)))
    setTeams(prev => prev.filter(t => !teamIds.includes(t.id)))
    const { error } = await supabase.from('bingo_teams').delete().in('id', teamIds)
    if (error) { alert('Failed to remove teams: ' + error.message); await fetchAll(); return false }
    const allPhotoPaths = [...teamPhotoPaths, ...subPhotoPaths]
    if (allPhotoPaths.length > 0) await supabase.storage.from('media').remove(allPhotoPaths)
    return true
  }

  // ── Reset Game (whole board) — clears progress AND removes all teams ───────
  const resetGame = async () => {
    const section = sections.find(s => s.id === currentSectionId)
    const sectionTeams = teams.filter(t => t.section_id === currentSectionId)
    const sectionScans = scans.filter(s => sectionTeams.some(t => t.id === s.team_id))
    const sectionSubs = photoSubmissions.filter(s => sectionTeams.some(t => t.id === s.team_id))
    const sectionMembers = members.filter(m => sectionTeams.some(t => t.id === m.team_id))

    if (!confirm(
      `Reset game for "${section?.name ?? 'this board'}"?\n\n` +
      `This will permanently remove ALL ${sectionTeams.length} team${sectionTeams.length !== 1 ? 's' : ''} from this board, along with:\n` +
      `  • ${sectionMembers.length} player${sectionMembers.length !== 1 ? 's' : ''}\n` +
      `  • ${sectionScans.length} scan record${sectionScans.length !== 1 ? 's' : ''}\n` +
      `  • ${sectionSubs.length} photo submission${sectionSubs.length !== 1 ? 's' : ''}\n` +
      `  • all bonus points and photos\n\n` +
      `The board will be left with 0 teams. Other boards are NOT affected. This cannot be undone.`
    )) return

    setResettingGame(true)
    try {
      await wipeSectionTeams()
    } finally {
      setResettingGame(false)
    }
  }

  // ── Reset Teams (remove ALL groups from THIS board → "no team") ─────────────
  // Scoped strictly to currentSectionId, so other boards are never touched.
  const resetTeams = async () => {
    const section = sections.find(s => s.id === currentSectionId)
    const sectionTeams = teams.filter(t => t.section_id === currentSectionId)
    if (sectionTeams.length === 0) return
    const sectionMembers = members.filter(m => sectionTeams.some(t => t.id === m.team_id))

    if (!confirm(
      `Remove ALL ${sectionTeams.length} group${sectionTeams.length !== 1 ? 's' : ''} from "${section?.name ?? 'this board'}"?\n\n` +
      `This permanently deletes every group on this board, plus:\n` +
      `  • ${sectionMembers.length} player${sectionMembers.length !== 1 ? 's' : ''}\n` +
      `  • all their scans, photo submissions, bonus points and photos\n\n` +
      `Other boards are NOT affected. This cannot be undone.`
    )) return

    setResettingTeams(true)
    try {
      await wipeSectionTeams()
    } finally {
      setResettingTeams(false)
    }
  }

  const removeMember = async (memberId: string, memberName: string, teamName: string) => {
    if (!confirm(`Remove "${memberName}" from ${teamName}?`)) return
    setMembers(prev => prev.filter(m => m.id !== memberId))
    const { error } = await supabase.from('bingo_members').delete().eq('id', memberId)
    if (error) { alert('Failed to remove member'); await fetchAll() }
  }

  const moveMember = async (memberId: string, newTeamId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, team_id: newTeamId } : m))
    await supabase.from('bingo_members').update({ team_id: newTeamId }).eq('id', memberId)
  }





  const toggleSubmissionSelected = (id: string) => {
    setSelectedSubmissionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const setAllSubmissionsSelected = (subs: BingoPhotoSubmission[], checked: boolean) => {
    setSelectedSubmissionIds(prev => {
      const next = new Set(prev)
      if (checked) subs.forEach(s => next.add(s.id))
      else subs.forEach(s => next.delete(s.id))
      return next
    })
  }

  const extractStoragePath = (publicUrl: string): string | null => {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/media\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  }



  const bulkDeleteSubmissions = async (subs: BingoPhotoSubmission[]) => {
    if (subs.length === 0) return
    if (!confirm(`Delete ${subs.length} submission${subs.length === 1 ? '' : 's'}? Photos will be removed and progress on the affected tiles will reset.`)) return
    setBulkActioning(true)
    try {
      const ids = subs.map(s => s.id)
      setPhotoSubmissions(prev => prev.filter(s => !ids.includes(s.id)))
      const scansToUncomplete = subs.filter(s => s.status === 'approved' && s.scan_id).map(s => s.scan_id!)
      if (scansToUncomplete.length > 0) {
        await supabase.from('bingo_scans').update({ completed: false, completed_at: null }).in('id', scansToUncomplete)
        setScans(prev => prev.map(s => scansToUncomplete.includes(s.id) ? { ...s, completed: false } : s))
      }
      await supabase.from('bingo_photo_submissions').delete().in('id', ids)
      const paths = subs.map(s => extractStoragePath(s.photo_url)).filter((p): p is string => !!p)
      if (paths.length > 0) await supabase.storage.from('media').remove(paths)
    } finally {
      setBulkActioning(false)
    }
  }

  const bulkSetStatus = async (subs: BingoPhotoSubmission[], status: 'approved' | 'rejected') => {
    if (subs.length === 0) return
    setBulkActioning(true)
    try {
      // Optimistic UI
      const ids = subs.map(s => s.id)
      setPhotoSubmissions(prev => prev.map(s => ids.includes(s.id) ? { ...s, status } : s))
      await supabase.from('bingo_photo_submissions').update({ status }).in('id', ids)
      // Cascade to scans:
      // - approve → mark scans completed
      // - reject  → if any of these were previously approved, un-complete the scan
      const scansToComplete = subs.filter(s => s.scan_id && status === 'approved').map(s => s.scan_id!)
      const scansToUncomplete = subs.filter(s => s.scan_id && status === 'rejected' && s.status === 'approved').map(s => s.scan_id!)
      if (scansToComplete.length > 0) {
        await supabase.from('bingo_scans').update({ completed: true, completed_at: new Date().toISOString() }).in('id', scansToComplete)
        setScans(prev => prev.map(s => scansToComplete.includes(s.id) ? { ...s, completed: true } : s))
      }
      if (scansToUncomplete.length > 0) {
        await supabase.from('bingo_scans').update({ completed: false, completed_at: null }).in('id', scansToUncomplete)
        setScans(prev => prev.map(s => scansToUncomplete.includes(s.id) ? { ...s, completed: false } : s))
      }
    } finally {
      setBulkActioning(false)
    }
  }

  const [downloadingZip, setDownloadingZip] = useState(false)
  const downloadSubmissionsZip = async (subs: BingoPhotoSubmission[]) => {
    if (subs.length === 0) return
    setDownloadingZip(true)
    try {
      const zip = new JSZip()
      const usedNames = new Map<string, number>()
      const results = await Promise.all(subs.map(async (sub) => {
        try {
          const res = await fetch(sub.photo_url)
          if (!res.ok) return { ok: false as const, sub }
          const blob = await res.blob()
          const team = teams.find(t => t.id === sub.team_id)
          const task = tasks.find(t => t.id === sub.task_id)
          const groupPart = sanitizeForFilename(team?.name ?? 'unknown-group')
          const stationPart = sanitizeForFilename(task?.title ?? 'unknown-station')
          const ext = extFromUrl(sub.photo_url)
          const base = `${groupPart}__${stationPart}`
          const count = (usedNames.get(base) ?? 0) + 1
          usedNames.set(base, count)
          const name = count === 1 ? `${base}.${ext}` : `${base}_${count}.${ext}`
          return { ok: true as const, name, blob, status: sub.status }
        } catch {
          return { ok: false as const, sub }
        }
      }))
      const failed: BingoPhotoSubmission[] = []
      for (const r of results) {
        if (r.ok) {
          // Group by status into subfolders for easier review.
          zip.folder(r.status)?.file(r.name, r.blob)
        } else {
          failed.push(r.sub)
        }
      }
      if (zip.files && Object.keys(zip.files).length === 0) {
        alert('Could not download any images. Check your network and try again.')
        return
      }
      const out = await zip.generateAsync({ type: 'blob' })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(out)
      a.download = `bingo-submissions_${stamp}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      if (failed.length > 0) {
        alert(`Downloaded ${results.length - failed.length} image(s). ${failed.length} failed to fetch.`)
      }
    } finally {
      setDownloadingZip(false)
    }
  }

  const updateTeam = async (id: string, updates: Partial<BingoTeam>) => {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    await supabase.from('bingo_teams').update(updates).eq('id', id)
  }

  // Open the bonus-points breakdown popup for a team. Seed the draft from its
  // saved breakdown; if the team has a legacy total with no breakdown, start it
  // as a single "Bonus" row so the number isn't silently lost.
  const openBonusModal = (team: BingoTeam) => {
    const saved = team.bonus_breakdown ?? []
    if (saved.length > 0) setBonusDraft(saved.map(i => ({ ...i })))
    else if ((team.bonus_points ?? 0) !== 0) setBonusDraft([{ label: 'Bonus', points: team.bonus_points }])
    else setBonusDraft([])
    setBonusTeam(team)
  }

  // Persist the draft: bonus_points stays the authoritative total (sum of rows).
  // Blank-label rows are dropped so leftover empties don't clutter the total.
  const saveBonus = async () => {
    if (!bonusTeam) return
    const cleaned = bonusDraft
      .map(i => ({ label: i.label.trim(), points: Number.isFinite(i.points) ? i.points : 0 }))
      .filter(i => i.label !== '' || i.points !== 0)
    const total = cleaned.reduce((sum, i) => sum + i.points, 0)
    setBonusSaving(true)
    try {
      await updateTeam(bonusTeam.id, { bonus_breakdown: cleaned, bonus_points: total })
      setBonusTeam(null)
    } finally {
      setBonusSaving(false)
    }
  }

  const uploadTeamPhoto = async (teamId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB).`); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setUploadingTeamPhoto(teamId)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `${teamId}-${Date.now()}.${ext}`
      const path = `bingo-media/team-photos/${fileName}`
      const { error } = await supabase.storage.from('media').upload(path, file, { upsert: false })
      if (error) { alert(`Upload failed: ${error.message}`); return }
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      await updateTeam(teamId, { photo_url: urlData.publicUrl })
    } finally {
      setUploadingTeamPhoto(null)
    }
  }

  const removeTeamPhoto = async (teamId: string) => {
    if (!confirm('Remove this group\u2019s photo?')) return
    await updateTeam(teamId, { photo_url: null })
  }

  const moveTeamToSection = async (id: string, newSectionId: string) => {
    const team = teams.find(t => t.id === id)
    if (!team || team.section_id === newSectionId) return
    const newName = sections.find(s => s.id === newSectionId)?.name ?? 'the new section'
    // Team scans reference tasks in the old section, so progress will read as 0
    // in the new section until they scan those tasks. Make that explicit.
    if (!confirm(`Move "${team.name}" to ${newName}? Their existing scan progress will no longer apply.`)) return
    await updateTeam(id, { section_id: newSectionId })
  }

  const createGroup = async (sectionId: string) => {
    const name = newGroupName.trim()
    const pwd = newGroupPassword.replace(/\D/g, '').slice(0, 4)
    if (!name) return
    if (!/^\d{4}$/.test(pwd)) { alert('Password must be exactly 4 digits.'); return }
    if (teams.some(t => t.section_id === sectionId && t.name.toLowerCase() === name.toLowerCase())) {
      alert(`Group "${name}" already exists in this compartment.`)
      return
    }
    const { data, error } = await supabase
      .from('bingo_teams')
      .insert({ name, password: pwd, section_id: sectionId })
      .select()
      .single()
    if (error || !data) { alert('Failed to create group'); return }
    setTeams(prev => [...prev, data])
    setNewGroupName('')
    setNewGroupPassword('')
  }

  const bulkCreateGroups = async (sectionId: string, count: number) => {
    const existing = teams.filter(t => t.section_id === sectionId)
    const rows = Array.from({ length: count }, (_, i) => {
      const num = existing.length + i + 1
      const name = `Group ${num}`
      const password = String(1000 + Math.floor(Math.random() * 9000)).padStart(4, '0')
      return { name, password, section_id: sectionId }
    }).filter(r => !teams.some(t => t.section_id === sectionId && t.name.toLowerCase() === r.name.toLowerCase()))
    if (rows.length === 0) { alert('All group names already exist.'); return }
    const { data, error } = await supabase.from('bingo_teams').insert(rows).select()
    if (error || !data) { alert('Failed to bulk create groups'); return }
    setTeams(prev => [...prev, ...data])
  }

  const copyLink = (taskId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/bingo-dash/task/${taskId}`)
    setCopiedId(taskId)
    setTimeout(() => setCopiedId(null), 1500)
  }


  // Full card actions behind a three-dot menu. Every library card gets it —
  // this account has write access to the shared library too — so Edit, QR,
  // Copy, Move and Delete are always one click away.
  const renderCardMenu = (task: BingoTask) => (
    <div className="flex-shrink-0">
      <button
        onClick={e => {
          if (cardMenuId === task.id) { setCardMenuId(null); return }
          // The card clips its own overflow, so the panel is positioned
          // fixed against the button's viewport rect instead of absolutely.
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const openUp = r.bottom + 280 > window.innerHeight
          setCardMenuPos({
            top: openUp ? Math.max(8, r.top - 280) : r.bottom + 6,
            right: Math.max(8, window.innerWidth - r.right),
          })
          setCardMenuId(task.id)
        }}
        aria-haspopup="menu"
        aria-expanded={cardMenuId === task.id}
        title="More actions"
        className="px-2.5 py-1.5 a-chip-btn rounded-lg text-xs font-black transition-colors"
      >
        ⋯
      </button>
      {cardMenuId === task.id && cardMenuPos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setCardMenuId(null)} />
          <div
            role="menu"
            className="fixed z-[61] w-44 rounded-xl border a-border p-1.5 flex flex-col gap-0.5"
            style={{ top: cardMenuPos.top, right: cardMenuPos.right, background: 'var(--a-surface)', boxShadow: 'var(--a-shadow-1)' }}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider a-text-3 mr-1">Light</span>
              <button onClick={() => { setLed(task.id, null); setCardMenuId(null) }}
                title="Off" aria-label="Light off"
                className="w-4 h-4 rounded-full border a-border" />
              {LED_KEYS.map(k => (
                <button key={k} onClick={() => { setLed(task.id, k); setCardMenuId(null) }}
                  title={k} aria-label={k} className="w-4 h-4 rounded-full"
                  style={{ background: LED_HEX[k],
                           outline: task.led === k ? '2px solid var(--a-text)' : 'none',
                           outlineOffset: 1 }} />
              ))}
            </div>
            <button role="menuitem" onClick={() => { setCardMenuId(null); navigate(`/bingo-dash/admin/task/${task.id}?from=${activeTab}`) }}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold a-text hover:a-surface-2">✎ Edit</button>
            <button role="menuitem" onClick={() => { setCardMenuId(null); setQrTask(task) }}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold a-text hover:a-surface-2">▦ QR code</button>
            <button role="menuitem" onClick={() => copyLink(task.id)}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold a-text hover:a-surface-2">
              {copiedId === task.id ? '✓ Link copied' : '🔗 Copy link'}
            </button>
            <button role="menuitem" onClick={() => { setCardMenuId(null); duplicateTask(task) }}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold a-text hover:a-surface-2">⎘ Duplicate</button>
            <button role="menuitem" onClick={() => { setCardMenuId(null); openTileEdit(task) }}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold a-text hover:a-surface-2">↦ Move</button>
            <button role="menuitem" onClick={() => { setCardMenuId(null); deleteTask(task.id, task.title) }}
              className="text-left px-2 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:a-surface-2">🗑 Delete</button>
          </div>
        </>
      )}
    </div>
  )

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImportPreview = () => {
    setImportError(''); setImportPreview(null)
    try {
      const rows = parseImport(importText)
      if (rows.length === 0) throw new Error('No items found')
      setImportPreview(rows)
    } catch (err) { setImportError(err instanceof Error ? err.message : 'Invalid JSON') }
  }

  const handleImportConfirm = async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      if (!currentSectionId) throw new Error('No section selected')
      const startOrder = Math.max(25, scopedTasks.length + 25)
      for (let i = 0; i < importPreview.length; i++) {
        const row = importPreview[i]
        const { data: task, error: taskErr } = await supabase
          .from('bingo_tasks')
          .insert({ section_id: currentSectionId, owner_id: myOwnerValue, title: row.title, color: row.color, hex_code: row.hex_code, category: '', sort_order: startOrder + i * 10 })
          .select().single()
        if (taskErr) throw taskErr
        if (row.clues.length > 0) {
          await supabase.from('bingo_task_pages').insert({
            task_id: task.id, page_order: 0, media_url: null, media_type: null,
            pointer_1: row.clues[0] ?? null, pointer_2: row.clues[1] ?? null,
            pointer_3: row.clues[2] ?? null, pointer_4: row.clues[3] ?? null,
            pointer_5: row.clues[4] ?? null, pointer_6: row.clues[5] ?? null,
            example_1: null, example_2: null, example_3: null, example_4: null, example_5: null, example_6: null,
            icon_1: null, icon_2: null, icon_3: null, icon_4: null, icon_5: null, icon_6: null,
          })
        }
      }
      setShowImport(false); setImportText(''); setImportPreview(null)
      await fetchAll()
    } catch (err) { setImportError(err instanceof Error ? err.message : 'Import failed') }
    finally { setImporting(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen a-surface-2 flex items-center justify-center">
        <p className="a-text-2">Loading...</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen a-bg flex" onDragEnd={onDragEnd}>
      {/* Fixed navigation. Every destination sits in the same place at every
          moment — the tab strip it replaces moved around depending on which
          board was selected, which is what made this hard to learn. */}
      <AdminSidebar
        view={activeTab}
        onView={setActiveTab}
        email={account?.email}
        isOwner={isOwner}
        onSignOut={signOut}
        pending={photoSubmissions.filter(x => x.status === 'pending').length}
      />
      <div className="flex-1 min-w-0">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b a-border a-surface shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="a-text-3 hover:a-text-2 transition-colors">←</button>
            <div>
              <h1 className="text-xl font-black a-text tracking-tight">Bingo Dash <span className="text-teal-500">Admin</span></h1>
              <p className="text-[10px] a-text-3 uppercase tracking-widest font-bold hidden sm:block">Control Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Counts stay visible — they are the quickest sanity check that
                the right board is selected before you start a game. */}
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl a-surface-2 border a-border mr-2">
              <span className="text-sm font-black text-teal-600">{scopedTasks.length}</span>
              <span className="text-[10px] a-text-3 uppercase tracking-wider">cards</span>
              <span className="w-px h-3.5 a-surface/10" />
              <span className="text-sm font-black text-emerald-300">{scopedTeams.length}</span>
              <span className="text-[10px] a-text-3 uppercase tracking-wider">teams</span>
            </div>

            {/* The one thing handed to a room full of people — kept as a
                real button, not buried in a menu. */}
            <button
              onClick={() => { setShowJoinLink(true); setJoinLinkCopied(false); setJoinLinkTab('player') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-gray-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
            >
              <span className="text-base leading-none">📱</span>
              <span className="hidden sm:inline">Join Link</span>
            </button>

            <Menu label="Open" icon="🖥">
              <MenuItem icon="🎯" label="Player view" hint="What participants see"
                href={playerViewPath} />
              <MenuItem icon="📺" label="Scoreboard" hint="Projector display"
                href={currentBoard ? `/bingo-dash/projector/${currentBoard.slug}` : '/bingo-dash/projector'} />
              <MenuItem icon="🎬" label="Event slides" hint="Briefing, groupings, awards"
                to="/bingo-dash/slides" />
            </Menu>

            <Menu label="Manage" icon="⚙️">
              <MenuItem icon="👥" label="Teams" hint="Rosters and scores"
                onClick={() => setActiveTab('teams')} />
              <MenuItem icon="🃏" label="Card library" hint="All your challenges"
                onClick={() => setActiveTab('library')} />
              <MenuItem icon="📸" label="Submissions" hint="Review photo evidence"
                onClick={() => setActiveTab('submissions')} />
              <MenuDivider />
              <MenuItem icon="📥" label="Import cards" hint="Paste rows to bulk-add"
                onClick={() => { setShowImport(true); setImportText(''); setImportPreview(null); setImportError('') }} />
              {!isOwner && !account?.facilitator_host && (
                <MenuItem icon="🤝" label="My crew" hint="Invite helpers to your event"
                  to="/bingo-dash/crew" />
              )}
              {isOwner && <MenuItem icon="🤝" label="Crew passes" hint="Bring co-trainers in" to="/bingo-dash/crew" />}
              <MenuItem icon="🔗" label="Shared events" hint="Run a day with another trainer"
                to="/bingo-dash/events" />
              {isOwner && (
                <>
                  <MenuDivider />
                  <MenuItem icon="🔑" label="Accounts" hint="Approvals, plans and limits"
                    to="/bingo-dash/accounts" />
                </>
              )}
            </Menu>

            <Menu label={account?.email?.split('@')[0] ?? 'Account'} icon="👤">
              <div className="px-4 py-3 border-b border-white/8">
                <p className="text-[10px] uppercase tracking-widest a-text-3">Signed in as</p>
                <p className="text-sm font-bold a-text truncate">{account?.email}</p>
                {isOwner && <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-600 text-[10px] font-black uppercase">Owner</span>}
              </div>
              <MenuItem icon="🏢" label="My account" hint="Company, plan and usage" to="/bingo-dash/account" />
              <MenuDivider />
              <MenuItem icon="🚪" label="Sign out" onClick={signOut} />
            </Menu>
          </div>
        </div>

        {/* ── Board tab bar ─────────────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto border-t a-border">
          <span className="text-[9px] font-black a-text-3 uppercase tracking-widest mr-2 flex-shrink-0">Boards</span>
          {myBoards.map(s => {
            const isActive = currentSectionId === s.id
            const isLive = activeBoardPointer === s.id || s.game_started
            return (
              <button
                key={s.id}
                onClick={() => setCurrentSectionId(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex-shrink-0 ${
                  isActive
                    ? 'bg-teal-600 a-text shadow-lg shadow-teal-100/50'
                    : 'a-text-2 hover:a-text hover:a-surface/10 border a-border'
                }`}
              >
                {s.name}
                {isLive && (
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-300' : 'bg-green-500'}`} />
                )}
              </button>
            )
          })}
          {showInlineBoardCreate ? (
            <input
              autoFocus
              value={inlineBoardName}
              onChange={e => setInlineBoardName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { createSection(inlineBoardName); setShowInlineBoardCreate(false) }
                if (e.key === 'Escape') { setShowInlineBoardCreate(false); setInlineBoardName('') }
              }}
              onBlur={() => { if (!inlineBoardName.trim()) setShowInlineBoardCreate(false) }}
              placeholder="Board name…"
              className="px-2.5 py-1.5 text-sm border border-teal-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-40 flex-shrink-0 a-surface a-text placeholder-gray-600"
            />
          ) : (
            <button
              onClick={() => setShowInlineBoardCreate(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm a-text-3 hover:a-text-2 hover:a-surface-2 transition-colors flex-shrink-0 border border-dashed a-border"
            >
              + New Board
            </button>
          )}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {currentSectionId && activeBoardPointer === currentSectionId ? (
              <span className="text-xs font-bold text-green-400 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-950/50 border border-green-800 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" /> Live
              </span>
            ) : (
              <button
                onClick={() => currentSectionId && setActiveSection(currentSectionId)}
                disabled={!currentSectionId}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-green-400 border border-green-800 hover:bg-green-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Make this board the one players see at /bingo-dash"
              >
                Set live
              </button>
            )}
            <button
              onClick={() => setShowSectionManager(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold a-text-3 hover:a-text-2 hover:a-surface-2 transition-colors"
              title="Rename or delete boards"
            >
              Manage
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-10">

        {activeTab === 'board' && <>

        {/* ── Game Access (per-section) ─────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold a-text mb-2">Game Access</h2>
          <p className="text-xs a-text-3 mb-3">
            Control which games are live. Each section is independent — you can run multiple games simultaneously.
          </p>
          {(() => {
            const currentSection = sections.find(s => s.id === currentSectionId)
            const isStarted = currentSection?.game_started ?? false
            return (
              <div className={`flex items-center justify-between gap-4 rounded-2xl px-6 py-5 ${isStarted ? 'a-ok-panel border' : 'bg-gray-800/60 border a-border'}`}>
                <div>
                  <p className={`text-lg font-black ${isStarted ? 'a-ok-text' : 'a-text-2'}`}>
                    {isStarted ? '● Game is LIVE' : '■ Game is Locked'}
                  </p>
                  <p className="text-xs a-text-3 mt-0.5">
                    {isStarted
                      ? `Participants in "${currentSection?.name}" can access the board and complete challenges.`
                      : `Participants in "${currentSection?.name}" see a waiting screen.`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => currentSectionId && toggleSectionGameStarted(currentSectionId, !isStarted)}
                    disabled={!currentSectionId}
                    className={`px-6 py-3 rounded-xl font-black text-sm transition-all disabled:opacity-40 ${
                      isStarted
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {isStarted ? 'Lock Game' : 'Start Game'}
                  </button>
                  <button
                    onClick={resetGame}
                    disabled={resettingGame}
                    className="px-5 py-3 rounded-xl font-black text-sm transition-all border border-red-500/40 a-danger-btn disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove all teams from this board and clear their scans, submissions and points (this board only)"
                  >
                    {resettingGame ? 'Resetting…' : '↺ Reset Game'}
                  </button>
                </div>
              </div>
            )
          })()}
        </section>

        {/* ── Timer ────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold a-text mb-4">Timer</h2>
          <div className="a-surface rounded-2xl p-6">
            <div className="text-center mb-5">
              <div
                className="font-mono font-black tracking-wider tabular-nums leading-none"
                style={{
                  fontSize: 'clamp(3.5rem, 10vw, 6rem)',
                  color: isTimerRunning
                    ? (currentBoard?.timer_end_at && (new Date(currentBoard.timer_end_at).getTime() - Date.now()) < 120_000 ? 'var(--a-danger)' : 'var(--a-ok)')
                    : 'var(--a-text)',
                }}
              >
                {timerDisplay}
              </div>
              <div className={`text-sm font-bold mt-2 tracking-wider uppercase ${isTimerRunning ? 'a-ok-text' : 'a-text-3'}`}>
                {isTimerRunning ? '● Running' : (currentBoard?.timer_seconds ?? 0) > 0 ? '■ Paused / Stopped' : '■ Not set'}
              </div>
            </div>

            <div className="flex gap-2 justify-center mb-5">
              {!isTimerRunning ? (
                <button onClick={startTimer} disabled={!currentBoard?.timer_seconds || timerSaving}
                  className="px-7 py-2.5 bg-green-500 a-text rounded-xl font-bold hover:bg-green-400 disabled:opacity-40 transition-colors">
                  ▶ Start
                </button>
              ) : (
                <button onClick={pauseTimer} disabled={timerSaving}
                  className="px-7 py-2.5 bg-yellow-500 a-text rounded-xl font-bold hover:bg-yellow-400 transition-colors">
                  ❚❚ Pause
                </button>
              )}
              <button onClick={resetTimer} disabled={timerSaving}
                className="px-7 py-2.5 a-surface/10 a-text rounded-xl font-bold hover:a-surface/20 transition-colors">
                ↺ Reset
              </button>
            </div>

            <div className="flex items-center gap-2 justify-center flex-wrap">
              {([-10, -5, -1] as const).map(d => (
                <button key={d} onClick={() => adjustTimer(d)} disabled={timerSaving}
                  className="px-3 py-2 a-surface/10 a-text rounded-lg text-sm font-bold hover:a-surface/20 transition-colors disabled:opacity-40 tabular-nums">
                  {d}m
                </button>
              ))}
              <div className="flex items-center gap-1 a-surface/10 rounded-lg px-2 py-1.5 mx-1">
                <input
                  type="number"
                  value={timerMinutesInput}
                  onChange={e => setTimerMinutesInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setTimerFromInput()}
                  placeholder="min"
                  className="w-14 bg-transparent a-text text-sm font-bold text-center focus:outline-none placeholder-white/30 tabular-nums"
                  min={0}
                />
                <button onClick={setTimerFromInput} disabled={!timerMinutesInput.trim() || timerSaving}
                  className="a-text-2 hover:a-text text-xs font-bold transition-colors disabled:opacity-30 pl-1 border-l border-white/20">
                  Set
                </button>
              </div>
              {([1, 5, 10] as const).map(d => (
                <button key={d} onClick={() => adjustTimer(d)} disabled={timerSaving}
                  className="px-3 py-2 a-surface/10 a-text rounded-lg text-sm font-bold hover:a-surface/20 transition-colors disabled:opacity-40 tabular-nums">
                  +{d}m
                </button>
              ))}
            </div>

            {/* ── Time's-Up Alarm (shown to players when timer hits 0) ───── */}
            <div className="mt-6 pt-5 border-t a-border">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold a-text uppercase tracking-wider">Time's-Up Alarm</h3>
                  <p className="text-xs a-text-3 mt-0.5">Shown full-screen to all players when the timer reaches 0. Press <span className="font-bold">Reset</span> above to clear it.</p>
                </div>
                {currentBoard?.timer_end_at && new Date(currentBoard.timer_end_at).getTime() <= Date.now() && (
                  <span className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">● Alarm live</span>
                )}
              </div>

              <label className="block text-xs font-bold a-text-2 uppercase tracking-wider mb-1">Message</label>
              <textarea
                value={currentBoard?.time_up_message ?? ''}
                onChange={e => setSections(prev => prev.map(s => s.id === currentSectionId ? { ...s, time_up_message: e.target.value } : s))}
                placeholder="Time's up! Please return to the meeting point."
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border a-border a-bg a-text placeholder-gray-600 text-sm font-medium focus:outline-none focus:border-teal-500 resize-none"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-bold a-text-2 uppercase tracking-wider mb-1">Location label</label>
                  <input
                    type="text"
                    value={currentBoard?.time_up_label ?? ''}
                    onChange={e => setSections(prev => prev.map(s => s.id === currentSectionId ? { ...s, time_up_label: e.target.value } : s))}
                    placeholder="e.g. Colmar Plaza"
                    className="w-full px-4 py-2.5 rounded-lg border a-border a-bg a-text placeholder-gray-600 text-sm font-medium focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold a-text-2 uppercase tracking-wider mb-1">Google Maps link</label>
                  <input
                    type="text"
                    value={currentBoard?.time_up_maps_url ?? ''}
                    onChange={e => setSections(prev => prev.map(s => s.id === currentSectionId ? { ...s, time_up_maps_url: e.target.value } : s))}
                    placeholder="https://maps.app.goo.gl/..."
                    className="w-full px-4 py-2.5 rounded-lg border a-border a-bg a-text placeholder-gray-600 text-sm font-medium focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    if (!currentBoard) return
                    updateBoardSettings({
                      time_up_message: currentBoard.time_up_message ?? '',
                      time_up_label: currentBoard.time_up_label ?? '',
                      time_up_maps_url: currentBoard.time_up_maps_url ?? '',
                    })
                  }}
                  disabled={timerSaving}
                  className="px-5 py-2 rounded-lg text-sm font-bold a-text bg-teal-500 hover:bg-teal-600 disabled:opacity-40 transition-colors"
                >
                  Save alarm
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Scoreboard Theme ──────────────────────────────────────────────── */}
        

        {/* ── Board Editor ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold a-text">
                Board Editor
                <span className="ml-2 text-sm font-normal a-text-3">({gridTasks.length}/25)</span>
              </h2>
              <p className="text-sm a-text-3 mt-0.5">
                Drag tiles to reorder · Drag from list to place · Hover to move ◀▶ or remove ✕
              </p>
            </div>
            <a href={playerViewPath} target="_blank" rel="noopener noreferrer"
              className="text-xs text-teal-500 hover:text-violet-700 transition-colors">
              Preview ↗
            </a>
          </div>

          <div className="flex gap-6 flex-col lg:flex-row items-start">
            {/* Interactive 5×5 grid */}
            <div className="flex-shrink-0">
              <div className="a-surface rounded-2xl p-4">
                <p className="text-[10px] font-bold a-text-3 uppercase tracking-widest mb-3">
                  Grid — drag to reorder
                </p>

                {/* Open faces. This also lives in Settings, but it belongs
                    here too — you decide how many faces a board has while
                    looking at the board, not three screens away. */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[10px] font-bold a-text-3 uppercase tracking-widest">Open faces</span>
                  {[1, 2, 3, 4, 5, 6].map(n => {
                    const on = normaliseFaceCount(currentBoard?.face_count) === n
                    return (
                      <button
                        key={n}
                        onClick={() => { if (!on) { updateBoardSettings({ face_count: n }); setEditFace(0) } }}
                        title={`${n} face${n > 1 ? 's' : ''} — ${n * 25} slots`}
                        className="w-8 h-8 rounded-lg text-xs font-black transition-colors"
                        style={on
                          ? { background: 'var(--a-brand)', color: '#fff' }
                          : { background: 'var(--a-surface-2)', color: 'var(--a-text-2)' }}
                      >
                        {n}
                      </button>
                    )
                  })}
                  <span className="text-[10px] a-text-3">
                    {normaliseFaceCount(currentBoard?.face_count) * 25} slots · 5×5 each
                  </span>
                </div>

                {/* Face tabs. Shown only when the board actually opens more
                    than one face, so a normal board looks untouched. Editing
                    stays a flat 5x5 — the cube is a projector effect, not a
                    thing you should have to rotate to place a card. */}
                {normaliseFaceCount(currentBoard?.face_count) > 1 && (
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {activeFaces(currentBoard?.face_count).map(f => {
                      const on = editFace === f
                      const filled = boardCards.filter(
                        bc => bc.section_id === currentSectionId &&
                              Math.floor(bc.slot / 25) === f).length
                      return (
                        <button
                          key={f}
                          onClick={() => setEditFace(f)}
                          className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                          style={on
                            ? { background: faceColor(f), color: '#fff' }
                            : { background: 'var(--a-surface-2)', color: 'var(--a-text-2)' }}
                        >
                          {faceName(f)}
                          <span className={on ? 'text-white/70 ml-1.5' : 'a-text-3 ml-1.5'}>
                            {filled}/25
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {normaliseFaceCount(currentBoard?.face_count) > 1 && (
                  <div className="flex gap-1 mb-3 p-1 rounded-xl w-fit" style={{ background: 'var(--a-surface-2)' }}>
                    {(['flat', 'cube'] as const).map(v => (
                      <button key={v} onClick={() => setEditView(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${editView === v ? 'text-white' : 'a-text-2'}`}
                        style={editView === v ? { background: 'var(--a-brand)' } : undefined}>
                        {v === 'flat' ? '\u25a6 Flat' : '\ud83e\uddca Cube'}
                      </button>
                    ))}
                  </div>
                )}

                {editView === 'cube' && normaliseFaceCount(currentBoard?.face_count) > 1 && (
                  <div className="rounded-2xl p-4 mb-3" style={{ background: '#0a1414' }}>
                    <CubeBoard
                      size={280}
                      completedSlots={emptySlots}
                      faces={activeFaces(currentBoard?.face_count).map(f =>
                        Array.from({ length: TILES_PER_FACE }, (_, i) => gridSlots[f * TILES_PER_FACE + i] ?? null))}
                      ledOf={t => (t?.led ? LED_HEX[t.led] ?? null : null)}
                    />
                  </div>
                )}

                <div
                  hidden={editView === 'cube' && normaliseFaceCount(currentBoard?.face_count) > 1}
                  className="grid grid-cols-5 gap-1.5"
                  style={{ width: 'min(380px, calc(100vw - 80px))' }}
                >
                  {Array.from({ length: 25 }, (_, posIndex) => {
                    const slotIndex = slotFor(editFace, posIndex)
                    const task = gridSlots[slotIndex]
                    const isDragOver = dragOverSlot === slotIndex

                    return task ? (
                      <BoardTile
                        key={`slot-${slotIndex}`}
                        task={task}
                        index={slotIndex}
                        total={gridTasks.length}
                        isDragOver={isDragOver}
                        isBeingDragged={dragState?.type === 'grid' && dragState.slot === slotIndex}
                        onMoveLeft={() => reorderGrid(slotIndex, slotIndex - 1)}
                        onMoveRight={() => reorderGrid(slotIndex, slotIndex + 1)}
                        onRemove={() => removePlacement(task.placementId)}
                        onEdit={() => openTileEdit(task)}
                        onDragStart={e => onGridDragStart(e, slotIndex)}
                        onDragOver={e => onSlotDragOver(e, slotIndex)}
                        onDrop={e => onSlotDrop(e, slotIndex)}
                        onDragEnd={onDragEnd}
                        onDragLeave={() => setDragOverSlot(null)}
                      />
                    ) : (
                      <div
                        key={`empty-${slotIndex}`}
                        onDragOver={e => onSlotDragOver(e, slotIndex)}
                        onDrop={e => onSlotDrop(e, slotIndex)}
                        onDragLeave={() => setDragOverSlot(null)}
                        onClick={() => {
                          if (!dragState && scopedTasks.length > 0 && gridTasks.length < 25) {
                            setSlotPickerIndex(slotIndex)
                            setSlotPickerFilter('all')
                          }
                        }}
                        className={`aspect-square rounded-lg border-2 border-dashed transition-all duration-150 flex items-center justify-center ${
                          isDragOver && dragState
                            ? 'border-teal-500 bg-teal-500/20 scale-105'
                            : scopedTasks.length > 0 && gridTasks.length < 25
                              ? 'a-surface-2 border-white/20 hover:border-teal-500 hover:bg-teal-500/10 cursor-pointer'
                              : 'a-surface-2 a-border'
                        }`}
                      >
                        {scopedTasks.length > 0 && gridTasks.length < 25 && !dragState && (
                          <span className="a-text/20 text-lg font-black leading-none select-none">+</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Card library — pick any card from any section, filter & search */}
            <div className="flex-1 min-w-0 w-full lg:w-auto">
              <p className="text-xs font-bold a-text-2 uppercase tracking-wider mb-1">
                Add to Grid
                {gridTasks.length >= 25 && <span className="ml-2 text-red-400 normal-case font-normal">Grid full</span>}
              </p>
              <p className="text-[11px] a-text-3 mb-2">
                Cards are shared across boards — adding never makes a copy. Editing a card updates it on every board that uses it.
              </p>
              {/* Section + search row */}
              <div className="flex gap-2 mb-2">
                <select
                  value={addListSectionFilter}
                  onChange={e => setAddListSectionFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border a-border text-xs font-medium a-surface a-text flex-shrink-0"
                  title="Filter by section"
                >
                  <option value="current">This section</option>
                  <option value="all">All sections</option>
                  {sections.filter(s => s.id !== currentSectionId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="search"
                  value={addListSearch}
                  onChange={e => setAddListSearch(e.target.value)}
                  placeholder="Search cards by title, category, color…"
                  className="flex-1 px-3 py-1.5 rounded-lg border a-border a-surface a-text placeholder-gray-600 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-0"
                />
              </div>
              {/* Category chips */}
              {addListCategories.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  <button
                    onClick={() => setOffGridCategoryFilter('all')}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${offGridCategoryFilter === 'all' ? 'bg-teal-600 a-text' : 'a-surface/10 a-text-2 hover:a-surface/15 hover:a-text'}`}
                  >
                    All
                  </button>
                  {addListCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setOffGridCategoryFilter(cat)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${offGridCategoryFilter === cat ? 'bg-teal-600 a-text' : 'a-surface/10 a-text-2 hover:a-surface/15 hover:a-text'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              {addListTasks.length === 0 ? (
                <div className="a-surface rounded-xl border a-border px-4 py-8 text-center text-sm a-text-3">
                  No cards match these filters.
                </div>
              ) : (
                <div className="a-surface rounded-xl border a-border divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {addListTasks.map(task => {
                    const isSameSection = task.section_id === currentSectionId
                    const sectionName = sections.find(s => s.id === task.section_id)?.name ?? ''
                    const boardCount = boardCountByTask.get(task.id) ?? 0
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => onListDragStart(e, task.id)}
                        onDragEnd={onDragEnd}
                        className={`flex items-center gap-3 px-4 py-2.5 hover:a-surface-2 transition-colors select-none cursor-grab active:cursor-grabbing ${
                          dragState?.type === 'list' && dragState.id === task.id ? 'opacity-40' : ''
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: task.hex_code }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium a-text truncate">{task.title}</p>
                          <div className="flex items-center gap-2 text-xs a-text-3 truncate">
                            {task.category && <span>{task.category}</span>}
                            {!isSameSection && (
                              <span className="text-[10px] font-bold a-surface/10 a-text-2 border a-border rounded px-1.5 py-0.5">
                                {sectionName}
                              </span>
                            )}
                            {boardCount > 0 && (
                              <span className="text-[10px] font-bold bg-teal-100/40 text-teal-600 border border-teal-300 rounded px-1.5 py-0.5"
                                title="This card is shared — it already sits on other boards. Edits apply everywhere.">
                                on {boardCount} board{boardCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => addCardFromLibrary(task)}
                          disabled={gridTasks.length >= 25}
                          className="px-3 py-1 bg-teal-100/50 text-teal-500 border border-violet-700 rounded-lg text-xs font-bold hover:bg-teal-300/50 disabled:opacity-40 transition-colors flex-shrink-0"
                        >
                          + Add
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        </> /* end board tab */}

        {/* ── Library tab: Compartment > Category > Cards ───────────────────── */}
        {activeTab === 'library' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold a-text">Card Library</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowLibNewCategory(!showLibNewCategory); setLibNewCategoryName('') }}
                disabled={!currentSectionId}
                title={currentSectionId ? 'Create a category in the current compartment' : 'Select a compartment first'}
                className="px-4 py-2 border a-border a-surface-2 a-text rounded-lg hover:a-surface text-sm font-medium transition-colors disabled:opacity-40">
                + New Category
              </button>
              <button onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-teal-600 a-text rounded-lg hover:bg-violet-700 text-sm font-medium transition-colors">
                + Add Challenge
              </button>
            </div>
          </div>

          {/* Inline category creator — scoped to the current compartment */}
          {showLibNewCategory && (
            <div className="a-surface rounded-xl border a-border p-4 mb-4">
              <p className="text-xs a-text-2 mb-2">
                New category in <span className="font-bold a-text-3">{sections.find(s => s.id === currentSectionId)?.name ?? '—'}</span>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={libNewCategoryName}
                  onChange={e => setLibNewCategoryName(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && currentSectionId && libNewCategoryName.trim()) {
                      const created = await createCategoryByName(currentSectionId, libNewCategoryName)
                      if (created) {
                        setLibraryCompartmentFilter(currentSectionId)
                        setLibraryCategoryFilter(created.name)
                        setLibNewCategoryName(''); setShowLibNewCategory(false)
                      }
                    }
                    if (e.key === 'Escape') setShowLibNewCategory(false)
                  }}
                  placeholder="e.g. Mall Hunt"
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-lg border a-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  onClick={async () => {
                    if (!currentSectionId) return
                    const created = await createCategoryByName(currentSectionId, libNewCategoryName)
                    if (created) {
                      setLibraryCompartmentFilter(currentSectionId)
                      setLibraryCategoryFilter(created.name)
                      setLibNewCategoryName(''); setShowLibNewCategory(false)
                    }
                  }}
                  disabled={!libNewCategoryName.trim() || !currentSectionId}
                  className="px-4 py-2 bg-teal-600 a-text rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40"
                >
                  Create
                </button>
                <button onClick={() => setShowLibNewCategory(false)}
                  className="px-3 py-2 a-text-3 text-sm font-bold hover:a-text">Cancel</button>
              </div>
            </div>
          )}

          {/* Owner-authored content packs any tenant can copy in. Replaces the
              old hardcoded AI Team Building import, which only the house
              account could use. */}
          <SharedLibraryPanel sectionId={currentSectionId} onImported={() => void fetchAll()} />

          {/* Compartment filter chips */}
          <div className="flex gap-2 flex-wrap mb-5">
            <button
              onClick={() => setLibraryCompartmentFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${libraryCompartmentFilter === 'all' ? 'a-surface a-text' : 'a-surface-2 a-text-3 hover:a-surface-2'}`}
            >
              Complete Library ({sharedLibraryCount})
            </button>
            {myBoards.map(s => (
              <button
                key={s.id}
                onClick={() => setLibraryCompartmentFilter(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${libraryCompartmentFilter === s.id ? 'bg-teal-600 a-text' : 'a-surface-2 a-text-3 hover:a-surface-2'}`}
              >
                {s.name} ({boardTasksForSection(s.id).length})
                {activeBoardPointer === s.id && <span className="ml-1 text-green-400">●</span>}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <input
                  type="search"
                  value={librarySearch}
                  onChange={e => setLibrarySearch(e.target.value)}
                  placeholder="Search cards…"
                  aria-label="Search cards"
                  className="w-52 pl-8 pr-3 py-1.5 rounded-full text-xs font-bold border a-border a-surface-2 a-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs a-text-3 pointer-events-none">🔍</span>
              </div>
              <label className="text-xs font-bold a-text-3" htmlFor="lib-cat-filter">Category</label>
              <select
                id="lib-cat-filter"
                value={libraryCategoryFilter}
                onChange={e => setLibraryCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border a-border a-surface-2 a-text focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All categories</option>
                {libraryCategoryOptions.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* New challenge form (scoped to current section) */}
          {showForm && (
            <div className="a-surface rounded-xl border a-border p-6 mb-6">
              <h3 className="font-bold a-text mb-1">New Challenge</h3>
              {currentSectionId && (
                <p className="text-xs a-text-2 mb-4">
                  Adding to: <span className="font-bold a-text-3">{sections.find(s => s.id === currentSectionId)?.name}</span>
                  {' '}— change compartment via the section switcher in the header
                </p>
              )}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium a-text-3 mb-1">Title</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. Water Challenge"
                    className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" autoFocus />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium a-text-3 mb-1">Category</label>
                    <select value={formCategory} onChange={async e => {
                      if (e.target.value === '__new__') {
                        if (!currentSectionId) return
                        const name = await promptAndCreateCategory(currentSectionId)
                        if (name) setFormCategory(name)
                        return
                      }
                      setFormCategory(e.target.value)
                    }}
                      className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 a-surface">
                      <option value="">— Uncategorized —</option>
                      {categories.filter(c => c.section_id === currentSectionId).map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      <option value="__new__">+ New category…</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-sm font-medium a-text-3 mb-1">Points</label>
                    <input type="number" value={formPoints} min={0}
                      onChange={e => setFormPoints(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 text-center font-bold" />
                  </div>
                </div>
                <ColorPicker hex={formHex} colorName={formColor} onHexChange={setFormHex} onNameChange={setFormColor} />
                {/* Type toggle */}
                <div>
                  <label className="block text-sm font-medium a-text-3 mb-2">Card Type</label>
                  <div className="flex rounded-lg overflow-hidden border a-border">
                    <button type="button" onClick={() => setFormTaskType('standard')}
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'standard' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Standard
                    </button>
                    <button type="button" onClick={() => setFormTaskType('answer')}
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'answer' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Answer Input
                    </button>
                    <button type="button" onClick={() => setFormTaskType('sign_splice')}
                      title="Teams hunt each letter of their movie title on a different shop sign"
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'sign_splice' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Sign Splice
                    </button>
                  </div>
                </div>
                {formTaskType === 'answer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium a-text-3 mb-1">Question / Prompt</label>
                      <input type="text" value={formAnswerQuestion} onChange={e => setFormAnswerQuestion(e.target.value)}
                        placeholder="e.g. What is the name of this landmark?"
                        className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium a-text-3 mb-1">Answer Template</label>
                      <p className="text-xs a-text-2 mb-1">One answer per line. Each line becomes a row of letter boxes.</p>
                      <textarea value={formAnswerText} onChange={e => setFormAnswerText(e.target.value)}
                        placeholder={"e.g.\nPETRONAS\nTWIN TOWERS"}
                        rows={3}
                        className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm resize-none" />
                    </div>
                  </>
                )}
                <div className="flex gap-3">
                  <button onClick={createTask} disabled={formSaving || !formTitle.trim() || !formColor.trim()}
                    className="px-6 py-2 bg-teal-600 a-text rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm transition-colors">
                    {formSaving ? 'Creating...' : 'Create Challenge'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-6 py-2 a-surface-2 a-text-3 rounded-lg hover:bg-gray-300 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compartment > Category > Cards hierarchy */}
          {tasks.length === 0 ? (
            <p className="a-text-2 text-center py-8 a-surface rounded-xl border a-border">
              No challenges yet. Click "Add Challenge" to create one.
            </p>
          ) : groupedLibrary.length === 0 ? (
            <p className="a-text-2 text-center py-8 a-surface rounded-xl border a-border">
              {librarySearch.trim()
                ? `No cards match “${librarySearch.trim()}”.`
                : libraryFilterIsEmptyCategory
                ? `“${libraryCategoryFilter}” has no cards yet — create a challenge and pick this category, or drag existing cards into it.`
                : libraryCategoryFilter !== 'all'
                ? 'No cards in this category.'
                : libraryCompartmentFilter === 'all'
                  ? 'No shared library cards yet — pick a compartment above to see its own cards.'
                  : 'No cards in this compartment.'}
            </p>
          ) : (
            <div className="flex flex-col gap-10">
              {groupedLibrary.map(({ section, categories: categoryGroups, totalTasks }) => (
                <div key={section.id}>
                  {/* Compartment header — omitted for the flat Complete
                      Library group, which has no single board behind it. */}
                  {section.id !== LIBRARY_ALL_ID && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black a-text uppercase tracking-wider">{section.name}</h2>
                      {activeBoardPointer === section.id && (
                        <span className="text-[10px] font-black text-green-400 bg-green-950/60 border border-green-800 px-1.5 py-0.5 rounded uppercase">Live</span>
                      )}
                      {section.foreign && (
                        <span className="text-[10px] font-black text-sky-400 bg-sky-950/60 border border-sky-800 px-1.5 py-0.5 rounded uppercase" title="Shared cards — adding one to your board creates your own independent copy">Shared</span>
                      )}
                    </div>
                    <span className="text-xs a-text-3 font-medium">{totalTasks} cards</span>
                    <div className="flex-1 h-px a-surface/10" />
                    {!section.foreign && (
                      <>
                        <button
                          onClick={() => setShowCategoryManager(showCategoryManager === section.id ? null : section.id)}
                          className={`text-xs font-bold transition-colors flex-shrink-0 px-2 py-0.5 rounded ${
                            showCategoryManager === section.id
                              ? 'bg-teal-100/50 text-teal-500'
                              : 'a-text-3 hover:text-teal-500'
                          }`}
                        >
                          Categories ({categories.filter(c => c.section_id === section.id).length})
                        </button>
                        <button
                          onClick={() => { setCurrentSectionId(section.id); setActiveTab('board') }}
                          className="text-xs text-teal-600 hover:text-teal-300 font-bold transition-colors flex-shrink-0"
                        >
                          Open Board →
                        </button>
                      </>
                    )}
                  </div>
                  )}

                  {/* Category manager panel */}
                  {showCategoryManager === section.id && (
                    <div className="a-surface-2 border a-border rounded-xl p-4 mb-5">
                      <p className="text-xs font-black a-text-3 uppercase tracking-widest mb-3">Manage Categories</p>
                      <div className="flex flex-col gap-1.5 mb-3">
                        {categories.filter(c => c.section_id === section.id).length === 0 ? (
                          <p className="text-xs a-text-2 italic">No categories yet — add one below.</p>
                        ) : (
                          categories.filter(c => c.section_id === section.id).map(cat => {
                            const cardCount = tasks.filter(t => t.section_id === section.id && t.category === cat.name).length
                            return (
                              <div key={cat.id} className="flex items-center gap-2 a-surface border a-border rounded-lg px-3 py-1.5">
                                <input
                                  type="text"
                                  defaultValue={cat.name}
                                  key={`${cat.id}-${cat.name}`}
                                  onBlur={e => renameCategory(cat.id, section.id, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                  className="flex-1 text-sm font-medium a-text bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-teal-500 rounded px-1"
                                />
                                <span className="text-xs a-text-2 flex-shrink-0">{cardCount} card{cardCount !== 1 ? 's' : ''}</span>
                                <button
                                  onClick={() => deleteCategory(cat.id, section.id)}
                                  className="text-xs text-red-400 hover:text-red-600 transition-colors flex-shrink-0 px-1"
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          })
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createCategory(section.id) }}
                          placeholder="New category name…"
                          className="flex-1 px-3 py-1.5 rounded-lg border a-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <button
                          onClick={() => createCategory(section.id)}
                          disabled={!newCategoryName.trim()}
                          className="px-4 py-1.5 bg-teal-600 a-text rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Categories within this compartment */}
                  <div className="flex flex-col gap-8">
                    {categoryGroups.length === 0 ? (
                      <p className="a-text-2 text-sm pl-4">No cards in this compartment.</p>
                    ) : (
                      categoryGroups.map(group => (
                        <div key={group.key}>
                          {/* Category subheader */}
                          <div className="flex items-center gap-3 mb-3 pl-4">
                          {(() => {
                            const gKey = section.id + ':' + group.key
                            const hidden = collapsedGroups.has(gKey)
                            return (
                              <button
                                type="button"
                                onClick={() => toggleGroup(gKey)}
                                aria-expanded={!hidden}
                                title={hidden ? 'Show these cards' : 'Hide these cards'}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest a-text-3 hover:a-surface-2 transition-colors flex-shrink-0"
                              >
                                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"
                                     style={{ transform: hidden ? 'rotate(-90deg)' : 'none', transition: 'transform .18s cubic-bezier(.22,1,.36,1)' }}>
                                  <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor"
                                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {hidden ? `${group.tasks.length} hidden` : 'Hide'}
                              </button>
                            )
                          })()}
                            <h3 className="text-xs font-black a-text-2 uppercase tracking-widest">{group.label}</h3>
                            <span className="text-xs a-text-2 font-medium">{group.tasks.length}</span>
                            <div className="flex-1 h-px a-surface-2" />
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs a-text-2">color for all:</span>
                              <input type="color" defaultValue={group.tasks[0]?.hex_code ?? '#3B82F6'}
                                key={section.id + group.key + '-color'}
                                className="w-7 h-7 rounded cursor-pointer border a-border"
                                onChange={e => setBulkCategoryColor(group.key, e.target.value)}
                                title={`Set color for all ${group.label} tasks`} />
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs a-text-2">pts for all:</span>
                              <input type="number" min={0} defaultValue={group.tasks[0]?.points ?? 0}
                                key={section.id + group.key + '-pts'}
                                className="w-14 px-1.5 py-0.5 text-xs border border-white/20 bg-gray-800 a-text rounded text-center font-bold focus:outline-none focus:ring-1 focus:ring-teal-500"
                                onBlur={e => setBulkCategoryPoints(group.key, Math.max(0, parseInt(e.target.value) || 0))}
                                onKeyDown={e => { if (e.key === 'Enter') setBulkCategoryPoints(group.key, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0)) }}
                                title={`Set points for all ${group.label} tasks`} />
                            </div>
                          </div>

                          {/* Cards grid */}
                          <div
                            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pl-4"
                            hidden={collapsedGroups.has(section.id + ':' + group.key)}
                          >
                            {group.tasks.map(task => {
                              const ink = CARD_INK
                              return (
                              <div key={task.id} className="rounded-2xl overflow-hidden flex flex-col transition-shadow"
                                style={{
                                  // Neutral card, colour as an accent. A solid
                                  // hex block fought the text for attention and
                                  // left no room for a light to read against.
                                  background: 'var(--a-surface)',
                                  border: '1px solid var(--a-border)',
                                  boxShadow: 'var(--a-shadow-1)',
                                  ...(task.led ? {
                                    ['--led' as string]: LED_HEX[task.led] ?? '#34d3b8',
                                    animation: 'card-led 2.6s cubic-bezier(.22,1,.36,1) infinite',
                                  } : {}),
                                }}>
                                <div style={{ height: 5, background: task.hex_code }} />
                                <div className="px-4 pt-4 pb-3 flex-1">
                                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: ink.mid }}>{task.color}</p>
                                  <h3 className="font-black text-lg leading-tight" style={{ color: ink.strong }}>{task.title}</h3>
                                  {section.foreign && !isOwner ? (
                                    task.category && (
                                      <p className="mt-1.5 text-xs" style={{ color: ink.faint }}>📂 {task.category}</p>
                                    )
                                  ) : editingCategoryId === task.id ? (
                                    <select
                                      autoFocus
                                      defaultValue={task.category || ''}
                                      onChange={e => saveCategoryInline(task.id, e.target.value)}
                                      onBlur={() => setEditingCategoryId(null)}
                                      className="w-full bg-black/20 text-white text-xs px-2 py-1 rounded border border-white/30 focus:outline-none focus:border-white/60 mt-2"
                                    >
                                      <option value="">— Uncategorized —</option>
                                      {categories.filter(c => c.section_id === task.section_id).map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                      ))}
                                      <option value="__new__">+ New category…</option>
                                    </select>
                                  ) : (
                                    <button
                                      onClick={() => setEditingCategoryId(task.id)}
                                      className="mt-1.5 text-xs transition-opacity hover:opacity-70 text-left block" style={{ color: ink.faint }}>
                                      {task.category ? `📂 ${task.category}` : '+ category'}
                                    </button>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    <p className="text-xs" style={{ color: ink.faint }}>
                                      {scans.filter(s => s.task_id === task.id && s.completed).length} completed ·{' '}
                                      {scans.filter(s => s.task_id === task.id).length} scanned
                                    </p>
                                    {(task.points ?? 0) > 0 && (
                                      <span className="a-surface-2 a-text text-[10px] font-black rounded px-1.5 py-0.5">{task.points} pts</span>
                                    )}
                                  </div>
                                  <p className="a-text-3 text-xs mt-0.5">
                                    {(() => {
                                      const n = boardCountByTask.get(task.id) ?? 0
                                      return n > 0 ? `✓ On ${n} board${n > 1 ? 's' : ''}` : 'Not on any board'
                                    })()}
                                  </p>
                                  {(!section.foreign || isOwner) && (
                                    <button
                                      onClick={async () => {
                                        const newVal = !task.require_marshal
                                        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, require_marshal: newVal } : t))
                                        await supabase.from('bingo_tasks').update({ require_marshal: newVal }).eq('id', task.id)
                                      }}
                                      className={`mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${
                                        task.require_marshal
                                          ? 'a-chip-on'
                                          : 'a-chip-off'
                                      }`}
                                    >
                                      {task.require_marshal ? '🔒 Marshal ON' : '🔓 Marshal OFF'}
                                    </button>
                                  )}

                                  {/* ── AI Team Building timer ───────────────
                                      AITB cards run a speed-bonus ladder that
                                      counts up from check-in. Facilitators can
                                      turn that clock off for an untimed run, or
                                      rescale it to a different window. */}
                                  {(!section.foreign || isOwner) && aitbByName(task.title) && (() => {
                                    const activity = aitbByName(task.title)!
                                    const on = task.aitb_timer_enabled !== false
                                    const mins = task.aitb_timer_minutes ?? activity.mins
                                    const save = async (patch: Partial<BingoTask>) => {
                                      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t))
                                      const { error } = await supabase.from('bingo_tasks').update(patch).eq('id', task.id)
                                      if (error) alert('Timer not saved: ' + error.message)
                                    }
                                    return (
                                      <div className="mt-1.5">
                                        <button
                                          onClick={() => save({ aitb_timer_enabled: !on })}
                                          title={on
                                            ? 'Bonus clock is running for this card'
                                            : 'Untimed — the bonus bar is hidden for players'}
                                          className={`text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${on ? 'a-chip-on' : 'a-chip-off'}`}
                                        >
                                          {on ? '⏱️ Timer ON' : '⏱️ Timer OFF'}
                                        </button>
                                        {on && (
                                          <div className="mt-2 p-2 rounded-lg a-surface-2">
                                            <label className="block a-text-3 text-[10px] font-black uppercase tracking-wider mb-1">
                                              Minutes
                                            </label>
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="number"
                                                min={1}
                                                max={180}
                                                defaultValue={mins}
                                                key={`${task.id}-aitbmin-${task.aitb_timer_minutes ?? 'def'}`}
                                                onBlur={e => {
                                                  const raw = parseInt(e.target.value)
                                                  const v = Number.isFinite(raw) ? Math.min(180, Math.max(1, raw)) : activity.mins
                                                  if (v === mins) return
                                                  save({ aitb_timer_minutes: v === activity.mins ? null : v })
                                                }}
                                                className="w-20 bg-black/40 a-text text-xs px-2 py-1 rounded border border-white/25 text-center font-bold focus:outline-none focus:border-white/60"
                                              />
                                              {task.aitb_timer_minutes != null && (
                                                <button
                                                  onClick={() => save({ aitb_timer_minutes: null })}
                                                  className="text-[10px] font-bold a-text-3 hover:text-teal-500"
                                                >
                                                  Reset to {activity.mins}
                                                </button>
                                              )}
                                            </div>
                                            <p className="a-text-3 text-[10px] mt-1 leading-snug">
                                              Rescales the whole bonus ladder to this window.
                                              Default for {activity.name} is {activity.mins} min.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}

                                  {/* ── Contending mode ──────────────────────
                                      Turns this card into a head-to-head duel:
                                      the challenger scans another team's QR,
                                      both phones unlock the same clue, and the
                                      marshal declares the winner. */}
                                  {(!section.foreign || isOwner) && (
                                    <div className="mt-1.5">
                                      <button
                                        onClick={async () => {
                                          const newVal = !task.is_contest
                                          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_contest: newVal } : t))
                                          await supabase.from('bingo_tasks').update({ is_contest: newVal }).eq('id', task.id)
                                        }}
                                        className={`text-xs font-bold px-2 py-0.5 rounded-full transition-colors ${
                                          task.is_contest
                                            ? 'a-chip-on'
                                            : 'a-chip-off'
                                        }`}
                                      >
                                        {task.is_contest ? '⚔️ Contending ON' : '⚔️ Contending OFF'}
                                      </button>

                                      {task.is_contest && (
                                        <div className="mt-2 p-2 rounded-lg a-surface-2 space-y-2">
                                          <div>
                                            <label className="block a-text-3 text-[10px] font-black uppercase tracking-wider mb-1">Game</label>
                                            <select
                                              value={task.contest_game || 'speed-edit'}
                                              onChange={async e => {
                                                const v = e.target.value
                                                setTasks(prev => prev.map(t => t.id === task.id ? { ...t, contest_game: v } : t))
                                                await supabase.from('bingo_tasks').update({ contest_game: v }).eq('id', task.id)
                                              }}
                                              className="w-full bg-black/40 a-text text-xs px-2 py-1 rounded border border-white/25 focus:outline-none focus:border-white/60"
                                            >
                                              {CONTEST_GAMES.map(g => (
                                                <option key={g.key} value={g.key}>{g.emoji} {g.name}</option>
                                              ))}
                                            </select>
                                            <p className="a-text-3 text-[10px] mt-1 leading-snug">
                                              {getContestGame(task.contest_game).tagline}
                                            </p>
                                          </div>
                                          <div>
                                            <label className="block a-text-3 text-[10px] font-black uppercase tracking-wider mb-1">
                                              Winner bonus
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              defaultValue={task.contest_bonus ?? 0}
                                              key={`${task.id}-cbonus-${task.contest_bonus ?? 0}`}
                                              onBlur={async e => {
                                                const v = Math.max(0, parseInt(e.target.value) || 0)
                                                if (v === (task.contest_bonus ?? 0)) return
                                                setTasks(prev => prev.map(t => t.id === task.id ? { ...t, contest_bonus: v } : t))
                                                await supabase.from('bingo_tasks').update({ contest_bonus: v }).eq('id', task.id)
                                              }}
                                              className="w-20 bg-black/40 a-text text-xs px-2 py-1 rounded border border-white/25 text-center font-bold focus:outline-none focus:border-white/60"
                                            />
                                            <p className="a-text-3 text-[10px] mt-1 leading-snug">
                                              Extra points for the duel winner. The challenger still crosses this
                                              tile off and banks its {task.points ?? 0} pts either way.
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {/* Complete Library is a browse-and-place
                                    view: one Add-to-board button with every
                                    other action under the ⋯ menu. A single
                                    compartment keeps the full inline strip. */}
                                {libraryCompartmentFilter === 'all' ? (
                                  <div className="px-3 pb-3 flex items-start gap-1.5">
                                    <button onClick={() => addCardFromLibrary(task)}
                                      disabled={gridTasks.length >= 25 && isMineRow(task.owner_id)}
                                      className="flex-1 px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                                      title={isMineRow(task.owner_id)
                                        ? 'Place this card on the current board'
                                        : 'Copies this card into your board — the original stays untouched'}>
                                      + Add to board
                                    </button>
                                    {renderCardMenu(task)}
                                  </div>
                                ) : (
                                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                                  {ledMenuId === task.id ? (
                                    <div className="flex items-center gap-1 w-full mb-1">
                                      <button onClick={() => setLed(task.id, null)}
                                        className="px-2 py-1 a-chip-btn rounded-lg text-[10px] font-black">Off</button>
                                      {LED_KEYS.map(k => (
                                        <button key={k} onClick={() => setLed(task.id, k)} title={k}
                                          aria-label={k}
                                          className="w-5 h-5 rounded-full"
                                          style={{ background: LED_HEX[k],
                                                   outline: task.led === k ? '2px solid var(--a-text)' : 'none',
                                                   outlineOffset: 1 }} />
                                      ))}
                                    </div>
                                  ) : (
                                    <button onClick={() => setLedMenuId(task.id)}
                                      title="Light this card up so a team knows to attack it next"
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${task.led ? 'a-chip-on' : 'a-chip-btn'}`}>
                                      {task.led
                                        ? <><span style={{ color: LED_HEX[task.led] }}>●</span> Lit</>
                                        : '○ Light'}
                                    </button>
                                  )}
                                  <button onClick={() => navigate(`/bingo-dash/admin/task/${task.id}?from=library`)}
                                    className="px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors">Edit</button>
                                  <button onClick={() => setQrTask(task)}
                                    className="px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors">QR</button>
                                  <button onClick={() => copyLink(task.id)}
                                    className="px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors">
                                    {copiedId === task.id ? '✓' : '🔗'}
                                  </button>
                                  <button onClick={() => duplicateTask(task)}
                                    className="px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors"
                                    title="Duplicate this card">⎘ Copy</button>
                                  <button onClick={() => openTileEdit(task)}
                                    className="px-3 py-1.5 a-chip-btn rounded-lg text-xs font-bold transition-colors"
                                    title="Move to another section">Move</button>
                                  <button onClick={() => deleteTask(task.id, task.title)}
                                    className="px-3 py-1.5 a-chip-danger transition-colors">Delete</button>
                                  {/* No ⋯ menu here: every one of its items is
                                      already a button in this strip. It stays in
                                      Complete Library, where the strip does not. */}
                                </div>
                                )}
                              </div>
                            )})}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* ── Challenges gallery (Board tab, scoped to current section) ──────── */}
        {/* The landing screen. A trainer following 1 → 5 top to bottom runs a
            correct event without being told how — which is the whole point,
            since the people renting this are not developers. */}
        {activeTab === 'run' && (() => {
          const placed = boardCards.filter(bc => bc.section_id === currentSectionId).length
          const teamCount = scopedTeams.length
          const live = !!currentBoard?.game_started
          const btn = 'px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95'
          return (
            <RunEventPanel>
              <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl border"
                   style={{ background: 'var(--a-surface-2)', borderColor: 'var(--a-border)' }}>
                <div>
                  <p className="text-sm font-black a-text">🎬 Try a live demo</p>
                  <p className="text-xs a-text-2 mt-0.5">Preview the board, phone remote and BINGO flow — nothing is saved.</p>
                </div>
                <a
                  href={currentSectionId ? `/bingo-dash/sample?board=${currentSectionId}` : undefined}
                  target="_blank" rel="noreferrer"
                  aria-disabled={!currentSectionId}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95 flex-shrink-0 ${currentSectionId ? 'a-text' : ''}`}
                  style={{
                    background: currentSectionId ? 'var(--a-brand)' : 'var(--a-surface-3)',
                    color: currentSectionId ? undefined : 'var(--a-text-2)',
                    pointerEvents: currentSectionId ? 'auto' : 'none',
                    opacity: currentSectionId ? 1 : 0.6,
                  }}
                >
                  Launch demo
                </a>
              </div>

              <Step n={1} done={!!currentBoard}
                title="Pick the board for this event"
                blurb="Each board is one event: its own cards, teams and scoreboard."
                action={
                  <span className="px-3 py-1.5 rounded-lg text-sm font-bold"
                        style={{ background: 'var(--a-brand-soft)', color: 'var(--a-brand)' }}>
                    {currentBoard?.name ?? 'None selected'}
                  </span>
                } />

              <Step n={2} done={teamCount > 0}
                title="Add your teams"
                blurb="Participants join a team with its name and password."
                warn={teamCount === 0 ? 'No teams yet — players cannot join' : undefined}
                action={
                  <button onClick={() => setActiveTab('teams')}
                    className={btn} style={{ background: 'var(--a-surface-2)', color: 'var(--a-text)' }}>
                    {teamCount > 0 ? `${teamCount} teams` : 'Add teams'}
                  </button>
                } />

              <Step n={3} done={placed > 0}
                title="Place cards on the grid"
                blurb="Drag challenges from your library onto the 5×5 board."
                warn={placed === 0 ? 'The board is empty' : undefined}
                action={
                  <button onClick={() => setActiveTab('board')}
                    className={btn} style={{ background: 'var(--a-surface-2)', color: 'var(--a-text)' }}>
                    {placed} / 25 placed
                  </button>
                } />

              <Step n={4} done={teamCount > 0 && placed > 0}
                title="Share the join link"
                blurb="Show the QR on the projector, or send the link to the group."
                action={
                  <button
                    onClick={() => { setShowJoinLink(true); setJoinLinkCopied(false); setJoinLinkTab('player') }}
                    className={`${btn} a-text`} style={{ background: 'var(--a-brand)' }}>
                    📱 Show QR
                  </button>
                } />

              <Step n={5} done={live}
                title={live ? 'Your event is running' : 'Start the game'}
                blurb={live
                  ? 'Players can open cards and score. Open the scoreboard for the room.'
                  : 'Until you start, players see a waiting screen.'}
                action={
                  <div className="flex gap-2">
                    <a href={currentBoard ? `/bingo-dash/projector/${currentBoard.slug}` : '/bingo-dash/projector'}
                       target="_blank" rel="noreferrer"
                       className={btn} style={{ background: 'var(--a-surface-2)', color: 'var(--a-text)' }}>
                      📺 Scoreboard
                    </a>
                    <button
                      onClick={() => updateBoardSettings({ game_started: !live })}
                      className={`${btn} a-text`}
                      style={{ background: live ? '#b91c1c' : 'var(--a-live)' }}>
                      {live ? '■ Stop game' : '▶ Start game'}
                    </button>
                  </div>
                } />
            </RunEventPanel>
          )
        })()}

        {/* Board options. Set once per event, so they live away from the
            editor rather than stacked above it. */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl space-y-3">
            <div className="mb-6">
              <h1 className="text-3xl font-black a-text tracking-tight">Board settings</h1>
              <p className="a-text-2 mt-1.5 text-sm">Options for <strong>{currentBoard?.name}</strong>. Each row shows its current value.</p>
            </div>
            <AdminSection icon="🧊" title="Board Faces"
          blurb="A cube board is several 5×5 boards in one. Same bingo rules on every face — more faces simply means more to complete."
          summary={<>{normaliseFaceCount(currentBoard?.face_count)} × 5×5</>}>
          {(() => {
            const current = normaliseFaceCount(currentBoard?.face_count)
            return (
              <div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => { if (current !== n) { updateBoardSettings({ face_count: n }); setEditFace(0) } }}
                      className={`w-16 py-3 rounded-xl font-black transition-colors ${
                        current === n ? 'bg-teal-600 text-white' : 'a-surface-2 a-text-2 hover:a-text'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs a-text-3 mt-3">
                  {current === 1
                    ? 'One flat 5×5 — the classic game.'
                    : `${current} faces · ${current * 25} tiles · up to ${current * 12} bingo lines.`}
                </p>
              </div>
            )
          })()}
        </AdminSection>

        <AdminSection icon="🎨" title="Scoreboard Theme"
          blurb="How the projector looks for this board — a legibility choice as much as a visual one."
          summary={<>{getScoreboardTheme(currentBoard?.scoreboard_theme).name}</>}>

          
          
          {(() => {
            const current = getScoreboardTheme(currentBoard?.scoreboard_theme).key
            return (
              <div className="grid sm:grid-cols-3 gap-2">
                {SCOREBOARD_THEMES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => { if (current !== t.key) updateBoardSettings({ scoreboard_theme: t.key }) }}
                    className={`p-4 rounded-lg text-left border transition-colors ${
                      current === t.key
                        ? 'bg-teal-500 border-teal-500 a-text'
                        : 'a-bg a-border a-text-2 hover:border-teal-500'
                    }`}
                  >
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className={`text-[11px] mt-0.5 leading-snug ${current === t.key ? 'a-text/75' : 'a-text-3'}`}>
                      {t.hint}
                    </p>
                  </button>
                ))}
              </div>
            )
          })()}
        
        </AdminSection>

        {/* ── Marshal Password ──────────────────────────────────────────────── */}
        <AdminSection icon="🔒" title="Marshal Password"
          blurb="Participants must enter this to complete challenges that require a marshal."
          summary={<>{'•'.repeat((currentBoard?.marshal_password ?? '').length || 4)}</>}>

          
          
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={currentBoard?.marshal_password ?? ''}
              onChange={e => setSections(prev => prev.map(s => s.id === currentSectionId ? { ...s, marshal_password: e.target.value } : s))}
              placeholder="Marshal password..."
              className="flex-1 px-4 py-2.5 rounded-lg border a-border a-surface a-text placeholder-gray-600 text-sm font-mono font-bold focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={() => {
                if (!currentBoard) return
                updateBoardSettings({ marshal_password: currentBoard.marshal_password })
              }}
              className="px-5 py-2.5 rounded-lg text-sm font-bold a-text bg-teal-500 hover:bg-teal-600 transition-colors"
            >
              Save
            </button>
          </div>

          {/* Photo submissions global toggle */}
          <div className="mt-5 flex items-center justify-between gap-4 p-4 rounded-lg border a-border a-surface/50">
            <div>
              <p className="text-sm font-bold a-text">Photo submissions</p>
              <p className="text-xs a-text-3 mt-0.5">When ON, every task tile shows a photo upload — primary on photo-type cards, optional/evidence on marshal & answer cards. Turn OFF during marshal-led rounds where photos are not collected.</p>
            </div>
            <button
              onClick={() => {
                if (!currentBoard) return
                updateBoardSettings({ photo_submissions_enabled: !currentBoard.photo_submissions_enabled })
              }}
              role="switch"
              aria-checked={currentBoard?.photo_submissions_enabled ?? true}
              className={`relative shrink-0 w-14 h-8 rounded-full transition-colors ${
                currentBoard?.photo_submissions_enabled ?? true ? 'bg-teal-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 rounded-full a-surface shadow transition-transform ${
                  currentBoard?.photo_submissions_enabled ?? true ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        
        </AdminSection>

        {/* ── Board Note (shown below the bingo board on the player page) ──── */}
        <AdminSection icon="📌" title="Board Note"
          blurb="Shown under the bingo board on the player page — leave empty to hide it."
          summary={<>{currentBoard?.board_note ? 'Set' : 'Off'}</>}>

          
          
          {(() => {
            const sec = sections.find(s => s.id === currentSectionId)
            if (!sec) return null
            return (
              <div className="p-4 rounded-lg border a-border a-surface/50">
                <label className="block text-xs font-bold a-text-2 uppercase tracking-wider mb-1">Note</label>
                <textarea
                  value={sec.board_note ?? ''}
                  onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, board_note: e.target.value } : s))}
                  placeholder="e.g. 🌱 Collect one item for the Bonsai Project after every 2 completed boxes!"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border a-border a-bg a-text placeholder-gray-600 text-sm font-medium focus:outline-none focus:border-teal-500 resize-none"
                />
                <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-bold a-text-2 uppercase tracking-wider mb-1">Item counter</label>
                    <div className="flex items-center gap-2 text-sm a-text-2">
                      <span>Collect 1 item per</span>
                      <input
                        type="number" min={0}
                        value={sec.board_note_every ?? 2}
                        onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, board_note_every: Math.max(0, parseInt(e.target.value) || 0) } : s))}
                        className="w-16 px-2 py-1.5 rounded-lg border a-border a-bg a-text text-center font-bold focus:outline-none focus:border-teal-500"
                      />
                      <span>completed boxes</span>
                    </div>
                    <p className="text-[11px] a-text-3 mt-1">Players see a live tally of items to collect. Set to 0 to hide the counter.</p>
                  </div>
                  <button
                    onClick={saveBoardNote}
                    className="px-5 py-2 rounded-lg text-sm font-bold a-text bg-teal-500 hover:bg-teal-600 transition-colors"
                  >
                    Save note
                  </button>
                </div>
              </div>
            )
          })()}
        
        </AdminSection>

        {/* ── Tile Display (icon vs words on the player board) ───────────────── */}
        <AdminSection icon="🔡" title="Tile Display"
          blurb="Whether grid tiles show a category icon or the challenge name."
          summary={<>{currentBoard?.tile_display === 'words' ? 'Words' : 'Icons'}</>}>

          
          
          {(() => {
            const mode = currentBoard?.tile_display === 'words' ? 'words' : 'icon'
            const sampleTasks = (gridTasks.length > 0 ? gridTasks : scopedTasks).slice(0, 3)
            const options = [
              { value: 'icon' as const, label: 'Icons', hint: 'One big category icon per tile' },
              { value: 'words' as const, label: 'Words', hint: 'CATEGORY + shortened title' },
            ]
            return (
              <div className="p-4 rounded-lg border a-border a-surface/50 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex gap-2">
                  {options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { if (mode !== opt.value) updateBoardSettings({ tile_display: opt.value }) }}
                      disabled={timerSaving}
                      className={`px-4 py-3 rounded-lg text-left border transition-colors disabled:opacity-40 ${
                        mode === opt.value
                          ? 'bg-teal-500 border-teal-500 a-text'
                          : 'a-bg a-border a-text-2 hover:border-teal-500'
                      }`}
                    >
                      <p className="text-sm font-bold">{opt.label}</p>
                      <p className={`text-[11px] mt-0.5 ${mode === opt.value ? 'a-text/75' : 'a-text-3'}`}>
                        {opt.hint}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Live preview — the same tile face players see */}
                {sampleTasks.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold a-text-3 uppercase tracking-widest">Preview</span>
                    <div className="flex gap-1.5">
                      {sampleTasks.map(t => (
                        <div
                          key={t.id}
                          className="relative w-[70px] h-[70px] rounded-xl overflow-hidden flex items-center justify-center"
                          style={{ backgroundColor: t.hex_code, boxShadow: `0 3px 10px ${t.hex_code}55` }}
                        >
                          <TileFace task={t} display={mode} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        
        </AdminSection>
          </div>
        )}

        {activeTab === 'board' && <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold a-text">Challenges</h2>
            <button onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-teal-600 a-text rounded-lg hover:bg-violet-700 text-sm font-medium transition-colors">
              + Add Challenge
            </button>
          </div>

          {/* ── Section manager (challenge sections group categories) ── */}
          {(() => {
            const currentCS = challengeSections.filter(cs => cs.game_section_id === currentSectionId)
            const currentCats = categories.filter(c => c.section_id === currentSectionId)
            return (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setShowChallengeSectionManager(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      showChallengeSectionManager ? 'bg-teal-100/50 text-teal-600 border border-violet-700' : 'a-surface/10 a-text-2 hover:a-surface/15 hover:a-text'
                    }`}
                  >
                    ▤ Sections ({currentCS.length})
                  </button>
                  {currentCS.map(cs => (
                    <span key={cs.id} className="px-2.5 py-1 bg-teal-100/40 border border-violet-700 text-teal-500 rounded-lg text-xs font-bold">
                      {cs.name}
                    </span>
                  ))}
                </div>

                {showChallengeSectionManager && (
                  <div className="bg-gray-800/60 border a-border rounded-xl p-4 mb-4">
                    <p className="text-xs font-black a-text-2 uppercase tracking-widest mb-3">Manage Sections</p>

                    {/* Existing sections */}
                    <div className="flex flex-col gap-2 mb-3">
                      {currentCS.length === 0 ? (
                        <p className="text-xs a-text-2 italic">No sections yet — create one below to group your categories.</p>
                      ) : (
                        currentCS.map(cs => {
                          const assignedCats = currentCats.filter(c => c.challenge_section_id === cs.id)
                          return (
                            <div key={cs.id} className="a-surface border a-border rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2 mb-1.5">
                                {renamingCSId === cs.id ? (
                                  <input
                                    autoFocus
                                    value={renamingCSName}
                                    onChange={e => setRenamingCSName(e.target.value)}
                                    onBlur={() => renameChallengeSection(cs.id, renamingCSName)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') renameChallengeSection(cs.id, renamingCSName)
                                      if (e.key === 'Escape') setRenamingCSId(null)
                                    }}
                                    className="flex-1 text-sm font-bold a-text bg-transparent border-b border-teal-500 focus:outline-none px-1"
                                  />
                                ) : (
                                  <span className="flex-1 text-sm font-bold a-text">{cs.name}</span>
                                )}
                                <button
                                  onClick={() => { setRenamingCSId(cs.id); setRenamingCSName(cs.name) }}
                                  className="text-xs a-text-2 hover:text-teal-600 transition-colors px-1"
                                >Rename</button>
                                <button
                                  onClick={() => deleteChallengeSection(cs.id)}
                                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-1"
                                >Delete</button>
                              </div>
                              {/* Category assignment */}
                              <div className="flex flex-wrap gap-1.5">
                                {currentCats.length === 0 ? (
                                  <span className="text-xs a-text-2 italic">No categories yet</span>
                                ) : (
                                  currentCats.map(cat => {
                                    const isAssigned = cat.challenge_section_id === cs.id
                                    return (
                                      <button
                                        key={cat.id}
                                        onClick={() => assignCategoryToSection(cat.id, isAssigned ? null : cs.id)}
                                        className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                                          isAssigned
                                            ? 'bg-teal-600 a-text'
                                            : 'a-surface-2 a-text-3 hover:bg-violet-100 hover:text-violet-700'
                                        }`}
                                      >
                                        {cat.name}
                                      </button>
                                    )
                                  })
                                )}
                              </div>
                              {assignedCats.length > 0 && (
                                <p className="text-xs a-text-2 mt-1">
                                  {assignedCats.length} categor{assignedCats.length !== 1 ? 'ies' : 'y'} assigned
                                </p>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Create new section */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newChallengeSectionName}
                        onChange={e => setNewChallengeSectionName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createChallengeSection() }}
                        placeholder="New section name…"
                        className="flex-1 px-3 py-1.5 rounded-lg border a-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        onClick={createChallengeSection}
                        disabled={!newChallengeSectionName.trim()}
                        className="px-4 py-1.5 bg-teal-600 a-text rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40"
                      >
                        + Add Section
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Category filter chips */}
          {allCategories.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-5">
              <button onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${categoryFilter === 'all' ? 'bg-teal-600 a-text shadow-lg shadow-teal-100/60 ring-1 ring-teal-500/40' : 'a-surface/10 a-text-2 hover:a-surface/20 hover:a-text'}`}>
                All ({scopedTasks.length})
              </button>
              {allCategories.map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${categoryFilter === cat ? 'bg-teal-600 a-text shadow-lg shadow-teal-100/60 ring-1 ring-teal-500/40' : 'a-surface/10 a-text-2 hover:a-surface/20 hover:a-text'}`}>
                  {cat} ({scopedTasks.filter(t => t.category === cat).length})
                </button>
              ))}
              {scopedTasks.some(t => !t.category) && (
                <button onClick={() => setCategoryFilter('__none__')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${categoryFilter === '__none__' ? 'bg-teal-600 a-text shadow-lg shadow-teal-100/60 ring-1 ring-teal-500/40' : 'a-surface/10 a-text-2 hover:a-surface/20 hover:a-text'}`}>
                  Uncategorized ({scopedTasks.filter(t => !t.category).length})
                </button>
              )}
            </div>
          )}

          {/* New challenge form */}
          {showForm && (
            <div className="a-surface rounded-xl border a-border p-6 mb-6">
              <h3 className="font-bold a-text mb-4">New Challenge</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium a-text-3 mb-1">Title</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. Water Challenge"
                    className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" autoFocus />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium a-text-3 mb-1">Category</label>
                    <select value={formCategory} onChange={async e => {
                      if (e.target.value === '__new__') {
                        if (!currentSectionId) return
                        const name = await promptAndCreateCategory(currentSectionId)
                        if (name) setFormCategory(name)
                        return
                      }
                      setFormCategory(e.target.value)
                    }}
                      className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 a-surface">
                      <option value="">— Uncategorized —</option>
                      {categories.filter(c => c.section_id === currentSectionId).map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      <option value="__new__">+ New category…</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-sm font-medium a-text-3 mb-1">Points</label>
                    <input type="number" value={formPoints} min={0}
                      onChange={e => setFormPoints(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 text-center font-bold" />
                  </div>
                </div>
                <ColorPicker hex={formHex} colorName={formColor} onHexChange={setFormHex} onNameChange={setFormColor} />
                {/* Type toggle */}
                <div>
                  <label className="block text-sm font-medium a-text-3 mb-2">Card Type</label>
                  <div className="flex rounded-lg overflow-hidden border a-border">
                    <button type="button" onClick={() => setFormTaskType('standard')}
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'standard' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Standard
                    </button>
                    <button type="button" onClick={() => setFormTaskType('answer')}
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'answer' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Answer Input
                    </button>
                    <button type="button" onClick={() => setFormTaskType('sign_splice')}
                      title="Teams hunt each letter of their movie title on a different shop sign"
                      className={`flex-1 py-2 text-sm font-bold transition-colors ${formTaskType === 'sign_splice' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}>
                      Sign Splice
                    </button>
                  </div>
                </div>
                {formTaskType === 'answer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium a-text-3 mb-1">Question / Prompt</label>
                      <input type="text" value={formAnswerQuestion} onChange={e => setFormAnswerQuestion(e.target.value)}
                        placeholder="e.g. What is the name of this landmark?"
                        className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium a-text-3 mb-1">Answer Template</label>
                      <p className="text-xs a-text-2 mb-1">One answer per line. Each line becomes a row of letter boxes.</p>
                      <textarea value={formAnswerText} onChange={e => setFormAnswerText(e.target.value)}
                        placeholder={"e.g.\nPETRONAS\nTWIN TOWERS"}
                        rows={3}
                        className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm resize-none" />
                    </div>
                  </>
                )}
                <div className="flex gap-3">
                  <button onClick={createTask} disabled={formSaving || !formTitle.trim() || !formColor.trim()}
                    className="px-6 py-2 bg-teal-600 a-text rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm transition-colors">
                    {formSaving ? 'Creating...' : 'Create Challenge'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-6 py-2 a-surface-2 a-text-3 rounded-lg hover:bg-gray-300 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Grouped gallery — Section → Category → Cards */}
          {scopedTasks.length === 0 ? (
            <p className="a-text-2 text-center py-8 a-surface rounded-xl border a-border">
              No challenges yet. Click "Add Challenge" to create one.
            </p>
          ) : categoryFilter !== 'all' && groupedTasks.length === 0 ? (
            <p className="a-text-2 text-center py-8 a-surface rounded-xl border a-border">
              No challenges in this category.
            </p>
          ) : categoryFilter !== 'all' ? (
            /* Filtered view: flat category rendering */
            <div className="flex flex-col gap-8">
              {groupedTasks.map(group => (
                <CategoryGroupBlock
                  key={group.key}
                  group={group}
                  editingCategoryId={editingCategoryId}
                  setEditingCategoryId={setEditingCategoryId}
                  categories={categories}
                  scans={scans}
                  copiedId={copiedId}
                  boardCountByTask={boardCountByTask}
                  navigate={navigate}
                  saveCategoryInline={saveCategoryInline}
                  setBulkCategoryColor={setBulkCategoryColor}
                  setBulkCategoryPoints={setBulkCategoryPoints}
                  renameCategoryByLabel={renameCategoryByLabel}
                  setQrTask={setQrTask}
                  copyLink={copyLink}
                  duplicateTask={duplicateTask}
                  openTileEdit={openTileEdit}
                  deleteTask={deleteTask}
                />
              ))}
            </div>
          ) : (
            /* All: two-level Section → Category rendering */
            <div className="flex flex-col gap-10">
              {groupedByChallengeSections.map(({ cs, groups }) => {
                const hasSections = challengeSections.filter(s => s.game_section_id === currentSectionId).length > 0
                return (
                  <div key={cs?.id ?? '__unassigned__'}>
                    {/* Challenge section header — only shown when sections exist */}
                    {hasSections && (
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-sm font-black a-text-2 uppercase tracking-wider">
                          {cs?.name ?? 'Uncategorized'}
                        </h2>
                        <span className="text-xs a-text-3 font-medium">
                          {groups.reduce((n, g) => n + g.tasks.length, 0)} challenges
                        </span>
                        <div className="flex-1 h-px a-surface/10" />
                      </div>
                    )}
                    {/* Categories within this challenge section */}
                    <div className={`flex flex-col gap-8${hasSections ? ' pl-4' : ''}`}>
                      {groups.length === 0 ? (
                        <p className="a-text-2 text-sm italic">No challenges assigned to this section yet.</p>
                      ) : (
                        groups.map(group => (
                          <CategoryGroupBlock
                            key={group.key}
                            group={group}
                            editingCategoryId={editingCategoryId}
                            setEditingCategoryId={setEditingCategoryId}
                            categories={categories}
                            scans={scans}
                            copiedId={copiedId}
                            boardCountByTask={boardCountByTask}
                            navigate={navigate}
                            saveCategoryInline={saveCategoryInline}
                            setBulkCategoryColor={setBulkCategoryColor}
                            setBulkCategoryPoints={setBulkCategoryPoints}
                            renameCategoryByLabel={renameCategoryByLabel}
                            setQrTask={setQrTask}
                            copyLink={copyLink}
                            duplicateTask={duplicateTask}
                            openTileEdit={openTileEdit}
                            deleteTask={deleteTask}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>}

        {/* ── Teams tab ────────────────────────────────────────────────────── */}
        {activeTab === 'teams' && (
        <section>
          {/* Teams for the current board */}
          {(() => {
            const section = sections.find(s => s.id === currentSectionId)
            if (!section) return null
            const sectionTeams = scopedTeams
            return (
              <div key={section.id} className="mb-10">
                {/* Board header */}
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-base font-black a-text uppercase tracking-wider">{section.name}</h2>
                  {activeBoardPointer === section.id && (
                    <span className="text-[10px] font-black text-green-400 bg-green-950/60 border border-green-800 px-1.5 py-0.5 rounded uppercase">Live</span>
                  )}
                  <span className="text-xs a-text-3 font-medium">{sectionTeams.length} group{sectionTeams.length !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px a-surface/10" />
                  <button
                    onClick={() => { setShowAllTeamsLink(true); setAllTeamsLinkCopied(false) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                    title="Share a single live link showing every group and their members"
                  >
                    🔗 Live Teams Link
                  </button>
                </div>

                {/* Create group form */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createGroup(section.id) }}
                    placeholder="Group name..."
                    className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border a-border a-surface a-text placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={newGroupPassword}
                    onChange={e => setNewGroupPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onKeyDown={e => { if (e.key === 'Enter') createGroup(section.id) }}
                    placeholder="4-digit password"
                    className="w-36 px-3 py-2 rounded-lg border a-border a-surface a-text placeholder-gray-600 text-sm font-mono tracking-widest text-center focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={() => createGroup(section.id)}
                    disabled={!newGroupName.trim() || newGroupPassword.length !== 4}
                    className="px-4 py-2 rounded-lg text-sm font-bold a-text bg-teal-600 hover:bg-teal-500 disabled:opacity-40 transition-colors shadow-lg shadow-teal-100/30"
                  >
                    + Create Group
                  </button>
                  <button
                    onClick={() => {
                      const n = parseInt(prompt('How many groups to bulk create?', '16') ?? '', 10)
                      if (Number.isFinite(n) && n > 0) bulkCreateGroups(section.id, n)
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-bold a-text-2 a-surface/10 hover:a-surface/15 transition-colors"
                  >
                    Bulk Create
                  </button>
                  {sectionTeams.length > 0 && (
                    <button
                      onClick={resetTeams}
                      disabled={resettingTeams}
                      className="px-4 py-2 rounded-lg text-sm font-bold text-red-300 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                      title="Delete every group on this board, leaving it with no teams. Other boards are unaffected."
                    >
                      {resettingTeams ? 'Resetting…' : '↺ Reset Teams'}
                    </button>
                  )}
                </div>
                {sectionTeams.length > 0 && (<div className="rounded-xl border a-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b a-border a-surface-2">
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-14">Photo</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px]">Group</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-20">PWD</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-28">Members</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px]">Board</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-36">Progress</th>
                        <th className="text-left px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-16" title="Bonus points from other games">Bonus</th>
                        <th className="text-right px-3 py-2.5 font-bold a-text-3 uppercase tracking-wide text-[11px] w-36">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sectionTeams.map(team => {
                        const teamScans = scans.filter(s => s.team_id === team.id)
                        const sectionGridTasks = boardTasksForSection(section.id)
                        const gridTaskIds = new Set(sectionGridTasks.map(t => t.id))
                        const completedCount = teamScans.filter(s => s.completed && gridTaskIds.has(s.task_id)).length
                        const completedIds = new Set(teamScans.filter(s => s.completed).map(s => s.task_id))
                        // Tile points plus any contest bonuses this team won in
                        // duels — the latter is a defender's only scoring record.
                        const pointsEarned = teamScans
                          .filter(s => s.completed && gridTaskIds.has(s.task_id))
                          .reduce((sum, s) => sum + (sectionGridTasks.find(t => t.id === s.task_id)?.points ?? 0), 0)
                          + (duelBonuses.get(team.id) ?? 0)
                        const pct = sectionGridTasks.length > 0 ? Math.round((completedCount / sectionGridTasks.length) * 100) : 0
                        const teamSlots = buildBingoSlots(sectionGridTasks)
                        const teamBingoLines = completedBingoLines(teamSlots, completedIds).length
                        const teamMembers = members.filter(m => m.team_id === team.id)
                        const isFull = teamMembers.length >= 4
                        return (
                          <tr key={team.id} className="hover:a-surface-2 transition-colors group">
                            {/* Photo */}
                            <td className="px-3 py-2.5">
                              <div className="relative group/photo">
                                <label
                                  className={`block w-9 h-9 rounded-full overflow-hidden border-2 ${team.photo_url ? 'border-teal-500/60' : 'border-dashed border-white/20'} a-surface-2 cursor-pointer hover:border-teal-500 transition-colors ${uploadingTeamPhoto === team.id ? 'opacity-60' : ''}`}
                                  title={team.photo_url ? 'Click to replace photo' : 'Click to upload photo'}
                                >
                                  {team.photo_url ? (
                                    <img src={team.photo_url} alt={`${team.name} photo`} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center a-text-3 text-base">
                                      {uploadingTeamPhoto === team.id ? '…' : '+'}
                                    </div>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingTeamPhoto === team.id}
                                    onChange={e => {
                                      const f = e.target.files?.[0]
                                      e.target.value = ''
                                      if (f) uploadTeamPhoto(team.id, f)
                                    }}
                                  />
                                </label>
                                {team.photo_url && uploadingTeamPhoto !== team.id && (
                                  <button
                                    type="button"
                                    onClick={() => removeTeamPhoto(team.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 a-text text-[10px] font-bold leading-none flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity shadow"
                                    title="Remove photo"
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                            </td>
                            {/* Group name */}
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                defaultValue={team.name}
                                key={`${team.id}-name-${team.name}`}
                                onBlur={e => {
                                  const v = e.target.value.trim()
                                  if (v && v !== team.name) updateTeam(team.id, { name: v })
                                  else e.target.value = team.name
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                className="w-full px-2 py-1 rounded border border-transparent hover:border-white/20 focus:border-teal-500 focus:outline-none font-medium a-text bg-transparent text-sm"
                              />
                            </td>
                            {/* Password */}
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                defaultValue={team.password}
                                placeholder="—"
                                key={`${team.id}-pwd-${team.password}`}
                                onBlur={e => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                                  if (v !== team.password) updateTeam(team.id, { password: v })
                                  e.target.value = v
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                className={`w-16 px-2 py-1 rounded border border-transparent hover:border-white/20 focus:border-teal-500 focus:outline-none font-mono tracking-widest text-center bg-transparent text-sm ${
                                  team.password ? 'a-text-2' : 'a-text-3'
                                }`}
                                title={team.password ? 'Team password' : 'Not set — enter a 4-digit password'}
                              />
                            </td>
                            {/* Members */}
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-sm font-bold ${isFull ? 'text-red-400' : 'a-text-2'}`}>
                                  {teamMembers.length} / 4
                                </span>
                                {teamMembers.length > 0 && (
                                  <div className="flex flex-col gap-0.5">
                                    {teamMembers.map(m => (
                                      <div key={m.id} className="flex items-center gap-1 group/m">
                                        <span className="text-[11px] a-text-2 truncate max-w-[72px]">{m.name}</span>
                                        <select
                                          value=""
                                          onChange={e => { if (e.target.value) moveMember(m.id, e.target.value) }}
                                          className="text-[9px] bg-transparent a-text-3 hover:a-text-2 cursor-pointer outline-none border-none opacity-0 group-hover/m:opacity-100 transition-opacity"
                                          title={`Move ${m.name}`}
                                        >
                                          <option value="">Move…</option>
                                          {sectionTeams.filter(t => t.id !== team.id).map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => removeMember(m.id, m.name, team.name)}
                                          className="w-3.5 h-3.5 rounded-full a-surface/10 hover:bg-red-500 hover:a-text a-text-3 text-[9px] font-bold leading-none flex items-center justify-center transition-colors opacity-0 group-hover/m:opacity-100"
                                          title={`Remove ${m.name}`}
                                        >
                                          &times;
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* Board/Compartment */}
                            <td className="px-3 py-2.5">
                              <select
                                value={team.section_id}
                                onChange={e => moveTeamToSection(team.id, e.target.value)}
                                className="px-2 py-1 rounded border a-border text-xs bg-gray-800 a-text-2 focus:outline-none focus:border-teal-500"
                              >
                                {myBoards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </td>
                            {/* Progress + Bingos */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="flex-1 h-1 a-surface/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[11px] a-text-3 font-mono whitespace-nowrap">
                                  {completedCount}/{sectionGridTasks.length}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black text-amber-500">{teamBingoLines}</span>
                                <span className="text-[11px] a-text-3">bingos</span>
                                {pointsEarned > 0 && (
                                  <span className="text-[11px] a-text-3 font-bold">{pointsEarned}pts</span>
                                )}
                              </div>
                            </td>
                            {/* Bonus */}
                            <td className="px-3 py-2.5">
                              {(() => {
                                const bonusTotal = team.bonus_points ?? 0
                                const itemCount = (team.bonus_breakdown ?? []).length
                                return (
                                  <button
                                    onClick={() => openBonusModal(team)}
                                    title="Edit bonus points — add activities and points for each"
                                    className={`min-w-[3.5rem] px-2.5 py-1 rounded-lg border font-mono text-center text-sm transition-colors ${
                                      bonusTotal !== 0
                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                        : 'a-border bg-transparent a-text-3 hover:border-white/30 hover:a-text-2'
                                    }`}
                                  >
                                    {bonusTotal !== 0 ? (bonusTotal > 0 ? `+${bonusTotal}` : bonusTotal) : 'Add'}
                                    {itemCount > 0 && (
                                      <span className="ml-1 text-[10px] a-text-3 font-sans">
                                        ({itemCount})
                                      </span>
                                    )}
                                  </button>
                                )
                              })()}
                            </td>
                            {/* Actions */}
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => { setMembersLinkTeam(team); setMembersLinkCopied(false) }}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                                  title="Share a live link to this group's member list"
                                >
                                  🔗 Members
                                </button>
                                <button
                                  onClick={() => setViewingTeam(team)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-teal-500 border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 transition-colors whitespace-nowrap"
                                >
                                  Grid
                                </button>
                                <button
                                  onClick={() => resetTeamScore(team.id, team.name)}
                                  disabled={completedCount === 0 && (team.bonus_points ?? 0) === 0}
                                  className="text-[11px] text-amber-500 hover:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  title="Reset this team's scans, photo submissions, and bonus points"
                                >
                                  Reset
                                </button>
                                <button onClick={() => deleteTeam(team.id, team.name)}
                                  className="text-[11px] a-text-3 hover:text-red-400 transition-colors">Del</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>)}
              </div>
            )
          })()}
          {scopedTeams.length === 0 && (
            <p className="a-text-2 text-sm">No groups yet. Create groups above for participants to join.</p>
          )}
        </section>
        )}

        {/* ── Submissions tab ──────────────────────────────────────────────── */}
        {activeTab === 'submissions' && (() => {
        const filteredSubmissions = photoSubmissions.filter(sub => {
          if (submissionStatusFilter !== 'all' && sub.status !== submissionStatusFilter) return false
          if (submissionBoardFilter === 'current') {
            const subTeam = teams.find(t => t.id === sub.team_id)
            if (!subTeam || subTeam.section_id !== currentSectionId) return false
          }
          return true
        })
        const selectedSubs = filteredSubmissions.filter(s => selectedSubmissionIds.has(s.id))
        const actionTargets = selectedSubs.length > 0 ? selectedSubs : filteredSubmissions
        const allVisibleSelected = filteredSubmissions.length > 0 && filteredSubmissions.every(s => selectedSubmissionIds.has(s.id))
        const someVisibleSelected = filteredSubmissions.some(s => selectedSubmissionIds.has(s.id))
        const actionLabelSuffix = selectedSubs.length > 0 ? `${selectedSubs.length} selected` : `all ${filteredSubmissions.length}`
        return (
        <section>
          <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold a-text mb-1">Photo Submissions</h2>
              <p className="text-xs a-text-3">Review images submitted by groups for photo challenges. Tick a card to act on it specifically — otherwise actions apply to every submission in view.</p>
            </div>
          </div>

          {/* Selection + bulk action bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3 p-3 rounded-xl border a-border a-surface-2">
            <label className="flex items-center gap-2 text-xs font-bold a-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected }}
                onChange={e => setAllSubmissionsSelected(filteredSubmissions, e.target.checked)}
                disabled={filteredSubmissions.length === 0}
                className="w-4 h-4 accent-teal-500"
              />
              Select all
            </label>
            {selectedSubs.length > 0 && (
              <button
                onClick={() => setSelectedSubmissionIds(new Set())}
                className="text-xs a-text-2 hover:a-text underline"
              >
                Clear ({selectedSubs.length})
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => bulkSetStatus(actionTargets, 'approved')}
              disabled={bulkActioning || actionTargets.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-green-500 a-text hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ✓ Approve {actionLabelSuffix}
            </button>
            <button
              onClick={() => bulkSetStatus(actionTargets, 'rejected')}
              disabled={bulkActioning || actionTargets.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ✗ Reject {actionLabelSuffix}
            </button>
            <button
              onClick={() => downloadSubmissionsZip(actionTargets)}
              disabled={downloadingZip || actionTargets.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-500 a-text hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Download these images as a ZIP. Filenames are <group>__<station>.jpg, sorted into approved/rejected/pending folders."
            >
              {downloadingZip ? '⏳ Zipping…' : `⬇ Download ${actionLabelSuffix}`}
            </button>
            <button
              onClick={() => bulkDeleteSubmissions(actionTargets)}
              disabled={bulkActioning || actionTargets.length === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 a-text hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Permanently delete these submissions and their photos. Resets the team's progress on affected tiles. Use to clear test data."
            >
              🗑 Delete {actionLabelSuffix}
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex items-center gap-1 a-surface-2 border a-border rounded-lg p-1">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(s => {
                const count = s === 'all'
                  ? photoSubmissions.length
                  : photoSubmissions.filter(x => x.status === s).length
                return (
                  <button
                    key={s}
                    onClick={() => setSubmissionStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                      submissionStatusFilter === s
                        ? 'bg-teal-600 a-text'
                        : 'a-text-2 hover:a-text'
                    }`}
                  >
                    {s} <span className="opacity-60">({count})</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1 a-surface-2 border a-border rounded-lg p-1">
              <button
                onClick={() => setSubmissionBoardFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                  submissionBoardFilter === 'all' ? 'bg-teal-600 a-text' : 'a-text-2 hover:a-text'
                }`}
              >
                All boards
              </button>
              <button
                onClick={() => setSubmissionBoardFilter('current')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                  submissionBoardFilter === 'current' ? 'bg-teal-600 a-text' : 'a-text-2 hover:a-text'
                }`}
              >
                Current board only
              </button>
            </div>
          </div>

          {/* List */}
          {(() => {
            if (filteredSubmissions.length === 0) {
              return (
                <div className="a-surface-2 border a-border rounded-xl p-10 text-center">
                  <div className="text-4xl mb-3">📸</div>
                  <p className="a-text font-bold">
                    {submissionStatusFilter === 'pending' ? 'Nothing waiting for you' : 'No submissions here'}
                  </p>
                  <p className="a-text-3 text-sm mt-1">
                    {submissionStatusFilter === 'pending'
                      ? 'Photos appear here the moment a team submits one.'
                      : `No ${submissionStatusFilter === 'all' ? '' : submissionStatusFilter} submissions${submissionBoardFilter === 'current' ? ' for this board' : ''}.`}
                  </p>
                </div>
              )
            }
            return (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {filteredSubmissions.map(sub => {
                  const subTeam = teams.find(t => t.id === sub.team_id)
                  const subTask = tasks.find(t => t.id === sub.task_id)
                  const isSelected = selectedSubmissionIds.has(sub.id)
                  const ring = sub.status === 'approved' ? '#16a34a'
                    : sub.status === 'rejected' ? '#dc2626' : 'var(--a-border)'
                  return (
                    <div
                      key={sub.id}
                      className="rounded-2xl overflow-hidden border-2 transition-all"
                      style={{ borderColor: isSelected ? 'var(--a-brand)' : ring, background: 'var(--a-surface)' }}
                    >
                      {/* Big enough to actually judge. A thumbnail forces a
                          click-through per submission, and at an event that is
                          a queue of people waiting while you open each one. */}
                      <div className="a-surface-2">
                        <SubmissionThumb url={sub.photo_url} fill />
                      </div>

                      <div className="p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSubmissionSelected(sub.id)}
                            className="w-4 h-4 accent-teal-500 mt-0.5 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black a-text truncate">{subTeam?.name ?? 'Unknown team'}</p>
                            <p className="text-[11px] a-text-3 truncate">{subTask?.title ?? 'Unknown challenge'}</p>
                          </div>
                        </div>

                        {sub.status === 'pending' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => bulkSetStatus([sub], 'approved')}
                              disabled={bulkActioning}
                              className="py-2 rounded-lg text-xs font-black text-white bg-green-600 hover:bg-green-500 active:scale-95 transition-all disabled:opacity-40"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => bulkSetStatus([sub], 'rejected')}
                              disabled={bulkActioning}
                              className="py-2 rounded-lg text-xs font-black text-red-500 border border-red-500/40 hover:bg-red-500/10 active:scale-95 transition-all disabled:opacity-40"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black" style={{ color: ring }}>
                              {sub.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                            </span>
                            <button
                              onClick={() => bulkSetStatus([sub], sub.status === 'approved' ? 'rejected' : 'approved')}
                              className="text-[11px] a-text-3 hover:a-text underline"
                            >
                              Change
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </section>
        )
        })()}

      </main>

      {/* ── Slot Picker Modal ───────────────────────────────────────────────── */}
      {slotPickerIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setSlotPickerIndex(null)}>
          <div className="a-surface rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col animate-bounce-in"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b a-border flex items-center justify-between">
              <div>
                <h3 className="font-bold a-text">Place a challenge</h3>
                <p className="text-xs a-text-2 mt-0.5">Slot {slotPickerIndex + 1} of 25</p>
              </div>
              <button onClick={() => setSlotPickerIndex(null)} className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
            </div>
            {/* Category filter */}
            {allCategories.length > 0 && (
              <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
                <button onClick={() => setSlotPickerFilter('all')}
                  className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${slotPickerFilter === 'all' ? 'bg-teal-600 a-text' : 'a-surface-2 a-text-3 hover:a-surface-2'}`}>
                  All
                </button>
                {allCategories.map(cat => (
                  <button key={cat} onClick={() => setSlotPickerFilter(cat)}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${slotPickerFilter === cat ? 'bg-teal-600 a-text' : 'a-surface-2 a-text-3 hover:a-surface-2'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 py-2">
              {(slotPickerFilter === 'all' ? scopedTasks : scopedTasks.filter(t => t.category === slotPickerFilter))
                .map(task => (
                <button
                  key={task.id}
                  onClick={async () => {
                    await insertIntoGrid(task.id, slotPickerIndex)
                    setSlotPickerIndex(null)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50 transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: task.hex_code }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium a-text truncate">{task.title}</p>
                    {task.category && <p className="text-xs a-text-2 truncate">{task.category}</p>}
                  </div>
                  {(task.points ?? 0) > 0 && (
                    <span className="text-xs font-bold text-teal-500 flex-shrink-0">{task.points} pts</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tile Edit Modal ──────────────────────────────────────────────────── */}
      {editingTile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => !tileSaving && setEditingTile(null)}>
          <div className="a-surface rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh] animate-bounce-in"
            onClick={e => e.stopPropagation()}>
            <div className="h-16 flex items-center px-6 gap-3" style={{ backgroundColor: tileHex }}>
              <div className="flex-1">
                {tileCategory && <p className="a-text-2 text-[10px] font-black uppercase tracking-widest">{tileCategory}</p>}
                <p className="a-text font-black text-lg leading-tight truncate">{tileTitle || 'Tile Title'}</p>
              </div>
              <button onClick={() => setEditingTile(null)} className="a-text-2 hover:a-text text-2xl font-light">&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium a-text-3 mb-1">Title</label>
                <input type="text" value={tileTitle} onChange={e => setTileTitle(e.target.value)} autoFocus
                  className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium a-text-3 mb-1">Section</label>
                <select value={tileSectionId} onChange={e => setTileSectionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 a-surface">
                  {myBoards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {editingTile && tileSectionId !== editingTile.section_id && (
                  <p className="text-xs text-amber-600 mt-1">Moving to a different section will take this card off the board.</p>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium a-text-3 mb-1">Category</label>
                  <select value={tileCategory} onChange={async e => {
                    if (e.target.value === '__new__') {
                      const name = await promptAndCreateCategory(tileSectionId)
                      if (name) setTileCategory(name)
                      return
                    }
                    setTileCategory(e.target.value)
                  }}
                    className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 a-surface">
                    <option value="">— Uncategorized —</option>
                    {categories.filter(c => c.section_id === tileSectionId).map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    <option value="__new__">+ New category…</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium a-text-3 mb-1">Points</label>
                  <input type="number" value={tilePoints} min={0}
                    onChange={e => setTilePoints(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 text-center font-bold" />
                </div>
              </div>
              <ColorPicker hex={tileHex} colorName={tileColor} onHexChange={setTileHex} onNameChange={setTileColor} />
              {/* Type toggle */}
              <div>
                <label className="block text-sm font-medium a-text-3 mb-2">Card Type</label>
                <div className="flex rounded-lg overflow-hidden border a-border">
                  <button
                    type="button"
                    onClick={() => setTileTaskType('standard')}
                    className={`flex-1 py-2 text-sm font-bold transition-colors ${tileTaskType === 'standard' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setTileTaskType('answer')}
                    className={`flex-1 py-2 text-sm font-bold transition-colors ${tileTaskType === 'answer' ? 'bg-teal-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'}`}
                  >
                    Answer Input
                  </button>
                </div>
              </div>
              {tileTaskType === 'answer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium a-text-3 mb-1">Question / Prompt</label>
                    <input type="text" value={tileAnswerQuestion} onChange={e => setTileAnswerQuestion(e.target.value)}
                      placeholder="e.g. What is the name of this landmark?"
                      className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium a-text-3 mb-1">Answer Template</label>
                    <p className="text-xs a-text-2 mb-1">One answer per line. Each line becomes a row of letter boxes.</p>
                    <textarea value={tileAnswerText} onChange={e => setTileAnswerText(e.target.value)}
                      placeholder={"e.g.\nPETRONAS\nTWIN TOWERS"}
                      rows={3}
                      className="w-full px-4 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm resize-none" />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={saveTile} disabled={tileSaving || !tileTitle.trim() || !tileColor.trim()}
                  className="flex-1 py-2.5 bg-teal-600 a-text rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {tileSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditingTile(null)} disabled={tileSaving}
                  className="px-5 py-2.5 a-surface-2 a-text-3 rounded-xl font-bold hover:a-surface-2 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Modal ────────────────────────────────────────────────────────── */}
      {qrTask && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 cursor-pointer" onClick={() => setQrTask(null)}>
          <button onClick={() => setQrTask(null)} className="absolute top-6 right-8 a-text-2 hover:a-text text-5xl font-light z-10">&times;</button>
          <div className="absolute top-6 left-0 right-0 text-center a-text-3 text-lg">Tap anywhere to go back</div>
          <div className="a-surface rounded-3xl p-10 flex flex-col items-center gap-6 max-w-lg mx-4 cursor-default animate-bounce-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl" style={{ backgroundColor: qrTask.hex_code }} />
              <h2 className="text-3xl font-black a-text">{qrTask.title}</h2>
            </div>
            <p className="a-text-2 font-medium uppercase tracking-wider text-sm">{qrTask.color} Challenge — Scan with phone camera</p>
            <div className="a-surface p-4 rounded-2xl">
              <QRCodeSVG value={`${window.location.origin}/bingo-dash/task/${qrTask.id}`} size={400} level="H" />
            </div>
            <p className="text-xs a-text-2 font-mono break-all text-center">
              {window.location.origin}/bingo-dash/task/{qrTask.id}
            </p>
            <button onClick={() => setQrTask(null)} className="px-8 py-4 a-surface a-text rounded-2xl hover:bg-gray-700 transition-all text-lg font-bold hover:scale-105 active:scale-95">
              &larr; Back to Challenges
            </button>
          </div>
        </div>
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => { if (!importing) setShowImport(false) }}>
          <div className="a-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-bounce-in" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b a-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold a-text">Import Challenges</h2>
                <p className="text-sm a-text-2 mt-0.5">Bulk-create tiles from JSON</p>
              </div>
              <button onClick={() => setShowImport(false)} className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
            </div>
            <div className="px-6 py-5 flex-1 overflow-y-auto flex flex-col gap-4">
              <details className="a-surface-2 rounded-xl overflow-hidden">
                <summary className="px-4 py-3 text-sm font-medium a-text-3 cursor-pointer hover:a-surface-2">JSON format reference ▾</summary>
                <pre className="px-4 pb-4 text-xs a-text-3 leading-relaxed overflow-x-auto">{`[
  {
    "title": "Water Challenge",
    "color": "Blue",
    "hex_code": "#3B82F6",
    "clues": ["Find a water source", "Take a team photo"]
  }
]`}</pre>
              </details>
              <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview(null); setImportError('') }}
                placeholder="Paste your JSON array here..."
                className="w-full h-40 px-4 py-3 rounded-xl border a-border font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={importing} />
              {importError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <span>🚫</span><p className="text-red-600 font-bold text-sm">{importError}</p>
                </div>
              )}
              {importPreview && (
                <div>
                  <p className="text-sm font-bold a-text-3 mb-2">Preview — {importPreview.length} challenge{importPreview.length !== 1 ? 's' : ''} to import:</p>
                  <div className="border a-border rounded-xl overflow-hidden divide-y divide-gray-100">
                    {importPreview.map((row, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: row.hex_code }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium a-text text-sm truncate">{row.title}</p>
                          <p className="text-xs a-text-2">{row.color}{row.clues.length > 0 ? ` · ${row.clues.length} clue${row.clues.length !== 1 ? 's' : ''}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t a-border flex gap-3 justify-end">
              <button onClick={() => setShowImport(false)} disabled={importing}
                className="px-5 py-2 rounded-lg a-surface-2 a-text-3 text-sm font-medium hover:a-surface-2 transition-colors disabled:opacity-50">Cancel</button>
              {!importPreview ? (
                <button onClick={handleImportPreview} disabled={!importText.trim()}
                  className="px-5 py-2 rounded-lg bg-teal-600 a-text text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-50">Preview Import</button>
              ) : (
                <button onClick={handleImportConfirm} disabled={importing}
                  className="px-5 py-2 rounded-lg bg-teal-600 a-text text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-50">
                  {importing ? 'Importing...' : `Import ${importPreview.length} Challenge${importPreview.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Section Manager Modal ───────────────────────────────────────────── */}
      {showSectionManager && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => setShowSectionManager(false)}>
          <div className="a-surface rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh] animate-bounce-in"
            onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b a-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold a-text">Sections</h3>
                <p className="text-xs a-text-2 mt-0.5">Each section is an independent game at a different location.</p>
              </div>
              <button onClick={() => setShowSectionManager(false)} className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createSection() }}
                  placeholder="New section name (e.g. Klang Hunt)"
                  className="flex-1 px-3 py-2 rounded-lg border a-border focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
                <button onClick={() => createSection()} disabled={!newSectionName.trim()}
                  className="px-4 py-2 bg-teal-600 a-text rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40">
                  Add
                </button>
              </div>
              <div className="divide-y divide-gray-100 border a-border rounded-lg">
                {myBoards.map(s => {
                  const taskCount = tasks.filter(t => t.section_id === s.id).length
                  const teamCount = teams.filter(t => t.section_id === s.id).length
                  return (
                    <div key={s.id} className={`p-3 ${s.game_started ? 'bg-green-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={s.name}
                          key={`${s.id}-${s.name}`}
                          onBlur={e => { if (e.target.value.trim() !== s.name) renameSection(s.id, e.target.value) }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          className="flex-1 px-2 py-1 rounded border border-transparent hover:a-border focus:border-teal-500 focus:outline-none text-sm font-medium bg-transparent"
                        />
                        <span className="text-xs a-text-2 flex-shrink-0">{taskCount} cards · {teamCount} teams</span>
                        <button onClick={() => deleteSection(s.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1 flex-shrink-0 disabled:opacity-30"
                          disabled={myBoards.length <= 1}>
                          Delete
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => toggleSectionGameStarted(s.id, !s.game_started)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                            s.game_started
                              ? 'bg-green-500 a-text hover:bg-red-500'
                              : 'a-surface-2 a-text-3 hover:bg-green-500 hover:a-text'
                          }`}
                        >
                          <span>{s.game_started ? '● LIVE' : '■ Locked'}</span>
                        </button>
                        <span className="text-[11px] a-text-2">
                          {s.game_started ? 'Players can access the board' : 'Players see waiting screen'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Team Grid Viewer Modal ──────────────────────────────────────────── */}
      {viewingTeam && (() => {
        const team = viewingTeam
        const teamScans = scans.filter(s => s.team_id === team.id)
        const completedIds = new Set(teamScans.filter(s => s.completed).map(s => s.task_id))
        const scannedIds = new Set(teamScans.map(s => s.task_id))
        const gridTasksForTeam = boardTasksForSection(team.section_id)
        const slots = buildBingoSlots(gridTasksForTeam)
        const completedLineIdx = completedBingoLines(slots, completedIds)
        const bingoSlotSet = new Set<number>()
        completedLineIdx.forEach(i => BINGO_LINES[i].forEach(idx => bingoSlotSet.add(idx)))
        const gridTaskIdSet = new Set(gridTasksForTeam.map(t => t.id))
        const tasksDone = teamScans.filter(s => s.completed && gridTaskIdSet.has(s.task_id)).length
        const points = gridTasksForTeam.reduce(
          (sum, t) => completedIds.has(t.id) ? sum + (t.points ?? 0) : sum, 0,
        )
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
            onClick={() => setViewingTeam(null)}>
            <div className="a-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-bounce-in"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b a-border flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Team Grid</p>
                  <h3 className="font-black a-text text-lg">{team.name}</h3>
                </div>
                <button onClick={() => setViewingTeam(null)} className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
              </div>

              {/* Stats */}
              <div className="px-5 py-3 border-b a-border grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs a-text-2 font-bold uppercase tracking-wider">Points</p>
                  <p className="text-2xl font-black a-text">{points}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs a-text-2 font-bold uppercase tracking-wider">Bingos</p>
                  <p className="text-2xl font-black text-amber-600">{completedLineIdx.length}<span className="text-sm a-text-2">/12</span></p>
                </div>
                <div className="text-center">
                  <p className="text-xs a-text-2 font-bold uppercase tracking-wider">Done</p>
                  <p className="text-2xl font-black text-green-600">{tasksDone}</p>
                </div>
              </div>

              {/* Grid */}
              <div className="p-5 overflow-y-auto">
                {gridTasksForTeam.length === 0 ? (
                  <p className="text-center a-text-2 py-8 text-sm">No grid configured for this section.</p>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5">
                    {slots.map((t, i) => {
                      if (!t) {
                        return <div key={`e-${i}`} className="aspect-square rounded-lg a-surface-2 border border-dashed a-border" />
                      }
                      const isCompleted = completedIds.has(t.id)
                      const isScanned = !isCompleted && scannedIds.has(t.id)
                      const inLine = bingoSlotSet.has(i)
                      return (
                        <div
                          key={t.id}
                          title={t.title}
                          className="relative aspect-square rounded-lg flex items-center justify-center text-center px-1 overflow-hidden"
                          style={{
                            backgroundColor: t.hex_code,
                            opacity: isCompleted ? 1 : isScanned ? 0.55 : 0.22,
                            boxShadow: inLine ? '0 0 0 2px #fbbf24, 0 0 8px #fbbf24aa' : 'none',
                          }}
                        >
                          <span className="a-text text-[9px] font-black leading-tight line-clamp-3 drop-shadow">
                            {t.title}
                          </span>
                          {isCompleted && (
                            <div className="absolute top-0.5 right-0.5 a-surface/90 rounded-full w-4 h-4 flex items-center justify-center">
                              <span className="text-green-600 text-[10px] font-black">✓</span>
                            </div>
                          )}
                          {isScanned && (
                            <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white/90" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-center gap-4 text-[11px] a-text-2 mt-4">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" />Locked</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-gray-400" />Scanned</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Completed</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Bingo</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Section-wide "Live Teams Link" Share Modal ────────────────────── */}
      {showAllTeamsLink && (() => {
        const currentSection = sections.find(s => s.id === currentSectionId)
        const url = currentSection
          ? `${window.location.origin}/bingo-dash/teams/${currentSection.slug}`
          : ''
        const sectionTeamCount = currentSectionId ? teams.filter(t => t.section_id === currentSectionId).length : 0
        const sectionMemberCount = currentSectionId
          ? members.filter(m => m.section_id === currentSectionId && m.role === 'member').length
          : 0
        const handleCopy = () => {
          if (!url) return
          navigator.clipboard.writeText(url).then(() => {
            setAllTeamsLinkCopied(true)
            setTimeout(() => setAllTeamsLinkCopied(false), 2000)
          })
        }
        const downloadQR = () => {
          const svg = document.getElementById('all-teams-qr-svg')
          if (!svg || !currentSection) return
          const svgData = new XMLSerializer().serializeToString(svg)
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const img = new Image()
          img.onload = () => {
            canvas.width = 1024
            canvas.height = 1024
            if (ctx) {
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, 1024, 1024)
              ctx.drawImage(img, 0, 0, 1024, 1024)
            }
            const a = document.createElement('a')
            a.download = `bingo-dash-teams-${currentSection.slug}.png`
            a.href = canvas.toDataURL('image/png')
            a.click()
          }
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
        }
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
            onClick={() => setShowAllTeamsLink(false)}>
            <div className="a-surface rounded-2xl shadow-2xl w-full max-w-md animate-bounce-in"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b a-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold a-text">Live Teams Link</h3>
                  <p className="text-xs a-text-2 mt-0.5">
                    For <span className="font-bold a-text-3">{currentSection?.name ?? 'this board'}</span>
                    <span className="a-text-2"> · </span>
                    <span className="font-bold text-emerald-600">{sectionTeamCount}</span> group{sectionTeamCount !== 1 ? 's' : ''}
                    <span className="a-text-2">, </span>
                    <span className="font-bold text-emerald-600">{sectionMemberCount}</span> member{sectionMemberCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setShowAllTeamsLink(false)}
                  className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
              </div>

              {!currentSection ? (
                <div className="p-8 text-center a-text-2">
                  <p className="text-sm">No board selected.</p>
                </div>
              ) : (
                <div className="p-6 flex flex-col items-center gap-5">
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 w-full">
                    <span>📡</span>
                    <p className="text-emerald-700 text-xs font-bold">
                      Anyone with this link can see <span className="font-black">every group</span> and who's inside, in real time. View only — they can't join the game.
                    </p>
                  </div>

                  <div className="a-surface p-3 rounded-2xl border a-border shadow-sm">
                    <QRCodeSVG id="all-teams-qr-svg" value={url} size={260} level="H" />
                  </div>

                  <div className="w-full flex items-center gap-2">
                    <div className="flex-1 px-3 py-2.5 a-surface-2 rounded-lg text-xs font-mono a-text-3 break-all select-all border a-border">
                      {url}
                    </div>
                    <button onClick={handleCopy}
                      className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                        allTeamsLinkCopied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-emerald-600 a-text hover:bg-emerald-700'
                      }`}>
                      {allTeamsLinkCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                    className="w-full py-3 rounded-xl a-surface a-text font-bold text-sm hover:bg-gray-700 transition-colors hover:scale-[1.02] active:scale-95">
                    Open Live View ↗
                  </button>

                  <button onClick={downloadQR}
                    className="w-full py-3 rounded-xl bg-emerald-600 a-text font-bold text-sm hover:bg-emerald-700 transition-colors hover:scale-[1.02] active:scale-95">
                    Download QR as PNG
                  </button>

                  <p className="text-[11px] a-text-2 text-center">
                    Switch boards in the BOARDS panel to share a different live link.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Per-team Bonus Points breakdown Modal ─────────────────────────── */}
      {bonusTeam && (() => {
        const total = bonusDraft.reduce((sum, i) => sum + (Number.isFinite(i.points) ? i.points : 0), 0)
        const setRow = (idx: number, patch: Partial<BonusItem>) =>
          setBonusDraft(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
        const addRow = () => setBonusDraft(prev => [...prev, { label: '', points: 0 }])
        const removeRow = (idx: number) => setBonusDraft(prev => prev.filter((_, i) => i !== idx))
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
            onClick={() => { if (!bonusSaving) setBonusTeam(null) }}>
            <div className="a-surface rounded-2xl shadow-2xl w-full max-w-lg animate-bounce-in flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b a-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold a-text">Bonus Points</h3>
                  <p className="text-xs a-text-2 mt-0.5">
                    For <span className="font-bold a-text-3">{bonusTeam.name}</span> · one line per activity
                  </p>
                </div>
                <button onClick={() => { if (!bonusSaving) setBonusTeam(null) }}
                  className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
              </div>

              <div className="px-6 py-4 overflow-y-auto">
                {bonusDraft.length === 0 && (
                  <p className="text-sm a-text-2 text-center py-6">
                    No activities yet. Add one below to start giving points.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {bonusDraft.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.label}
                        autoFocus={idx === bonusDraft.length - 1 && item.label === ''}
                        placeholder="Activity name (e.g. Tug of War)"
                        onChange={e => setRow(idx, { label: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg border a-border focus:border-teal-500 focus:outline-none text-sm a-text a-surface"
                      />
                      <input
                        type="number"
                        step="1"
                        value={Number.isFinite(item.points) ? item.points : 0}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10)
                          setRow(idx, { points: Number.isFinite(n) ? n : 0 })
                        }}
                        onFocus={e => e.target.select()}
                        className="w-20 px-2 py-2 rounded-lg border a-border focus:border-teal-500 focus:outline-none text-sm text-center font-mono a-text a-surface"
                      />
                      <button onClick={() => removeRow(idx)}
                        title="Remove this activity"
                        className="w-8 h-8 flex-shrink-0 rounded-lg a-text-2 hover:text-red-500 hover:bg-red-50 transition-colors text-lg">
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addRow}
                  className="mt-3 w-full py-2.5 rounded-lg border border-dashed a-border a-text-3 text-sm font-bold hover:border-teal-500 hover:text-teal-600 transition-colors">
                  + Add activity
                </button>
              </div>

              <div className="px-6 py-4 border-t a-border flex items-center justify-between flex-shrink-0">
                <div className="text-sm a-text-3">
                  Total bonus <span className="ml-1 font-mono font-black text-lg text-amber-600">{total > 0 ? `+${total}` : total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { if (!bonusSaving) setBonusTeam(null) }}
                    className="px-4 py-2 rounded-lg text-sm font-bold a-text-3 hover:a-surface-2 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveBonus} disabled={bonusSaving}
                    className="px-5 py-2 rounded-lg text-sm font-bold a-text bg-teal-600 hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {bonusSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Per-team "Live members link" Share Modal ──────────────────────── */}
      {membersLinkTeam && (() => {
        const team = membersLinkTeam
        const url = `${window.location.origin}/bingo-dash/team/${team.id}/members`
        const teamMembers = members.filter(m => m.team_id === team.id && m.role === 'member')
        const handleCopy = () => {
          navigator.clipboard.writeText(url).then(() => {
            setMembersLinkCopied(true)
            setTimeout(() => setMembersLinkCopied(false), 2000)
          })
        }
        const downloadQR = () => {
          const svg = document.getElementById('team-members-qr-svg')
          if (!svg) return
          const svgData = new XMLSerializer().serializeToString(svg)
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const img = new Image()
          img.onload = () => {
            canvas.width = 1024
            canvas.height = 1024
            if (ctx) {
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, 1024, 1024)
              ctx.drawImage(img, 0, 0, 1024, 1024)
            }
            const a = document.createElement('a')
            a.download = `bingo-dash-members-${team.name.replace(/\s+/g, '-').toLowerCase()}.png`
            a.href = canvas.toDataURL('image/png')
            a.click()
          }
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
        }
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
            onClick={() => setMembersLinkTeam(null)}>
            <div className="a-surface rounded-2xl shadow-2xl w-full max-w-md animate-bounce-in"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b a-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold a-text">Live Members Link</h3>
                  <p className="text-xs a-text-2 mt-0.5">
                    For <span className="font-bold a-text-3">{team.name}</span>
                    <span className="a-text-2"> · </span>
                    <span className="font-bold text-emerald-600">{teamMembers.length}</span> member{teamMembers.length !== 1 ? 's' : ''} now
                  </p>
                </div>
                <button onClick={() => setMembersLinkTeam(null)}
                  className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
              </div>

              <div className="p-6 flex flex-col items-center gap-5">
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 w-full">
                  <span>📡</span>
                  <p className="text-emerald-700 text-xs font-bold">
                    Anyone with this link can see who's in <span className="font-black">{team.name}</span> in real time. View only — they can't join the game.
                  </p>
                </div>

                <div className="a-surface p-3 rounded-2xl border a-border shadow-sm">
                  <QRCodeSVG id="team-members-qr-svg" value={url} size={260} level="H" />
                </div>

                <div className="w-full flex items-center gap-2">
                  <div className="flex-1 px-3 py-2.5 a-surface-2 rounded-lg text-xs font-mono a-text-3 break-all select-all border a-border">
                    {url}
                  </div>
                  <button onClick={handleCopy}
                    className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                      membersLinkCopied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-emerald-600 a-text hover:bg-emerald-700'
                    }`}>
                    {membersLinkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  className="w-full py-3 rounded-xl a-surface a-text font-bold text-sm hover:bg-gray-700 transition-colors hover:scale-[1.02] active:scale-95">
                  Open Live View ↗
                </button>

                <button onClick={downloadQR}
                  className="w-full py-3 rounded-xl bg-emerald-600 a-text font-bold text-sm hover:bg-emerald-700 transition-colors hover:scale-[1.02] active:scale-95">
                  Download QR as PNG
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Join Link / QR Modal ───────────────────────────────────────────── */}
      {showJoinLink && (() => {
        const currentSection = sections.find(s => s.id === currentSectionId)
        const baseUrl = currentSection
          ? `${window.location.origin}/bingo-dash/play/${currentSection.slug}`
          : ''
        const playerUrl = baseUrl
        const observerUrl = baseUrl ? `${baseUrl}?mode=observer` : ''

        const handleCopy = (url: string) => {
          navigator.clipboard.writeText(url).then(() => {
            setJoinLinkCopied(true)
            setTimeout(() => setJoinLinkCopied(false), 2000)
          })
        }

        const downloadQR = (svgId: string, filename: string) => {
          const svg = document.getElementById(svgId)
          if (!svg) return
          const svgData = new XMLSerializer().serializeToString(svg)
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const img = new Image()
          img.onload = () => {
            canvas.width = 1024
            canvas.height = 1024
            if (ctx) {
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, 1024, 1024)
              ctx.drawImage(img, 0, 0, 1024, 1024)
            }
            const a = document.createElement('a')
            a.download = filename
            a.href = canvas.toDataURL('image/png')
            a.click()
          }
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
        }

        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
            onClick={() => setShowJoinLink(false)}>
            <div className="a-surface rounded-2xl shadow-2xl w-full max-w-md animate-bounce-in"
              onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b a-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold a-text">Join Links</h3>
                  <p className="text-xs a-text-2 mt-0.5">
                    For <span className="font-bold a-text-3">{currentSection?.name ?? 'this section'}</span>
                  </p>
                </div>
                <button onClick={() => setShowJoinLink(false)}
                  className="a-text-2 hover:a-text-3 text-2xl font-light">&times;</button>
              </div>

              {!currentSection ? (
                <div className="p-8 text-center a-text-2">
                  <p className="text-sm">No section selected.</p>
                </div>
              ) : (
                <div className="p-6 flex flex-col gap-5">
                  {/* Tabs */}
                  <div className="flex rounded-xl overflow-hidden border a-border">
                    <button
                      onClick={() => setJoinLinkTab('player')}
                      className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                        joinLinkTab === 'player' ? 'a-surface a-text' : 'a-surface a-text-3 hover:a-surface-2'
                      }`}
                    >
                      🎯 Players
                    </button>
                    <button
                      onClick={() => setJoinLinkTab('observer')}
                      className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                        joinLinkTab === 'observer' ? 'bg-blue-600 a-text' : 'a-surface a-text-3 hover:a-surface-2'
                      }`}
                    >
                      👁 Observers
                    </button>
                  </div>

                  {/* Player tab */}
                  {joinLinkTab === 'player' && (
                    <div className="flex flex-col items-center gap-5">
                      <div className="a-surface p-3 rounded-2xl border a-border shadow-sm">
                        <QRCodeSVG id="join-qr-svg" value={playerUrl} size={260} level="H" />
                      </div>
                      <div className="w-full flex items-center gap-2">
                        <div className="flex-1 px-3 py-2.5 a-surface-2 rounded-lg text-xs font-mono a-text-3 break-all select-all border a-border">
                          {playerUrl}
                        </div>
                        <button onClick={() => handleCopy(playerUrl)}
                          className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                            joinLinkCopied ? 'bg-green-100 text-green-700 border border-green-300' : 'a-surface a-text hover:bg-gray-700'
                          }`}>
                          {joinLinkCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <button onClick={() => downloadQR('join-qr-svg', `bingo-dash-join-${currentSection.slug}.png`)}
                        className="w-full py-3 rounded-xl bg-emerald-600 a-text font-bold text-sm hover:bg-emerald-700 transition-colors hover:scale-[1.02] active:scale-95">
                        Download QR as PNG
                      </button>
                    </div>
                  )}

                  {/* Observer tab */}
                  {joinLinkTab === 'observer' && (
                    <div className="flex flex-col items-center gap-5">
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 w-full">
                        <span>👁</span>
                        <p className="text-blue-700 text-xs font-bold">Observers can browse and click everything — but cannot submit answers or complete tasks.</p>
                      </div>
                      <div className="a-surface p-3 rounded-2xl border a-border shadow-sm">
                        <QRCodeSVG id="join-qr-svg-observer" value={observerUrl} size={260} level="H" />
                      </div>
                      <div className="w-full flex items-center gap-2">
                        <div className="flex-1 px-3 py-2.5 bg-blue-50 rounded-lg text-xs font-mono text-blue-700 break-all select-all border border-blue-200">
                          {observerUrl}
                        </div>
                        <button onClick={() => handleCopy(observerUrl)}
                          className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                            joinLinkCopied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 a-text hover:bg-blue-700'
                          }`}>
                          {joinLinkCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <button onClick={() => downloadQR('join-qr-svg-observer', `bingo-dash-observer-${currentSection.slug}.png`)}
                        className="w-full py-3 rounded-xl bg-blue-600 a-text font-bold text-sm hover:bg-blue-700 transition-colors hover:scale-[1.02] active:scale-95">
                        Download Observer QR as PNG
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] a-text-2 text-center">
                    Switch sections in the header to get a different join link.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })()}
      </div>
    </div>
  )
}
