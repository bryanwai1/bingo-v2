import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Camera QR scanner for duel pairing.
//
// Two decoders, in order of preference:
//   1. BarcodeDetector — native, free, fast. Chrome/Android and Safari 17+.
//   2. jsQR on a canvas — works everywhere else, including older iOS Safari,
//      which is exactly where our players are.
//
// Cameras fail often at events (denied permission, in-app browsers with no
// camera access at all, cracked lenses, dark rooms), so every screen that uses
// this MUST also offer the typed duel code. `onCancel` is how the player gets
// back there.

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike

function nativeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

export function QRScanner({
  onResult, onCancel, hint,
}: {
  onResult: (value: string) => void
  onCancel: () => void
  hint?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  // Guard against the scan loop firing onResult twice on consecutive frames —
  // that would create two duels from one scan.
  const doneRef = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let cancelled = false
    const detector = nativeDetector()

    const finish = (value: string) => {
      if (doneRef.current) return
      doneRef.current = true
      onResultRef.current(value)
    }

    const tick = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (cancelled || doneRef.current || !video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        if (!cancelled && !doneRef.current) raf = requestAnimationFrame(() => { void tick() })
        return
      }

      if (detector) {
        try {
          const hits = await detector.detect(video)
          if (hits[0]?.rawValue) { finish(hits[0].rawValue); return }
        } catch {
          // Native detector can throw per-frame on some devices — fall through
          // to jsQR rather than killing the scan.
        }
      }

      const w = video.videoWidth
      const h = video.videoHeight
      if (w && h) {
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h)
          const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
          if (hit?.data) { finish(hit.data); return }
        }
      }

      if (!cancelled && !doneRef.current) raf = requestAnimationFrame(() => { void tick() })
    }

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        video.setAttribute('playsinline', 'true') // iOS refuses to inline-play without this
        await video.play().catch(() => {})
        setStarting(false)
        void tick()
      })
      .catch(() => {
        if (cancelled) return
        setStarting(false)
        setError('No camera access. Use the code instead.')
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden border border-white/15 bg-black">
      <div className="relative aspect-square">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />

        {/* Framing reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3/5 h-3/5 rounded-2xl border-2 a-border0" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
        </div>

        {(starting || error) && (
          <div className="absolute inset-0 flex items-center justify-center a-bg/90 px-6 text-center">
            {error
              ? <p className="text-sm font-bold text-red-300">{error}</p>
              : <p className="text-sm font-bold text-gray-400">Starting camera…</p>}
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-3 a-bg">
        <p className="text-[11px] text-gray-400 font-semibold">
          {hint ?? 'Point at the other team\'s QR code'}
        </p>
        <button onClick={onCancel} className="text-xs font-bold text-gray-400 hover:a-text transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
