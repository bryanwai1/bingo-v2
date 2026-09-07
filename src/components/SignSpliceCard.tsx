// Sign Splice Title — the playable card.
//
// Port of the mall-hunt prototype's Hunt flow. The prototype split this across
// a FastAPI backend and a separate React app on a second port; here the whole
// loop (OCR, dedupe, crop, composite) runs in the page and talks straight to
// Supabase, so it ships with the rest of bingo on one dev server.
//
// Flow: lock a title -> for each letter, photograph a shop sign -> OCR finds
// that letter -> tap the one you want -> the crop is kept. Collect them all and
// the crops are stitched into the team's title card.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_TITLE_RULES, DIRECTORY_BOARD_WORD_LIMIT,
  buildFinalImage, cropLetter, disposeOcr, downscale, findLetterOccurrences,
  hammingDistance, perceptualHash, runOcr, sha256, titleLetters, validateTitle,
  type CharBox, type Occurrence, type ScanResult,
} from '../lib/signSplice'

type LetterRow = {
  id: string
  position: number
  letter: string
  status: 'pending' | 'collected' | 'review'
  shop_name: string | null
  crop_url: string | null
  ocr_confidence: number | null
}

type TitleRow = { id: string; title: string; locked: boolean; final_url: string | null }

/** Low-confidence OCR is accepted but called out — see Rule 8. */
const MIN_CONFIDENCE = 0.7
/** Hamming distance under which two photos count as the same shot. */
const PHASH_THRESHOLD = 6

type Phase = 'loading' | 'title' | 'hunt' | 'scanning' | 'choose' | 'done'

