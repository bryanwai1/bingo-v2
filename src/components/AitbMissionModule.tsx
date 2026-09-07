/**
 * AITB — interactive mission-page modules. Rendered on the mission page once a
 * team has checked in; each writes its result into aitb_progress.words (positions
 * match AITB_MODULE_SLOTS) so the admin sees it live via realtime.
 *
 *   · cups     (Nerf)             → tap the word on each cup you collected
 *   · roulette (Jingle/Dance)     → spin two wheels: genre, then topic
 *   · cards    (Random Cinematic) → deal 4 cards at once, no re-draws
 *   · retro    (Retro Game Build) → tick each game as it's built + tested
 *
 * When every slot of a module has generated art (AITB_REEL_POOLS) the reveal
 * upgrades from a text flash to an image slot-machine that spins through the
 * pictures and lands on the chosen one; otherwise it falls back to text.
 */
import { useEffect, useRef, useState } from 'react'
import {
  AITB_MODULE_SLOTS, AITB_MODULE_MODE, AITB_RETRO_GAMES,
  aitbModuleHasImages,
  type AitbActivity, type AitbModuleSlot, type AitbPoolKey,
} from '../lib/aitbActivities'
import { useAitbPools, type AitbPoolOption } from '../hooks/useAitbPools'

type ModuleProps = {
  activity: AitbActivity
  savedWords: string[]
  disabled: boolean
  onSave: (words: string[]) => void
  /** aitb_progress row id. Namespaces the spin counter so an admin reset (which
   *  deletes the row) hands the next attempt a clean 2 spins, and so switching
   *  teams on one phone never inherits the other team's burnt spins. */
  progressId: string
}

type SubProps = {
  color: string
  slots: AitbModuleSlot[]
  savedWords: string[]
  disabled: boolean
  onSave: (words: string[]) => void
  /** localStorage namespace for this activity — used to remember spins used. */
  storeKey: string
  /** Admin-editable word/photo pools, live from aitb_pool_items (falls back
   *  to the hardcoded defaults while loading or if a pool is still empty). */
  pools: Record<AitbPoolKey, AitbPoolOption[]>
}

/** Plain label list for a slot's pool — the common case (drawing, sizing,
 *  wheel text) that doesn't need the photo. */
function poolLabels(pools: Record<AitbPoolKey, AitbPoolOption[]>, key: AitbPoolKey): string[] {
  return pools[key].map(o => o.label)
}

/** Photo for one drawn label, if the admin attached one to that pool item. */
function poolPhoto(pools: Record<AitbPoolKey, AitbPoolOption[]>, key: AitbPoolKey, label: string): string | null {
  return pools[key].find(o => o.label === label)?.photoUrl ?? null
}

/* Each roulette wheel may be spun at most twice: the first spin plus one
   re-spin. After that the wheel locks, so a team can't keep re-rolling for a
   genre/topic they like.

   The count is per-device (localStorage), keyed by the progress row so an admin
   reset starts everyone fresh. Because a second phone can't know how many spins
   the first one used, a wheel whose value this device did NOT spin is treated as
   fully used — erring strict, so a team can't farm extra re-rolls by passing the
   mission around their phones. The spinning phone keeps its own count either way. */
const MAX_SPINS = 2

function readSpins(key: string, n: number): number[] {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || 'null')
    if (Array.isArray(arr)) return Array.from({ length: n }, (_, i) => Number(arr[i]) || 0)
  } catch { /* corrupt or unavailable — start fresh */ }
  return Array.from({ length: n }, () => 0)
}

