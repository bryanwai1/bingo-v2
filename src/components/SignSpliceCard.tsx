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
import { CameraCapture } from './CameraCapture'
import {
  DEFAULT_TITLE_RULES,
  buildFinalImage, cropLetter, disposeOcr, downscale, findLetterOccurrences,
  hammingDistance, perceptualHash, runOcr, sha256, titleLetters, validateTitle,
  type CharBox, type Occurrence, type ScanResult, type TitleRules,
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

/** Spec Screen 4 — configured per card from the admin Card Library. */
export type FieldMode = 'hidden' | 'optional' | 'compulsory'

type Phase = 'loading' | 'title' | 'hunt' | 'shop' | 'camera' | 'scanning' | 'choose' | 'done'

export function SignSpliceCard({
  teamId, taskId,
  shopInput = 'optional', lotInput = 'optional',
  minLetters, maxLetters, allowSpaces, allowNumbers, minConfidence,
  demo = false, onComplete,
}: {
  teamId: string
  taskId: string
  /** Demo boards have no real team row, so nothing may be persisted. The whole
   *  hunt runs in memory instead — OCR, cropping and stitching are client-side
   *  anyway, so the demo is fully playable, it just forgets on reload. */
  demo?: boolean
  /** Called once, when the finished title image exists, so the host page can
   *  cross the tile off the board. */
  onComplete?: () => void
  shopInput?: FieldMode
  lotInput?: FieldMode
  minLetters?: number
  maxLetters?: number
  allowSpaces?: boolean
  allowNumbers?: boolean
  minConfidence?: number
}) {
  // Card settings win over the built-in defaults (spec §6).
  const titleRules: TitleRules = {
    minLength: minLetters ?? DEFAULT_TITLE_RULES.minLength,
    maxLength: maxLetters ?? DEFAULT_TITLE_RULES.maxLength,
    allowSpaces: allowSpaces ?? DEFAULT_TITLE_RULES.allowSpaces,
    allowNumbers: allowNumbers ?? DEFAULT_TITLE_RULES.allowNumbers,
  }
  const confidenceBar = minConfidence ?? MIN_CONFIDENCE
  const [phase, setPhase] = useState<Phase>('loading')
  const [titleRow, setTitleRow] = useState<TitleRow | null>(null)
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [draftTitle, setDraftTitle] = useState('')
  // Locking is irreversible for the team — only an admin can undo it — so it
  // goes through an explicit confirmation (spec Screen 2).
  const [confirmLock, setConfirmLock] = useState(false)
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
  const [shopLot, setShopLot] = useState<string>('')
  const [resolvedShop, setResolvedShop] = useState<string>('')
  // Demo-only: stands in for the photo log and the storage bucket.
  const demoHashes = useRef<{ hash: string; pHash: string }[]>([])
  const demoCrops = useRef<Map<string, Blob>>(new Map())
  const completedFired = useRef(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const target = letters.find(l => l.status !== 'collected') ?? null
  const draftLetters = titleLetters(draftTitle).length
  const allCollected = letters.length > 0 && letters.every(l => l.status === 'collected')

  // ── load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (demo) { setPhase('title'); return }
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
  }, [teamId, taskId, demo])

  useEffect(() => { void load() }, [load])

  // The hunt is finished when every letter has been collected and stitched.
  useEffect(() => {
    if (finalUrl && !completedFired.current) {
      completedFired.current = true
      onComplete?.()
    }
  }, [finalUrl, onComplete])
  useEffect(() => () => { void disposeOcr() }, [])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  // ── Rule 1: lock the title, create one row per letter ──────────────────────
  const lockTitle = async () => {
    const problem = validateTitle(draftTitle, titleRules)
    if (problem) { setError(problem); setConfirmLock(false); return }
    setError(null)
    setBusy('Locking your title…')
    try {
      const chars = titleLetters(draftTitle)
      if (demo) {
        setTitleRow({ id: 'demo', title: draftTitle.trim().toUpperCase(), locked: true, final_url: null })
        setLetters(chars.map((letter, i) => ({
          id: `demo-${i}`, position: i, letter, status: 'pending',
          shop_name: null, crop_url: null, ocr_confidence: null,
        })))
        setPhase('hunt')
        return
      }
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
  const handlePhoto = async (file: Blob) => {
    if (!target) return
    setError(null); setNotice(null); setPicked(null)
    setPhase('scanning')
    try {
      setBusy('Preparing photo…')
      const small = await downscale(file)

      // Rule 9 — this exact photo has been used before
      setBusy('Checking the photo…')
      const hash = await sha256(small)
      const dupes = demo
        ? demoHashes.current.filter(p => p.hash === hash)
        : (await supabase.from('bingo_sign_splice_photos')
            .select('id').eq('team_id', teamId).eq('task_id', taskId).eq('image_hash', hash).limit(1)).data
      if (dupes && dupes.length > 0) {
        fail('THIS PHOTO HAS ALREADY BEEN USED.')
        return
      }

      // Rule 10 — near-identical retake of an earlier shot
      const pHash = await perceptualHash(small)
      const priors = demo
        ? demoHashes.current.map(p => ({ perceptual_hash: p.pHash }))
        : (await supabase.from('bingo_sign_splice_photos')
            .select('perceptual_hash').eq('team_id', teamId).eq('task_id', taskId)).data
      const similar = (priors ?? []).some(p =>
        p.perceptual_hash && hammingDistance(pHash, p.perceptual_hash) <= PHASH_THRESHOLD)

      setBusy('Reading the sign…')
      const result = await runOcr(small)

      // Rule 7 — the letter has to actually be on the sign
      const found = findLetterOccurrences(result, target.letter)
      if (found.length === 0) {
        await logPhoto(hash, pHash, result, 'rejected')
        fail(`We couldn't find "${target.letter}" in this sign.`)
        return
      }

      // Rules 4-6 — one shop gives one letter. The typed shop name is the
      // identity whenever Screen 4 collected one; guessing from the sign is only
      // the fallback for cards that hide the field or players who skip it.
      const shop = (shopName.trim() || result.words[0]?.text || 'Unknown Shop').toUpperCase()
      const used = letters.find(l => l.status === 'collected' && l.shop_name === shop)
      if (used) {
        await logPhoto(hash, pHash, result, 'rejected')
        fail(`You already used this shop for "${used.letter}". Find a different shop.`)
        return
      }

      const low = result.avgConfidence < confidenceBar
      await logPhoto(hash, pHash, result, 'pending', { low, similar })
      // Spec §7 — warn BEFORE the letter is accepted, so a retake is still free.
      setNotice(
        similar
          ? 'This looks very close to a photo you already took — make sure it really is a different sign.'
          : low
            ? "We're not completely sure about this sign. Retake for a clearer shot, or use it anyway."
            : null,
      )

      setPhoto(small)
      setPhotoUrl(URL.createObjectURL(small))
      setScan(result)
      setOccurrences(found)
      setResolvedShop(shop)
      setPhase('choose')
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not read that photo.')
    } finally {
      setBusy(null)
    }
  }

  const fail = (message: string) => {
    setError(message)
    // Straight back to the viewfinder — the team is still standing at the shop.
    setPhase('camera')
    setPhoto(null)
    setScan(null)
    setOccurrences([])
  }

  // Rules 8/10 are logged, not queued: play never blocks on a marshal, but
  // every doubtful submission is recorded so a facilitator can audit later.
  const logPhoto = (
    hash: string, pHash: string, result: ScanResult, outcome: string,
    flags: { low: boolean; similar: boolean } = { low: false, similar: false },
  ) => {
    if (demo) { demoHashes.current.push({ hash, pHash }); return }
    return supabase.from('bingo_sign_splice_photos').insert({
      team_id: teamId, task_id: taskId, image_hash: hash, perceptual_hash: pHash,
      target_letter: target?.letter ?? null, detected_text: result.fullText,
      ocr_confidence: result.avgConfidence, outcome,
      shop_name: shopName.trim() || null, shop_lot: shopLot.trim() || null,
      low_confidence: flags.low, similar_flag: flags.similar,
    })
  }

  // ── confirm the tapped letter ──────────────────────────────────────────────
  const confirmLetter = async () => {
    if (!photo || !target || picked === null) return
    const chosen = occurrences[picked]
    setBusy('Saving your letter…')
    try {
      const crop = await cropLetter(photo, chosen.charBox)
      if (demo) {
        const localUrl = URL.createObjectURL(crop)
        demoCrops.current.set(target.id, crop)
        const next = letters.map(l =>
          l.id === target.id
            ? { ...l, status: 'collected' as const, shop_name: resolvedShop, crop_url: localUrl, ocr_confidence: chosen.confidence }
            : l)
        setLetters(next)
        setPhoto(null); setScan(null); setOccurrences([]); setPicked(null)
        setShopName(''); setShopLot(''); setResolvedShop('')
        setNotice(`Letter collected! “${target.letter}” from ${resolvedShop}.`)
        if (next.every(l => l.status === 'collected')) await composeFinal(next)
        else setPhase('hunt')
        return
      }
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

      const lowConfidence = chosen.confidence < confidenceBar
      const { error: upErr } = await supabase.from('bingo_sign_splice_letters').update({
        status: 'collected',
        shop_name: resolvedShop,
        shop_lot: shopLot.trim() || null,
        photo_url: photoPublic,
        crop_url: cropPublic,
        ocr_text: scan?.fullText ?? null,
        ocr_confidence: chosen.confidence,
        captured_at: new Date().toISOString(),
      }).eq('id', target.id)
      if (upErr) throw upErr

      const next = letters.map(l =>
        l.id === target.id
          ? { ...l, status: 'collected' as const, shop_name: resolvedShop, crop_url: cropPublic, ocr_confidence: chosen.confidence }
          : l)
      setLetters(next)
      setPhoto(null); setScan(null); setOccurrences([]); setPicked(null)
      setShopName(''); setShopLot(''); setResolvedShop('')
      setNotice(lowConfidence
        ? `Letter collected — “${target.letter}” was a bit blurry, so check it on the final title.`
        : `Letter collected! “${target.letter}” from ${resolvedShop}.`)

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
      const ordered = [...rows].sort((a, b) => a.position - b.position)
      const crops = demo
        ? ordered.map(l => demoCrops.current.get(l.id)!).filter(Boolean)
        : await Promise.all(ordered.map(async l => (await fetch(l.crop_url!)).blob()))
      const sheet = await buildFinalImage(crops)
      if (demo) {
        setFinalUrl(URL.createObjectURL(sheet))
        setPhase('done')
        return
      }
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
          {draftLetters > 0
            ? `${draftLetters} letter${draftLetters === 1 ? '' : 's'} — that's ${draftLetters} different shop${draftLetters === 1 ? '' : 's'} to find`
            : `${titleRules.minLength}–${titleRules.maxLength} letters${titleRules.allowSpaces ? '' : ', no spaces'}${titleRules.allowNumbers ? '' : ', no numbers'}`}
        </p>

        {confirmLock ? (
          <div className="rounded-2xl p-4 mb-3"
               style={{ background: 'rgba(251,191,36,0.12)', border: '2px solid rgba(251,191,36,0.45)' }}>
            <p className="text-amber-100 font-black text-center mb-1">Are you sure?</p>
            <p className="text-amber-100/80 text-sm text-center mb-1">
              Once the hunt begins your movie title cannot be changed.
            </p>
            <p className="text-white font-black text-center text-xl tracking-[0.2em] my-3">
              {titleLetters(draftTitle).join('')}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmLock(false)}
                      className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/30 text-white font-black">
                Change it
              </button>
              <button onClick={lockTitle} disabled={!!busy}
                      className="flex-[2] py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40">
                Yes, lock it
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              const problem = validateTitle(draftTitle, titleRules)
              if (problem) { setError(problem); return }
              setError(null)
              setConfirmLock(true)
            }}
            disabled={!!busy || !draftTitle.trim()}
            className="w-full py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            Lock Title
          </button>
        )}
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
          Found {occurrences.length} in <span className="font-bold">{resolvedShop}</span>
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

  // Screen 4 — where are you? The shop the team types is what enforces
  // "one shop = one letter", so it is worth asking before the camera opens.
  if (phase === 'shop') {
    const shopMissing = shopInput === 'compulsory' && !shopName.trim()
    const lotMissing = lotInput === 'compulsory' && !shopLot.trim()
    return (
      <div>
        <p className="text-white font-black text-lg text-center mb-1">Where are you?</p>
        <p className="text-white/50 text-sm text-center mb-5">
          Enter the details of the shop sign you are about to photograph.
        </p>
        {banner}
        {shopInput !== 'hidden' && (
          <label className="block mb-3">
            <span className="block text-white/60 text-xs font-black uppercase tracking-wider mb-1">
              Shop / sign name {shopInput === 'compulsory' && <span className="text-amber-300">*</span>}
            </span>
            <input
              value={shopName}
              onChange={e => setShopName(e.target.value)}
              placeholder="e.g. Starbucks"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/30 text-white font-bold placeholder:text-white/30 focus:outline-none focus:border-white/60"
            />
          </label>
        )}
        {lotInput !== 'hidden' && (
          <label className="block mb-4">
            <span className="block text-white/60 text-xs font-black uppercase tracking-wider mb-1">
              Lot number {lotInput === 'compulsory' && <span className="text-amber-300">*</span>}
            </span>
            <input
              value={shopLot}
              onChange={e => setShopLot(e.target.value)}
              placeholder="e.g. G-14"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/30 text-white font-bold placeholder:text-white/30 focus:outline-none focus:border-white/60"
            />
          </label>
        )}
        <div className="flex gap-2">
          <button onClick={() => setPhase('hunt')}
                  className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/30 text-white font-black">
            Back
          </button>
          <button
            onClick={() => setPhase('camera')}
            disabled={shopMissing || lotMissing}
            className="flex-[2] py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40"
          >
            Proceed to camera
          </button>
        </div>
        {(shopMissing || lotMissing) && (
          <p className="text-white/40 text-xs text-center mt-2 font-bold">
            Fill in the starred field to continue.
          </p>
        )}
      </div>
    )
  }

  // Screen 5 — live capture only. No gallery path exists here by design.
  if (phase === 'camera') {
    return (
      <div>
        <p className="text-white font-black text-lg text-center mb-1">
          Photograph the “{target?.letter}”
        </p>
        <p className="text-white/50 text-sm text-center mb-4">
          Show the shop sign with your target letter clearly visible.
        </p>
        {banner}
        <CameraCapture
          hint={`Find “${target?.letter}” on the sign`}
          onCapture={blob => void handlePhoto(blob)}
          onCancel={() => setPhase(shopInput === 'hidden' && lotInput === 'hidden' ? 'hunt' : 'shop')}
        />
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
        <button
          onClick={() => setPhase(shopInput === 'hidden' && lotInput === 'hidden' ? 'camera' : 'shop')}
          disabled={!!busy}
          className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-2xl border-2 border-dashed border-white/30 text-white/60 font-bold text-sm hover:border-white/50 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-50"
        >
          <span className="text-4xl">📷</span>
          <span>Find a sign with “{target?.letter}”</span>
        </button>
      )}
    </div>
  )
}