export function SignSpliceCard({ teamId, taskId }: { teamId: string; taskId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [titleRow, setTitleRow] = useState<TitleRow | null>(null)
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [draftTitle, setDraftTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [finalUrl, setFinalUrl] = useState<string | null>(null)

  // current scan
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [shopName, setShopName] = useState<string>('')
  const imgRef = useRef<HTMLImageElement>(null)

  const target = letters.find(l => l.status !== 'collected') ?? null
  const allCollected = letters.length > 0 && letters.every(l => l.status === 'collected')

  // ── load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: t } = await supabase.from('bingo_sign_splice_titles')
      .select('id, title, locked, final_url')
      .eq('team_id', teamId).eq('task_id', taskId).maybeSingle()

    if (!t) { setPhase('title'); return }
    setTitleRow(t as TitleRow)
    setFinalUrl((t as TitleRow).final_url)

    const { data: ls } = await supabase.from('bingo_sign_splice_letters')
      .select('id, position, letter, status, shop_name, crop_url, ocr_confidence')
      .eq('team_id', teamId).eq('task_id', taskId).order('position')
    const rows = (ls ?? []) as LetterRow[]
    setLetters(rows)
    setPhase(rows.length > 0 && rows.every(l => l.status === 'collected') ? 'done' : 'hunt')
  }, [teamId, taskId])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { void disposeOcr() }, [])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  // ── Rule 1: lock the title, create one row per letter ──────────────────────
  const lockTitle = async () => {
    const problem = validateTitle(draftTitle, DEFAULT_TITLE_RULES)
    if (problem) { setError(problem); return }
    setError(null)
    setBusy('Locking your title…')
    try {
      const chars = titleLetters(draftTitle)
      const { data: t, error: tErr } = await supabase.from('bingo_sign_splice_titles')
        .insert({ team_id: teamId, task_id: taskId, title: draftTitle.trim().toUpperCase(), locked: true })
        .select('id, title, locked, final_url').single()
      if (tErr) throw tErr

      const { error: lErr } = await supabase.from('bingo_sign_splice_letters').insert(
        chars.map((letter, i) => ({ team_id: teamId, task_id: taskId, position: i, letter })),
      )
      if (lErr) throw lErr

      setTitleRow(t as TitleRow)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not lock the title.')
    } finally {
      setBusy(null)
    }
  }

  // ── scan a photo ───────────────────────────────────────────────────────────
  const handlePhoto = async (file: File) => {
    if (!target) return
    setError(null); setNotice(null); setPicked(null)
    setPhase('scanning')
    try {
      setBusy('Preparing photo…')
      const small = await downscale(file)

      // Rule 9 — this exact photo has been used before
      setBusy('Checking the photo…')
      const hash = await sha256(small)
      const { data: dupes } = await supabase.from('bingo_sign_splice_photos')
        .select('id').eq('team_id', teamId).eq('task_id', taskId).eq('image_hash', hash).limit(1)
      if (dupes && dupes.length > 0) {
        fail('THIS PHOTO HAS ALREADY BEEN USED.')
        return
      }

      // Rule 10 — near-identical retake of an earlier shot
      const pHash = await perceptualHash(small)
      const { data: priors } = await supabase.from('bingo_sign_splice_photos')
        .select('perceptual_hash').eq('team_id', teamId).eq('task_id', taskId)
      const similar = (priors ?? []).some(p =>
        p.perceptual_hash && hammingDistance(pHash, p.perceptual_hash) <= PHASH_THRESHOLD)

      setBusy('Reading the sign…')
      const result = await runOcr(small)

      // Rule 12 — a wall of text is a directory board, not one shop's sign
      if (result.words.length > DIRECTORY_BOARD_WORD_LIMIT) {
        await logPhoto(hash, pHash, result, 'rejected')
        fail('That looks like a directory board, not a single shop sign. Photograph one shop.')
        return
      }

      // Rule 7 — the letter has to actually be on the sign
      const found = findLetterOccurrences(result, target.letter)
      if (found.length === 0) {
        await logPhoto(hash, pHash, result, 'rejected')
        fail(`We couldn't find "${target.letter}" in this sign.`)
        return
      }

      // Rules 4-6 — one shop gives one letter
      const shop = (result.words[0]?.text ?? 'Unknown Shop').toUpperCase()
      const used = letters.find(l => l.status === 'collected' && l.shop_name === shop)
      if (used) {
        await logPhoto(hash, pHash, result, 'rejected')
        fail(`You already used this shop for "${used.letter}". Find a different shop.`)
        return
      }

      await logPhoto(hash, pHash, result, 'pending')
      if (similar) setNotice('This looks very close to a photo you already took — make sure it really is a different sign.')

      setPhoto(small)
      setPhotoUrl(URL.createObjectURL(small))
      setScan(result)
      setOccurrences(found)
      setShopName(shop)
      setPhase('choose')
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not read that photo.')
    } finally {
      setBusy(null)
    }
  }

  const fail = (message: string) => {
    setError(message)
    setPhase('hunt')
    setPhoto(null)
    setScan(null)
    setOccurrences([])
  }

  const logPhoto = (hash: string, pHash: string, result: ScanResult, outcome: string) =>
    supabase.from('bingo_sign_splice_photos').insert({
      team_id: teamId, task_id: taskId, image_hash: hash, perceptual_hash: pHash,
      target_letter: target?.letter ?? null, detected_text: result.fullText,
      ocr_confidence: result.avgConfidence, outcome,
    })

  // ── confirm the tapped letter ──────────────────────────────────────────────
  const confirmLetter = async () => {
    if (!photo || !target || picked === null) return
    const chosen = occurrences[picked]
    setBusy('Saving your letter…')
    try {
      const crop = await cropLetter(photo, chosen.charBox)
      const stamp = Date.now()
      const base = `bingo-media/sign-splice/${teamId}-${taskId}-${target.position}-${stamp}`

      const photoUp = await supabase.storage.from('media')
        .upload(`${base}-photo.jpg`, photo, { contentType: 'image/jpeg' })
      if (photoUp.error) throw photoUp.error
      const cropUp = await supabase.storage.from('media')
        .upload(`${base}-crop.png`, crop, { contentType: 'image/png' })
      if (cropUp.error) throw cropUp.error

      const photoPublic = supabase.storage.from('media').getPublicUrl(`${base}-photo.jpg`).data.publicUrl
      const cropPublic = supabase.storage.from('media').getPublicUrl(`${base}-crop.png`).data.publicUrl

      const lowConfidence = chosen.confidence < MIN_CONFIDENCE
      const { error: upErr } = await supabase.from('bingo_sign_splice_letters').update({
        status: 'collected',
        shop_name: shopName,
        photo_url: photoPublic,
        crop_url: cropPublic,
        ocr_text: scan?.fullText ?? null,
        ocr_confidence: chosen.confidence,
        captured_at: new Date().toISOString(),
      }).eq('id', target.id)
      if (upErr) throw upErr

      const next = letters.map(l =>
        l.id === target.id
          ? { ...l, status: 'collected' as const, shop_name: shopName, crop_url: cropPublic, ocr_confidence: chosen.confidence }
          : l)
      setLetters(next)
      setPhoto(null); setScan(null); setOccurrences([]); setPicked(null)
      setNotice(lowConfidence ? 'Saved — that one was a bit blurry, so double-check it on the final title.' : null)

      if (next.every(l => l.status === 'collected')) await composeFinal(next)
      else setPhase('hunt')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that letter.')
      setPhase('choose')
    } finally {
      setBusy(null)
    }
  }

  // ── stitch the title once every letter is in ───────────────────────────────
  const composeFinal = async (rows: LetterRow[]) => {
    setBusy('Building your title…')
    try {
      const crops = await Promise.all(
        [...rows].sort((a, b) => a.position - b.position)
          .map(async l => {
            const res = await fetch(l.crop_url!)
            return res.blob()
          }),
      )
      const sheet = await buildFinalImage(crops)
      const path = `bingo-media/sign-splice/${teamId}-${taskId}-final-${Date.now()}.png`
      const up = await supabase.storage.from('media').upload(path, sheet, { contentType: 'image/png' })
      if (up.error) throw up.error
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      await supabase.from('bingo_sign_splice_titles')
        .update({ final_url: url, completed_at: new Date().toISOString() })
        .eq('team_id', teamId).eq('task_id', taskId)
      setFinalUrl(url)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Letters saved, but the title image failed to build.')
      setPhase('hunt')
    } finally {
      setBusy(null)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <p className="text-white/60 text-center py-6 font-bold">Loading…</p>
  }

  const banner = (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-2xl bg-red-400/15 border border-red-400/40 text-center">
          <p className="text-red-200 font-bold text-sm">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="mb-4 p-3 rounded-2xl bg-amber-400/15 border border-amber-400/40 text-center">
          <p className="text-amber-100 font-bold text-sm">{notice}</p>
        </div>
      )}
      {busy && (
        <div className="mb-4 p-3 rounded-2xl bg-white/10 border border-white/25 text-center">
          <p className="text-white font-bold text-sm">{busy}</p>
        </div>
      )}
    </>
  )

  // 1 — pick and lock the title
  if (phase === 'title') {
    return (
      <div>
        <p className="text-white font-black text-lg text-center mb-1">🎬 Lock Your Movie Title</p>
        <p className="text-white/50 text-sm text-center mb-5">
          You will hunt each letter on a different shop sign. The title cannot be changed once locked.
        </p>
        {banner}
        <input
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          placeholder="e.g. STAR"
          autoCapitalize="characters"
          className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/30 text-white text-center text-2xl font-black tracking-[0.3em] uppercase placeholder:text-white/30 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-white/60"
        />
        <p className="text-white/40 text-xs text-center mt-2 mb-4">
          {DEFAULT_TITLE_RULES.minLength}–{DEFAULT_TITLE_RULES.maxLength} letters, no spaces or numbers
        </p>
        <button
          onClick={lockTitle}
          disabled={!!busy || !draftTitle.trim()}
          className="w-full py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          Lock Title
        </button>
      </div>
    )
  }

  // 4 — finished
  if (phase === 'done') {
    return (
      <div className="text-center">
        <p className="text-white font-black text-xl mb-1">🏆 Title Complete</p>
        <p className="text-white/60 text-sm mb-5">{titleRow?.title}</p>
        {banner}
        {finalUrl ? (
          <img src={finalUrl} alt={`${titleRow?.title} spliced from shop signs`}
               className="w-full rounded-2xl border-2 border-white/30" />
        ) : (
          <p className="text-white/60 text-sm">Building your title image…</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {letters.map(l => (
            <div key={l.id} className="p-2 rounded-xl bg-white/10 border border-white/20 text-left">
              <span className="text-white font-black text-lg">{l.letter}</span>
              <span className="text-white/50 text-xs block truncate">{l.shop_name}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 3 — tap the letter you want out of the sign
  if (phase === 'choose' && photoUrl && scan) {
    return (
      <div>
        <p className="text-white font-black text-lg text-center mb-1">
          Tap the “{target?.letter}” you want
        </p>
        <p className="text-white/50 text-sm text-center mb-4">
          Found {occurrences.length} in <span className="font-bold">{shopName}</span>
        </p>
        {banner}
        <div className="relative rounded-2xl overflow-hidden border-2 border-white/30">
          <img ref={imgRef} src={photoUrl} alt="Your sign photo" className="w-full block" />
          {occurrences.map((o, i) => {
            const box: CharBox = o.charBox
            const style = {
              left: `${(box.x0 / scan.width) * 100}%`,
              top: `${(box.y0 / scan.height) * 100}%`,
              width: `${((box.x1 - box.x0) / scan.width) * 100}%`,
              height: `${((box.y1 - box.y0) / scan.height) * 100}%`,
            }
            const on = picked === i
            return (
              <button
                key={i}
                onClick={() => setPicked(i)}
                aria-label={`Use the ${o.char} in ${o.text}`}
                className={`absolute rounded-md border-[3px] transition-colors ${
                  on ? 'border-emerald-300 bg-emerald-300/30' : 'border-amber-300 bg-amber-300/15'
                }`}
                style={style}
              />
            )
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { setPhase('hunt'); setPhoto(null); setScan(null); setOccurrences([]) }}
            className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/30 text-white font-black"
          >
            Retake
          </button>
          <button
            onClick={confirmLetter}
            disabled={picked === null || !!busy}
            className="flex-[2] py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40"
          >
            Use This Letter
          </button>
        </div>
      </div>
    )
  }

  // 2 — hunting: progress strip plus the camera
  return (
    <div>
      <p className="text-white font-black text-lg text-center mb-1">{titleRow?.title}</p>
      <p className="text-white/50 text-sm text-center mb-4">
        {letters.filter(l => l.status === 'collected').length} of {letters.length} letters found
      </p>
      {banner}

      <div className="flex gap-1.5 flex-wrap justify-center mb-5">
        {letters.map(l => {
          const isTarget = target?.id === l.id
          return (
            <div
              key={l.id}
              className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center overflow-hidden ${
                l.status === 'collected'
                  ? 'border-emerald-300/70 bg-emerald-300/15'
                  : isTarget
                    ? 'border-white bg-white/20'
                    : 'border-white/25 bg-white/5'
              }`}
            >
              {l.crop_url
                ? <img src={l.crop_url} alt={l.letter} className="w-full h-full object-cover" />
                : <span className={`font-black text-lg ${isTarget ? 'text-white' : 'text-white/40'}`}>{l.letter}</span>}
            </div>
          )
        })}
      </div>

      {allCollected ? (
        <button onClick={() => composeFinal(letters)} disabled={!!busy}
                className="w-full py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40">
          Build My Title
        </button>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-2 w-full py-6 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm cursor-pointer hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-4xl">📷</span>
          <span>Photograph a sign with “{target?.letter}”</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={!!busy}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handlePhoto(f)
            }}
          />
        </label>
      )}
    </div>
  )
}