function writeSpins(key: string, arr: number[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch { /* private mode — cap is best-effort */ }
}

export function AitbMissionModule({ activity, savedWords, disabled, onSave, progressId }: ModuleProps) {
  const mod = activity.module
  const { pools } = useAitbPools()
  if (!mod) return null
  const slots = AITB_MODULE_SLOTS[mod]
  const mode = AITB_MODULE_MODE[mod]
  const sub: SubProps = {
    color: activity.color, slots, savedWords, disabled, onSave, pools,
    storeKey: `aitb_spins_${activity.id}_${progressId}`,
  }
  if (mode === 'pick') return <CupsPicker {...sub} />
  if (mode === 'spin') return aitbModuleHasImages(mod) ? <ImageSpinModule {...sub} /> : <SpinModule {...sub} />
  if (mode === 'gamepick') return <GamePickModule {...sub} />
  return aitbModuleHasImages(mod) ? <ImageDealModule {...sub} /> : <TextDealModule {...sub} />
}

// ── Nerf: tap the word printed on each cup you collected ─────────────────────
// Not a manual pick — the team draws all 3 words on the spot, one shot, no
// re-draws (same "no take-backs" rule as the card deal). Each slot flickers
// through its own pool briefly, then lands together.
function CupsPicker({ color, slots, savedWords, disabled, onSave, pools }: SubProps) {
  const dealtSaved = savedWords.length >= slots.length && savedWords.slice(0, slots.length).every(Boolean)
  const [vals, setVals] = useState<string[]>(() => (dealtSaved ? savedWords.slice(0, slots.length) : []))
  const [flash, setFlash] = useState<string[]>([])
  const [dealing, setDealing] = useState(false)
  const [copied, setCopied] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (dealtSaved) setVals(savedWords.slice(0, slots.length))
  }, [savedWords, dealtSaved, slots])

  const copyPrompt = () => {
    navigator.clipboard?.writeText(vals.join(' '))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
      .catch(() => { /* clipboard blocked — the text is on screen to type */ })
  }

  const draw = () => {
    if (disabled || busy.current || vals.length) return
    busy.current = true
    setDealing(true)
    let ticks = 0
    const iv = setInterval(() => {
      setFlash(slots.map(s => { const p = poolLabels(pools, s.pool); return p[Math.floor(Math.random() * p.length)] }))
      if (++ticks > 16) {
        clearInterval(iv)
        const result = slots.map(s => { const p = poolLabels(pools, s.pool); return p[Math.floor(Math.random() * p.length)] })
        setFlash([])
        setVals(result)
        setDealing(false)
        busy.current = false
        onSave(result)
      }
    }, 70)
  }

  const showVals = flash.length ? flash : vals
  const done = vals.length > 0
  // Red / blue / yellow, matching the cups themselves — distinct per slot
  // rather than one shared activity color, so each result card reads as its
  // own cup at a glance (the "🔴 CHARACTER" header, etc).
  const SLOT_COLORS = ['#f87171', '#60a5fa', '#fbbf24']

  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎯 {done ? 'Your draw — no re-draws!' : 'Tap DRAW to reveal your 3 secret words'}
      </div>
      {/* Stacks on a phone; sits side-by-side once there's room for it (a
          wide phone in landscape, a tablet, or a projector display). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {slots.map((s, i) => {
          const slotColor = SLOT_COLORS[i % SLOT_COLORS.length]
          const shown = showVals[i]
          return (
            <div key={i} className="rounded-2xl p-3 flex flex-col"
              style={{ background: 'rgba(255,255,255,0.04)', border: `2px solid ${done ? slotColor : 'rgba(255,255,255,0.12)'}`, transition: 'border-color .3s' }}>
              <div className="flex items-center gap-1.5 justify-center mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: slotColor }} />
                <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: slotColor }}>{s.label}</span>
              </div>
              <div className="text-center font-black flex-1 flex items-center justify-center min-h-[3rem]"
                style={{ color: shown ? '#fff' : 'rgba(255,255,255,0.25)', letterSpacing: shown ? 'normal' : '0.1em', filter: dealing ? 'blur(0.5px)' : 'none' }}>
                {shown || `— ${s.label.toLowerCase()} —`}
              </div>
            </div>
          )
        })}
      </div>
      {!done && (
        <button onClick={draw} disabled={disabled || dealing}
          className="w-full mt-3 py-3.5 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50"
          style={{ background: color, color: '#000' }}>
          {dealing ? 'Drawing…' : '🎲 DRAW YOUR PROMPT'}
        </button>
      )}
      {done && (
        <div className="rounded-2xl px-4 py-3 mt-3 text-center" style={{ background: `${color}18`, border: `2px solid ${color}` }}>
          <div className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">✨ Your prompt</div>
          <div className="font-black" style={{ color }}>{vals.join(' ')}</div>
          <button onClick={copyPrompt}
            className="w-full mt-2.5 py-2 rounded-xl font-black text-sm transition-all active:scale-95"
            style={{ background: color, color: '#000' }}>
            {copied ? '✅ Copied!' : '📋 Copy this prompt'}
          </button>
          <div className="text-emerald-400 text-xs font-bold mt-2">✅ Saved — your host can see it live!</div>
        </div>
      )}
    </div>
  )
}

/* The ready-to-use song brief, built from the two wheels. Slot order is
   [Genre, Topic] (AITB_MODULE_SLOTS.roulette), so the sentence reads
   "Create a song about The Office Coffee in a Nursery Rhyme Style". */
function SongPrompt({ genre, topic, color }: { genre: string; topic: string; color: string }) {
  const sentence = `Create a song about ${topic} in a ${genre} Style`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(sentence)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
      .catch(() => { /* clipboard blocked — the text is on screen to type */ })
  }
  return (
    <div className="rounded-2xl px-4 py-3 mt-3" style={{ background: `${color}18`, border: `2px solid ${color}` }}>
      <div className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">🎤 Your song brief</div>
      <div className="font-black text-base leading-snug" style={{ color }}>“{sentence}”</div>
      <button onClick={copy}
        className="w-full mt-2.5 py-2 rounded-xl font-black text-sm transition-all active:scale-95"
        style={{ background: color, color: '#000' }}>
        {copied ? '✅ Copied!' : '📋 Copy this prompt'}
      </button>
      <div className="text-gray-400 text-xs font-bold mt-2">
        Paste it into Suno to make your song — then invent the dance! 💃
      </div>
    </div>
  )
}

