// Live in-app camera for Sign Splice Title.
//
// The spec asks for LIVE CAMERA CAPTURE ONLY — a file input with
// capture="environment" opens the phone camera but still lets a determined
// player pick an old photo from the gallery, so the shot is taken here instead,
// from a getUserMedia stream that has no gallery path at all.
//
// Needs a secure context (https, or localhost while developing). If the camera
// cannot be opened the caller is told, rather than the participant being left
// staring at a black rectangle.

import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  /** Shown over the viewfinder, e.g. the letter being hunted. */
  hint?: string
  onCapture: (photo: Blob) => void
  onCancel: () => void
}

export function CameraCapture({ hint, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      if (!window.isSecureContext) {
        setError('The camera needs a secure (https) connection on this device.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera.')
        return
      }
      try {
        // Back camera where there is one; falls back to whatever exists.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch (e) {
        const name = e instanceof DOMException ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was blocked. Allow camera access for this site, then try again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'Could not open the camera.',
        )
      }
    }

    void start()
    return () => { cancelled = true; stop() }
  }, [stop])

  const shoot = () => {
    const video = videoRef.current
    if (!video || !ready || busy) return
    setBusy(true)
    const w = video.videoWidth, h = video.videoHeight
    if (!w || !h) { setBusy(false); return }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      blob => {
        setBusy(false)
        if (blob) { stop(); onCapture(blob) }
      },
      'image/jpeg',
      0.92,
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl p-4 text-center"
           style={{ background: 'rgba(248,113,113,0.15)', border: '2px solid rgba(248,113,113,0.4)' }}>
        <p className="text-red-200 font-bold text-sm mb-3">{error}</p>
        <button onClick={onCancel}
                className="px-5 py-2.5 rounded-2xl font-black text-black bg-white active:scale-95 transition-transform">
          Back
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden border-2 border-white/30 bg-black">
        <video ref={videoRef} playsInline muted className="w-full block max-h-[60vh] object-contain" />
        {hint && (
          <p className="absolute top-2 left-2 right-2 text-center text-white font-black text-sm px-3 py-1.5 rounded-xl bg-black/55">
            {hint}
          </p>
        )}
        {!ready && (
          <p className="absolute inset-0 grid place-items-center text-white/70 font-bold text-sm">
            Starting camera…
          </p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => { stop(); onCancel() }}
                className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/30 text-white font-black">
          Cancel
        </button>
        <button onClick={shoot} disabled={!ready || busy}
                className="flex-[2] py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40">
          {busy ? 'Capturing…' : '📷 Take Photo'}
        </button>
      </div>
    </div>
  )
}
