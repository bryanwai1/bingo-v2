import { useEffect, useRef, useState } from 'react'

// Day-to-night forest for the waiting screen.
//
// Twenty frames over four minutes, true cross-fade. Two layers stay mounted
// for the whole life of the component and swap roles: the bottom one holds the
// current frame at full opacity while the top one fades the next frame in over
// it. An earlier version keyed the layers by frame index, so React unmounted
// the outgoing frame and mounted the incoming one at zero opacity — both were
// transparent for an instant and the background showed through as a black
// flash between every frame.
//
// Frames are prefetched one ahead because 700 phones hit this screen at once
// on venue wifi.

const FRAMES = 20
const CYCLE_MS = 60_000            // a full day in one minute
const STEP = CYCLE_MS / FRAMES
const FADE_MS = 2200               // fade must stay shorter than the 3s step
const src = (n: number) => `/forest/forest-${String(n).padStart(2, '0')}.webp`

// Sky colour sampled from each frame: [zenith, just above the treeline].
//
// The art is 301x250. Stretched to fill a portrait phone that is a 3x upscale,
// which is why this screen looked soft and cropped — bg-cover threw away most
// of the width to reach the height. Instead the forest now sits at the bottom
// at its own ratio and these colours extend its sky upward to fill the rest.
// Sampled per frame, so sunset sweeps the whole screen rather than a strip.
const SKY = [
  ['#040f21', '#0c1a2f'], ['#0b1928', '#101e30'], ['#0c1c23', '#1b2b38'],
  ['#192a2c', '#43453e'], ['#2b3e34', '#5f5a37'], ['#2d5043', '#516853'],
  ['#254b40', '#406557'], ['#284d3f', '#3e6150'], ['#235648', '#3f6855'],
  ['#1e4a3c', '#3a604b'], ['#2c543f', '#526a48'], ['#414b30', '#6c6132'],
  ['#453c1f', '#6e4f1f'], ['#2d2d36', '#4b363a'], ['#141c36', '#2e2945'],
  ['#121831', '#292341'], ['#03122e', '#081b3d'], ['#030e27', '#0c1d39'],
  ['#030e27', '#10213a'], ['#071c35', '#122b47'],
] as const

const sky = (n: number) =>
  `linear-gradient(to bottom, ${SKY[n][0]} 0%, ${SKY[n][1]} 100%)`

// Pinned to the bottom, native ratio, hard pixel edges. `contain` would
// letterbox and `cover` crops the sides off; explicit sizing does neither.
const ART: React.CSSProperties = {
  backgroundSize: 'auto min(62vh, 78vw)',
  backgroundPosition: 'center bottom',
  backgroundRepeat: 'no-repeat',
  imageRendering: 'pixelated',
}

export function DayNightForest() {
  const [base, setBase] = useState(() => Math.floor(Math.random() * FRAMES))
  const [incoming, setIncoming] = useState<number | null>(null)
  const [fade, setFade] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const advance = () => {
      const next = (baseRef.current + 1) % FRAMES

      // Decode before showing it, so the fade never reveals a half-loaded image.
      const img = new Image()
      img.src = src(next)
      const start = () => {
        setIncoming(next)
        // One frame later, so the browser has painted it at opacity 0 and the
        // transition actually runs instead of snapping.
        requestAnimationFrame(() => requestAnimationFrame(() => setFade(1)))
        timers.current.push(window.setTimeout(() => {
          // Promote: the incoming frame becomes the base, then the top layer is
          // reset with no transition so it is ready for the next fade.
          setBase(next)
          setFade(0)
          setIncoming(null)
        }, FADE_MS))
      }
      if (img.complete) start()
      else { img.onload = start; img.onerror = start }
    }

    const id = window.setInterval(advance, STEP)
    return () => {
      clearInterval(id)
      timers.current.forEach(clearTimeout)
    }
  }, [])

  // Keep a ref in step so the interval always reads the current frame without
  // being torn down and rebuilt on every tick.
  const baseRef = useRef(base)
  useEffect(() => { baseRef.current = base }, [base])

  // Warm the next two frames.
  useEffect(() => {
    for (const n of [1, 2]) {
      const img = new Image()
      img.src = src((base + n) % FRAMES)
    }
  }, [base])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: SKY[base][0] }}>
      {/* Sky first, so the art composites over it rather than onto black. */}
      <div className="absolute inset-0" style={{ background: sky(base) }} />
      {incoming !== null && (
        <div
          className="absolute inset-0"
          style={{
            background: sky(incoming),
            opacity: fade,
            transition: fade === 1 ? `opacity ${FADE_MS}ms linear` : 'none',
          }}
        />
      )}
      {/* Bottom layer: never fades, so there is always something opaque. */}
      <div
        className="absolute inset-0"
        style={{ ...ART, backgroundImage: `url(${src(base)})` }}
      />
      {/* Top layer: the next frame fading in over the one below. */}
      <div
        className="absolute inset-0"
        style={{
          ...ART,
          backgroundImage: incoming === null ? 'none' : `url(${src(incoming)})`,
          opacity: fade,
          transition: fade === 1 ? `opacity ${FADE_MS}ms linear` : 'none',
        }}
      />

      {/* Vignette so white text stays readable whatever the sky is doing. */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 90% 70% at 50% 40%, transparent 20%, rgba(4,10,8,0.72) 100%)',
      }} />

      <div className="absolute inset-0 opacity-50 forest-flies" style={{
        backgroundImage:
          'radial-gradient(2px 2px at 22% 44%, #fde68a, transparent),' +
          'radial-gradient(1px 1px at 58% 30%, #bbf7d0, transparent),' +
          'radial-gradient(2px 2px at 74% 62%, #fcd34d, transparent),' +
          'radial-gradient(1px 1px at 38% 70%, #a7f3d0, transparent)',
        backgroundSize: '460px 460px',
      }} />
    </div>
  )
}