// ── Circular wheel: a real pie wheel with a fixed top pointer, spun by
// rotating the whole disc. Each label's font size is solved from its own
// wedge's actual chord width (not a fixed stretch/squeeze), so a short word
// isn't blown up and a long one isn't crushed into unreadable glyphs — that
// keeps every label clear, unclipped, and inside its own wedge. The whole
// dial is drawn in one 240x240 SVG viewBox and scaled by the wrapper's own
// size (width/height 100%), so it can never grow past the card that holds
// it regardless of viewport.
const WHEEL_COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#fb923c', '#34d399', '#facc15', '#fb7185', '#60a5fa']
const WHEEL_BOX = 240
const WHEEL_R = 108
const WHEEL_CX = 120
const WHEEL_CY = 120
const HUB_R = 18                       // white center hub
const LABEL_START_R = HUB_R + 20       // labels start further out from the hub, more centred in the wedge
const LABEL_END_R = WHEEL_R - 8        // ...and stop short of the rim
const AVG_GLYPH_WIDTH = 0.56           // bold-font width as a fraction of font-size, per char

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const
}

function WheelDial({ pool, rotation, spinning }: { pool: string[]; rotation: number; spinning: boolean }) {
  const n = pool.length
  const wedge = 360 / n
  // Labels run left-aligned along the wedge's own radial line, starting just
  // outside the hub — so the available run length is that radial span...
  const runLength = (LABEL_END_R - LABEL_START_R) * 0.94
  // ...and the available height is the wedge's chord width at the label's
  // midpoint (its narrowest point along that span), so the text never grows
  // tall enough to cross into a neighbouring wedge.
  const midR = (LABEL_START_R + LABEL_END_R) / 2
  const chordWidth = 2 * midR * Math.sin((wedge * Math.PI / 180) / 2) * 0.86
  const maxFontSize = n <= 6 ? 20 : n <= 10 ? 16 : 13
  const bulbCount = Math.max(8, n * 2)

  return (
    <div className="relative mx-auto w-full max-w-[240px] sm:max-w-[300px] lg:max-w-[360px]" style={{ aspectRatio: '1 / 1' }}>
      {/* Gold halo behind the wheel — pulses while idle, steadies mid-spin.
          Kept modest so the glow itself never bleeds past the card edge. */}
      <div className="absolute inset-0 rounded-full pointer-events-none aitb-wheel-glow"
        style={{ animationPlayState: spinning ? 'paused' : 'running' }} />
      {/* Pointer, fixed — the wheel rotates under it */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-10"
        style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '20px solid #fde68a', filter: 'drop-shadow(0 0 6px #fde68acc)' }} />
      <svg viewBox={`0 0 ${WHEEL_BOX} ${WHEEL_BOX}`} className="relative z-[1] block w-full h-full"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 3.2s cubic-bezier(.12,.72,.14,1)' : 'none' }}>
        {/* Outer gold rim + evenly-spaced light bulbs, carnival-wheel style */}
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={WHEEL_R + 12} fill="none" stroke="#b45309" strokeWidth={4} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={WHEEL_R + 9} fill="none" stroke="#fbbf24" strokeWidth={5} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={WHEEL_R + 4} fill="#1c1310" stroke="#fde68a" strokeWidth={1.5} />
        {Array.from({ length: bulbCount }, (_, b) => {
          const [bx, by] = polar(WHEEL_CX, WHEEL_CY, WHEEL_R + 9, (360 / bulbCount) * b)
          return <circle key={b} cx={bx} cy={by} r={2.8} fill="#fef3c7" stroke="#b45309" strokeWidth={0.5} />
        })}
        {pool.map((item, i) => {
          const a0 = i * wedge, a1 = (i + 1) * wedge
          const [x0, y0] = polar(WHEEL_CX, WHEEL_CY, WHEEL_R, a0)
          const [x1, y1] = polar(WHEEL_CX, WHEEL_CY, WHEEL_R, a1)
          const large = wedge > 180 ? 1 : 0
          return (
            <path key={item} d={`M${WHEEL_CX},${WHEEL_CY} L${x0},${y0} A${WHEEL_R},${WHEEL_R} 0 ${large} 1 ${x1},${y1} Z`}
              fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="#0b1220" strokeWidth={1.5} />
          )
        })}
        {/* Hub sits above the wedges but below the labels, so a label's left
            edge (anchored just outside it) is never clipped by either. */}
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={HUB_R} fill="#fbbf24" stroke="#b45309" strokeWidth={2.5} />
        {pool.map((item, i) => {
          const mid = i * wedge + wedge / 2
          // Left-aligned, starting just outside the hub — the label's own
          // left edge is anchored here and reads outward toward the rim.
          // Rotating by (mid - 90) rather than `mid` is what actually makes
          // the reading direction radial: a plain `rotate(mid)` orients the
          // text tangentially instead, which is fine for a short centred
          // word but crowds neighbouring labels together right at the hub
          // once they all start from the same tight inner radius.
          const [tx, ty] = polar(WHEEL_CX, WHEEL_CY, LABEL_START_R, mid)
          // Solve font size from this word's own length against the run of
          // radial space it has to fill — a short word (e.g. "K-Pop") renders
          // near max size instead of being stretched, a long one shrinks just
          // enough to fit before the rim, never overflowing into a neighbour.
          const fitSize = runLength / Math.max(1, item.length * AVG_GLYPH_WIDTH)
          const fontSize = Math.max(8, Math.min(maxFontSize, fitSize, chordWidth))
          // The length estimate above is only a heuristic — real glyph widths
          // vary enough that a long phrase ("The Team WhatsApp Group") can
          // still run past the rim at its "fitted" size. Compressing to
          // textLength is a hard backstop that only engages when the natural
          // render would actually overflow, so short words stay undistorted.
          const estWidth = fontSize * item.length * AVG_GLYPH_WIDTH
          const compress = estWidth > runLength
          return (
            <text key={item} x={tx} y={ty}
              transform={`rotate(${mid - 90}, ${tx}, ${ty})`}
              fontSize={fontSize} fontWeight={800} fill="#111827"
              stroke="#fff" strokeWidth={fontSize * 0.1} paintOrder="stroke" strokeLinejoin="round"
              textAnchor="start" dominantBaseline="middle"
              {...(compress ? { textLength: runLength, lengthAdjust: 'spacingAndGlyphs' as const } : {})}>
              {item}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Roulette: spin each wheel one at a time ──────────────────────────────────
function SpinModule({ color, slots, savedWords, disabled, onSave, storeKey, pools }: SubProps) {
  const [spins, setSpins] = useState<number[]>(() => readSpins(storeKey, slots.length))

  // A wheel already spun elsewhere (teammate's phone) is locked here — this
  // device can't know how many of the team's 2 spins are left, so it assumes none.
  useEffect(() => {
    setSpins(prev => {
      const next = prev.map((c, i) => (savedWords[i] && c === 0 ? MAX_SPINS : c))
      if (next.every((c, i) => c === prev[i])) return prev
      writeSpins(storeKey, next)
      return next
    })
  }, [savedWords, storeKey])

  const bumpSpin = (i: number) => setSpins(prev => {
    const next = [...prev]
    next[i] = (next[i] || 0) + 1
    writeSpins(storeKey, next)
    return next
  })

  const [vals, setVals] = useState<string[]>(() => slots.map((_, i) => savedWords[i] ?? ''))
  const [rotations, setRotations] = useState<number[]>(() => slots.map(() => 0))
  const [spinning, setSpinning] = useState<number | null>(null)

  useEffect(() => {
    setVals(prev => (prev.some(Boolean) ? prev : slots.map((_, i) => savedWords[i] ?? '')))
  }, [savedWords, slots])

  const spin = (i: number) => {
    if (disabled || spinning !== null || (spins[i] || 0) >= MAX_SPINS) return
    const pool = poolLabels(pools, slots[i].pool)
    const idx = Math.floor(Math.random() * pool.length)
    const final = pool[idx]
    const wedge = 360 / pool.length
    // Land the chosen wedge's centre under the fixed top pointer: spin several
    // full turns, then stop `idx` wedges short of due-north, offset by a small
    // random jitter within the wedge so it never looks robotically centred.
    const jitter = (Math.random() - 0.5) * wedge * 0.6
    const target = 360 * 5 - idx * wedge - wedge / 2 + jitter
    setRotations(prev => { const n = [...prev]; n[i] = (prev[i] % 360) + target; return n })
    setSpinning(i)
    setTimeout(() => {
      // Charge the spin only once a result actually lands, so a reel that gets
      // interrupted (tab backgrounded to open Suno, phone locked) costs nothing.
      bumpSpin(i)
      const next = [...vals]; next[i] = final
      setVals(next)
      onSave(next)
      setSpinning(null)
    }, 3300)
  }

  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎡 Spin both wheels — {MAX_SPINS} spins each, then it locks!
      </div>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((s, i) => {
          const isSpin = spinning === i
          const left = MAX_SPINS - (spins[i] || 0)
          return (
            <div key={i} className="rounded-2xl p-3 flex flex-col items-center text-center gap-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: `2px solid ${vals[i] ? color : 'rgba(255,255,255,0.1)'}` }}>
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>{s.emoji} {s.label}</div>
              <WheelDial pool={poolLabels(pools, s.pool)} rotation={rotations[i] || 0} spinning={isSpin} />
              <div className="font-black text-base min-h-[1.5rem] flex items-center justify-center leading-tight text-white">
                {!isSpin && vals[i] ? vals[i] : ''}
              </div>
              <button onClick={() => spin(i)} disabled={disabled || spinning !== null || left <= 0}
                className="w-full py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                style={{ background: color, color: '#000' }}>
                {isSpin ? 'Spinning…' : left <= 0 ? '🔒 Locked' : vals[i] ? `🔄 Last spin (${left})` : `🎡 Spin ${i + 1}`}
              </button>
              <div className="text-[10px] font-bold" style={{ color: left > 0 ? '#94a3b8' : '#f87171' }}>
                {left > 0 ? `${left} spin${left > 1 ? 's' : ''} left` : 'No spins left'}
              </div>
            </div>
          )
        })}
      </div>
      {vals.every(Boolean) && spinning === null && (
        <>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {slots.map((s, i) => (
              <ResultRevealCard key={i} photoUrl={poolPhoto(pools, s.pool, vals[i])} label={s.label} emoji={s.emoji} word={vals[i]} color={color} />
            ))}
          </div>
          <SongPrompt genre={vals[0]} topic={vals[1]} color={color} />
          <div className="text-emerald-400 text-xs font-bold mt-2 text-center">✅ Genre + topic locked in — your host can see it live!</div>
        </>
      )}
    </div>
  )
}

// ── Result reveal: the drawn word paired with themed art, once landed ────────
// Falls back to a plain colour-and-emoji card when the admin hasn't attached
// a photo to this pool item, so a missing asset never shows a broken-image icon.
function ResultRevealCard({ photoUrl, label, emoji, word, color }: {
  photoUrl: string | null; label: string; emoji: string; word: string; color: string
}) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${color}`, background: 'rgba(255,255,255,0.04)' }}>
      <div className="aspect-square w-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}55, ${color}15)` }}>
        {imgOk && photoUrl
          ? <img src={photoUrl} alt="" onError={() => setImgOk(false)}
              className="w-full h-full object-cover" />
          : <span className="text-5xl">{emoji}</span>}
      </div>
      <div className="px-2 py-2 text-center">
        <div className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{emoji} {label}</div>
        <div className="font-black text-white text-sm leading-tight">{word}</div>
      </div>
    </div>
  )
}

// ── Image slot-machine reel: spins through pool art, lands on `final` ─────────
const CELL = 132          // px height of one image cell (reel window height)
const REEL_PAD = 20       // random frames that scroll past before the result

function ImageReel({ pool, pools, color, label, emoji, final, spinning, durationMs }: {
  pool: AitbPoolKey
  pools: Record<AitbPoolKey, AitbPoolOption[]>
  color: string
  label: string
  emoji: string
  final: string | null
  spinning: boolean
  durationMs: number
}) {
  const [strip, setStrip] = useState<string[]>([])
  const [animate, setAnimate] = useState(false)

  // Build a fresh reel strip (random padding + the result last) and, on the next
  // frame, flip on the CSS transition so it scrolls to and stops on the result.
  useEffect(() => {
    if (!spinning || !final) return
    const items = poolLabels(pools, pool)
    const pad = Array.from({ length: REEL_PAD }, () => items[Math.floor(Math.random() * items.length)])
    setStrip([...pad, final])
    setAnimate(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setAnimate(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [spinning, final, pool, pools])

  const cells = spinning && strip.length ? strip : (final ? [final] : [])
  const translate = spinning && animate ? -(strip.length - 1) * CELL : 0
  const settled = !spinning && !!final

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(0,0,0,0.35)', border: `2px solid ${settled ? color : 'rgba(255,255,255,0.12)'}`, transition: 'border-color .3s' }}>
      <div className="text-[10px] font-black uppercase tracking-widest px-2 pt-2 text-center" style={{ color }}>{emoji} {label}</div>
      <div className="mx-2 mt-1.5 rounded-xl relative" style={{ height: CELL, overflow: 'hidden' }}>
        {cells.length === 0
          ? <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: 'rgba(255,255,255,0.05)' }}>❔</div>
          : (
            <div style={{ transform: `translateY(${translate}px)`, transition: spinning && animate ? `transform ${durationMs}ms cubic-bezier(.16,.72,.14,1)` : 'none' }}>
              {cells.map((item, i) => {
                const src = poolPhoto(pools, pool, item)
                return (
                  <div key={i} style={{ height: CELL }}>
                    {src
                      ? <img src={src} alt="" draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>❔</div>}
                  </div>
                )
              })}
            </div>
          )}
        {/* slot-window shading top & bottom */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(rgba(0,0,0,0.4), transparent 20%, transparent 80%, rgba(0,0,0,0.4))' }} />
      </div>
      <div className="text-xs font-black px-2 pb-2 pt-1.5 text-center leading-tight flex items-center justify-center"
        style={{ color: settled ? '#fff' : '#94a3b8', minHeight: '2.4em' }}>
        {settled ? final : spinning ? '🎰' : '—'}
      </div>
    </div>
  )
}

const SPIN_BASE = 2000    // ms the first reel spins
const SPIN_STAGGER = 280  // extra ms per reel so they stop left-to-right

// ── Random Cinematic (image slot-machine): deal every reel at once ───────────
function ImageDealModule({ color, slots, savedWords, disabled, onSave, pools }: SubProps) {
  const dealtSaved = savedWords.length >= slots.length && savedWords.slice(0, slots.length).every(Boolean)
  const [vals, setVals] = useState<string[]>(() => (dealtSaved ? savedWords.slice(0, slots.length) : []))
  const [finals, setFinals] = useState<string[]>(() => (dealtSaved ? savedWords.slice(0, slots.length) : []))
  const [dealing, setDealing] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (dealtSaved) { const w = savedWords.slice(0, slots.length); setVals(w); setFinals(w) }
  }, [savedWords, dealtSaved, slots])

  // Preload every reel image so the spin is smooth on the first play.
  useEffect(() => {
    slots.forEach(s => poolLabels(pools, s.pool).forEach(item => {
      const src = poolPhoto(pools, s.pool, item)
      if (src) { const im = new Image(); im.src = src }
    }))
  }, [slots, pools])

  const deal = () => {
    if (disabled || busy.current || vals.length) return
    busy.current = true
    // Final draw — keep values distinct within any shared pool (e.g. 2 animals).
    const taken: Record<string, Set<string>> = {}
    const result = slots.map(s => {
      const pool = poolLabels(pools, s.pool)
      const t = taken[s.pool] ?? (taken[s.pool] = new Set<string>())
      const avail = pool.filter(v => !t.has(v))
      const pick = avail[Math.floor(Math.random() * avail.length)]
      t.add(pick)
      return pick
    })
    setFinals(result)
    setDealing(true)
    const maxMs = SPIN_BASE + (slots.length - 1) * SPIN_STAGGER + 200
    setTimeout(() => {
      setVals(result)
      setDealing(false)
      busy.current = false
      onSave(result)
    }, maxMs)
  }

  const done = vals.length > 0
  const isAnimals = slots.length === 2
  const cols = slots.length >= 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'
  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎰 {done ? 'Your draw — no re-draws!' : isAnimals ? 'Tap to draw your 2 animals' : 'Tap to deal your 4 cards'}
      </div>
      <div className={`grid ${cols} gap-2`}>
        {slots.map((s, i) => (
          <ImageReel key={i} pool={s.pool} pools={pools} color={color} label={s.label} emoji={s.emoji}
            final={finals[i] ?? null} spinning={dealing} durationMs={SPIN_BASE + i * SPIN_STAGGER} />
        ))}
      </div>
      {!done && (
        <button onClick={deal} disabled={disabled || dealing}
          className="w-full mt-3 py-3.5 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50"
          style={{ background: color, color: '#000' }}>
          {dealing ? 'Dealing…' : isAnimals ? '🎲 DRAW MY 2 ANIMALS' : '🎴 DEAL MY 4 CARDS'}
        </button>
      )}
      {done && <div className="text-emerald-400 text-xs font-bold mt-2 text-center">✅ Locked in — your host can see it live!</div>}
    </div>
  )
}

// ── Roulette (image slot-machine): spin each wheel one at a time ─────────────
function ImageSpinModule({ color, slots, savedWords, disabled, onSave, storeKey, pools }: SubProps) {
  const seed = () => slots.map((_, i) => savedWords[i] ?? '')
  const [vals, setVals] = useState<string[]>(seed)
  const [finals, setFinals] = useState<string[]>(seed)
  const [spinning, setSpinning] = useState<number | null>(null)
  const [spins, setSpins] = useState<number[]>(() => readSpins(storeKey, slots.length))

  // Re-seed from realtime unless we've already spun on this device.
  useEffect(() => {
    setVals(prev => (prev.some(Boolean) ? prev : seed()))
    setFinals(prev => (prev.some(Boolean) ? prev : seed()))
  }, [savedWords, slots])

  // A wheel already spun elsewhere is locked here — see MAX_SPINS note.
  useEffect(() => {
    setSpins(prev => {
      const next = prev.map((c, i) => (savedWords[i] && c === 0 ? MAX_SPINS : c))
      if (next.every((c, i) => c === prev[i])) return prev
      writeSpins(storeKey, next)
      return next
    })
  }, [savedWords, storeKey])

  useEffect(() => {
    slots.forEach(s => poolLabels(pools, s.pool).forEach(item => {
      const src = poolPhoto(pools, s.pool, item)
      if (src) { const im = new Image(); im.src = src }
    }))
  }, [slots, pools])

  const spin = (i: number) => {
    if (disabled || spinning !== null || (spins[i] || 0) >= MAX_SPINS) return
    const pool = poolLabels(pools, slots[i].pool)
    const final = pool[Math.floor(Math.random() * pool.length)]
    setFinals(prev => { const n = [...prev]; n[i] = final; return n })
    setSpinning(i)
    setTimeout(() => {
      // Charge the spin only when the reel lands — an interrupted spin is free.
      setSpins(prev => {
        const next = [...prev]
        next[i] = (next[i] || 0) + 1
        writeSpins(storeKey, next)
        return next
      })
      const n = [...vals]; n[i] = final
      setVals(n)
      onSave(n)
      setSpinning(null)
    }, SPIN_BASE + 200)
  }

  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎰 Spin both wheels — {MAX_SPINS} spins each, then it locks!
      </div>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((s, i) => {
          const left = MAX_SPINS - (spins[i] || 0)
          return (
            <div key={i} className="flex flex-col gap-2">
              <ImageReel pool={s.pool} pools={pools} color={color} label={s.label} emoji={s.emoji}
                final={finals[i] || null} spinning={spinning === i} durationMs={SPIN_BASE} />
              <button onClick={() => spin(i)} disabled={disabled || spinning !== null || left <= 0}
                className="w-full py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                style={{ background: color, color: '#000' }}>
                {spinning === i ? 'Spinning…' : left <= 0 ? '🔒 Locked' : vals[i] ? `🔄 Last spin (${left})` : `🎡 Spin ${i + 1}`}
              </button>
              <div className="text-[10px] font-bold text-center" style={{ color: left > 0 ? '#94a3b8' : '#f87171' }}>
                {left > 0 ? `${left} spin${left > 1 ? 's' : ''} left` : 'No spins left'}
              </div>
            </div>
          )
        })}
      </div>
      {vals.every(Boolean) && spinning === null && (
        <>
          <SongPrompt genre={vals[0]} topic={vals[1]} color={color} />
          <div className="text-emerald-400 text-xs font-bold mt-2 text-center">✅ Genre + topic locked in — your host can see it live!</div>
        </>
      )}
    </div>
  )
}

// ── Text fallback deal (used until a module's reel art exists) ───────────────
function TextDealModule({ color, slots, savedWords, disabled, onSave, pools }: SubProps) {
  const dealtSaved = savedWords.length >= slots.length && savedWords.slice(0, slots.length).every(Boolean)
  const [vals, setVals] = useState<string[]>(() => (dealtSaved ? savedWords.slice(0, slots.length) : []))
  const [flash, setFlash] = useState<string[]>([])
  const [dealing, setDealing] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (dealtSaved) setVals(savedWords.slice(0, slots.length))
  }, [savedWords, dealtSaved, slots])

  const deal = () => {
    if (disabled || busy.current || vals.length) return
    busy.current = true
    setDealing(true)
    let ticks = 0
    const iv = setInterval(() => {
      setFlash(slots.map(s => { const p = poolLabels(pools, s.pool); return p[Math.floor(Math.random() * p.length)] }))
      if (++ticks > 16) {
        clearInterval(iv)
        // Final draw — keep values distinct within any shared pool (e.g. 2 animals).
        const taken: Record<string, Set<string>> = {}
        const result = slots.map(s => {
          const pool = poolLabels(pools, s.pool)
          const t = taken[s.pool] ?? (taken[s.pool] = new Set<string>())
          const avail = pool.filter(v => !t.has(v))
          const pick = avail[Math.floor(Math.random() * avail.length)]
          t.add(pick)
          return pick
        })
        setFlash([])
        setVals(result)
        setDealing(false)
        busy.current = false
        onSave(result)
      }
    }, 70)
  }

  const showVals = flash.length ? flash : vals
  const done = vals.length > 0
  const isAnimals = slots.length === 2
  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🎴 {done ? 'Your draw — no re-draws!' : isAnimals ? 'Tap to draw your 2 animals' : 'Tap to deal your 4 cards'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {slots.map((s, i) => (
          <div key={i} className="rounded-2xl p-3 flex flex-col items-center text-center gap-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: `2px solid ${done ? color : 'rgba(255,255,255,0.1)'}`, transition: 'border-color .3s' }}>
            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{s.emoji} {s.label}</div>
            <div className="font-black text-base min-h-[2.5rem] flex items-center justify-center leading-tight"
              style={{ color: showVals[i] ? '#fff' : '#6b7280', filter: dealing ? 'blur(0.5px)' : 'none' }}>
              {showVals[i] || '❔'}
            </div>
          </div>
        ))}
      </div>
      {!done && (
        <button onClick={deal} disabled={disabled || dealing}
          className="w-full mt-3 py-3.5 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50"
          style={{ background: color, color: '#000' }}>
          {dealing ? 'Dealing…' : isAnimals ? '🎲 DRAW MY 2 ANIMALS' : '🎴 DEAL MY 4 CARDS'}
        </button>
      )}
      {done && <div className="text-emerald-400 text-xs font-bold mt-2 text-center">✅ Locked in — your host can see it live!</div>}
    </div>
  )
}

// ── Retro Game Speed Build: tick each game as it's built, then tested ────────
// Not a pool/slot draw like the other three — a fixed checklist of the 3
// games named in the activity's own steps. `words[i]` for game i is '' (not
// started), 'built', or 'tested'; a game only counts once every teammate can
// see it played, so "tested" is the meaningful finish line, not "built".
function GamePickModule({ color, savedWords, disabled, onSave }: SubProps) {
  const games = AITB_RETRO_GAMES
  const [state, setState] = useState<string[]>(() => games.map((_, i) => savedWords[i] ?? ''))

  useEffect(() => {
    setState(prev => (prev.some(Boolean) ? prev : games.map((_, i) => savedWords[i] ?? '')))
  }, [savedWords, games])

  const advance = (i: number) => {
    if (disabled) return
    const cur = state[i] || ''
    const next = [...state]
    next[i] = cur === '' ? 'built' : cur === 'built' ? 'tested' : ''
    setState(next)
    onSave(next)
  }

  const allTested = state.every(s => s === 'tested')
  const label = (s: string) => (s === 'tested' ? '✅ Tested' : s === 'built' ? '🤖 Built — tap to mark tested' : 'Tap when built')

  return (
    <div className="mb-6">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">🕹️ Tap each game as your team finishes it</div>
      <div className="flex flex-col gap-2">
        {games.map((g, i) => {
          const s = state[i] || ''
          const border = s === 'tested' ? color : s === 'built' ? `${color}88` : 'rgba(255,255,255,0.1)'
          return (
            <button key={g} onClick={() => advance(i)} disabled={disabled}
              className="flex items-center gap-3 text-left rounded-2xl px-4 py-3 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: s ? `${color}14` : 'rgba(255,255,255,0.04)', border: `2px solid ${border}` }}>
              <span className="text-2xl">{s === 'tested' ? '✅' : s === 'built' ? '🤖' : '⬜'}</span>
              <span className="flex-1">
                <span className="block font-black">{g}</span>
                <span className="block text-xs font-bold text-gray-400">{label(s)}</span>
              </span>
            </button>
          )
        })}
      </div>
      {allTested && (
        <div className="rounded-2xl px-4 py-3 mt-3 text-center" style={{ background: `${color}18`, border: `2px solid ${color}` }}>
          <div className="text-emerald-400 text-xs font-bold">✅ All 3 games built + tested — your host can see it live!</div>
        </div>
      )}
    </div>
  )
}
