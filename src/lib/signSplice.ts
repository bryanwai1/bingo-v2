// Sign Splice Title — browser port of the mall-hunt FastAPI prototype.
//
// The prototype ran EasyOCR + OpenCV + Pillow behind a Python API. Everything
// here runs in the page instead: Tesseract.js (WASM) for OCR, Web Crypto for
// the exact-duplicate hash, and <canvas> for cropping and the final composite.
// No second server, no Python.
//
// One upside of the move: Tesseract reports real per-symbol boxes, so we no
// longer have to estimate a character box by dividing a word box evenly —
// which the prototype's README called out as its main inaccuracy.

import Tesseract from 'tesseract.js'

export type CharBox = { x0: number; y0: number; x1: number; y1: number }

export type Occurrence = {
  /** the whole word the letter was found inside, for display */
  text: string
  char: string
  charIndex: number
  wordBox: CharBox
  charBox: CharBox
  /** 0..1 */
  confidence: number
  /** true when the box came from a real symbol, false when estimated */
  exact: boolean
}

export type ScanResult = {
  words: { text: string; confidence: number; box: CharBox }[]
  fullText: string
  /** mean word confidence, 0..1 */
  avgConfidence: number
  width: number
  height: number
}

// ── OCR ──────────────────────────────────────────────────────────────────────

let workerPromise: Promise<Tesseract.Worker> | null = null

/** Lazily start one worker and reuse it — booting costs a few seconds. */
function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) workerPromise = Tesseract.createWorker('eng')
  return workerPromise
}

/** Free the worker. Call when leaving the card so the WASM heap is released. */
export async function disposeOcr() {
  if (!workerPromise) return
  const w = await workerPromise
  workerPromise = null
  await w.terminate()
}

function boxOf(b: { x0: number; y0: number; x1: number; y1: number }): CharBox {
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }
}

export async function runOcr(image: Blob): Promise<ScanResult> {
  const worker = await getWorker()
  // Tesseract's Page has no image dimensions, so measure the source ourselves —
  // the tap overlay needs them to map boxes onto the displayed photo.
  const bmp = await createImageBitmap(image)
  const width = bmp.width
  const height = bmp.height
  bmp.close()

  const { data } = await worker.recognize(
    image as Parameters<Tesseract.Worker['recognize']>[0],
    {},
    { blocks: true },
  )

  const words: ScanResult['words'] = []
  const symbolsByWord: Tesseract.Symbol[][] = []

  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = (word.text ?? '').trim()
          if (!text) continue
          words.push({ text, confidence: word.confidence / 100, box: boxOf(word.bbox) })
          symbolsByWord.push(word.symbols ?? [])
        }
      }
    }
  }

  const fullText = words.map(w => w.text).join(' ').trim()
  const avgConfidence = words.length
    ? words.reduce((n, w) => n + w.confidence, 0) / words.length
    : 0

  lastSymbols = symbolsByWord
  return { words, fullText, avgConfidence, width, height }
}

// Symbol boxes for the most recent scan, parallel to ScanResult.words.
let lastSymbols: Tesseract.Symbol[][] = []

/**
 * Every occurrence of `target` across the scanned words.
 *
 * Ports find_letter_occurrences from the prototype's ocr.py, but prefers the
 * real symbol box when Tesseract gives one and only falls back to the even
 * horizontal split when it doesn't.
 */
export function findLetterOccurrences(scan: ScanResult, target: string): Occurrence[] {
  const want = target.toLowerCase()
  const out: Occurrence[] = []

  scan.words.forEach((word, wi) => {
    const symbols = lastSymbols[wi] ?? []
    const chars = [...word.text]
    const width = word.box.x1 - word.box.x0
    const charW = chars.length ? width / chars.length : width

    chars.forEach((ch, idx) => {
      if (ch.toLowerCase() !== want) return
      const sym = symbols[idx]
      const usable = sym && sym.bbox && sym.bbox.x1 > sym.bbox.x0
      out.push({
        text: word.text,
        char: ch,
        charIndex: idx,
        wordBox: word.box,
        charBox: usable
          ? boxOf(sym.bbox)
          : {
              x0: word.box.x0 + idx * charW,
              y0: word.box.y0,
              x1: word.box.x0 + (idx + 1) * charW,
              y1: word.box.y1,
            },
        confidence: usable ? sym.confidence / 100 : word.confidence,
        exact: !!usable,
      })
    })
  })

  return out
}

// ── Hashing (Rules 9 and 10) ─────────────────────────────────────────────────

/** sha256 of the raw bytes — exact re-upload detection. */
export async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 64-bit difference hash. imagehash.phash needs a DCT; dHash is a couple of
 * lines on a canvas and separates near-duplicate photos just as well at the
 * Hamming distances this game cares about.
 */
export async function perceptualHash(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = 9
  c.height = 8
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, 9, 8)
  bmp.close()
  const { data } = ctx.getImageData(0, 0, 9, 8)
  const grey = (i: number) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]

  let bits = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += grey(y * 9 + x) > grey(y * 9 + x + 1) ? '1' : '0'
    }
  }
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) { d += x & 1; x >>= 1 }
  }
  return d
}

// ── Cropping and the final composite (replaces OpenCV / Pillow) ──────────────

const TILE_W = 300
const TILE_H = 400
const TILE_GAP = 20
const TILE_BG = '#172623'    // --a-surface-2 (dark)
const SHEET_BG = '#08110f'   // --a-bg (dark)

function toBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas encode failed'))), type, 0.92),
  )
}

/** Crop one letter out of the photo, with the prototype's 15% padding. */
export async function cropLetter(source: Blob, box: CharBox): Promise<Blob> {
  const bmp = await createImageBitmap(source)
  const padX = (box.x1 - box.x0) * 0.15
  const padY = (box.y1 - box.y0) * 0.15
  let x0 = Math.max(0, Math.round(box.x0 - padX))
  let y0 = Math.max(0, Math.round(box.y0 - padY))
  let x1 = Math.min(bmp.width, Math.round(box.x1 + padX))
  let y1 = Math.min(bmp.height, Math.round(box.y1 + padY))
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = bmp.width; y1 = bmp.height }

  const c = document.createElement('canvas')
  c.width = x1 - x0
  c.height = y1 - y0
  c.getContext('2d')!.drawImage(bmp, x0, y0, c.width, c.height, 0, 0, c.width, c.height)
  bmp.close()
  return toBlob(c)
}

/** Stitch the collected crops into one title strip, in letter order. */
export async function buildFinalImage(crops: Blob[]): Promise<Blob> {
  const bmps = await Promise.all(crops.map(c => createImageBitmap(c)))
  const c = document.createElement('canvas')
  c.width = bmps.length * TILE_W + Math.max(0, bmps.length - 1) * TILE_GAP
  c.height = TILE_H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = SHEET_BG
  ctx.fillRect(0, 0, c.width, c.height)

  bmps.forEach((bmp, i) => {
    const x = i * (TILE_W + TILE_GAP)
    ctx.fillStyle = TILE_BG
    ctx.fillRect(x, 0, TILE_W, TILE_H)
    // contain, preserving aspect ratio
    const scale = Math.min(TILE_W / bmp.width, TILE_H / bmp.height)
    const w = bmp.width * scale
    const h = bmp.height * scale
    ctx.drawImage(bmp, x + (TILE_W - w) / 2, (TILE_H - h) / 2, w, h)
    bmp.close()
  })

  return toBlob(c)
}

/** Shrink a camera photo before OCR — full-res phone shots are slow to scan. */
export async function downscale(blob: Blob, maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  if (Math.max(bmp.width, bmp.height) <= maxSide) { bmp.close(); return blob }
  const scale = maxSide / Math.max(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return toBlob(c, 'image/jpeg')
}

// ── Title rules (Rule 1) ─────────────────────────────────────────────────────

export type TitleRules = {
  minLength: number
  maxLength: number
  allowSpaces: boolean
  allowNumbers: boolean
}

export const DEFAULT_TITLE_RULES: TitleRules = {
  minLength: 4,
  maxLength: 20,
  allowSpaces: false,
  allowNumbers: false,
}

/** Letters to hunt, in order — spaces never become targets. */
export function titleLetters(title: string): string[] {
  return [...title.toUpperCase()].filter(ch => /[A-Z0-9]/.test(ch))
}

export function validateTitle(raw: string, rules: TitleRules): string | null {
  const title = raw.trim()
  if (!title) return 'Enter a movie title.'
  if (!rules.allowSpaces && /\s/.test(title)) return 'Spaces are not allowed in the title.'
  if (!rules.allowNumbers && /\d/.test(title)) return 'Numbers are not allowed in the title.'
  if (!/^[A-Za-z0-9 ]+$/.test(title)) return 'Use letters only — no punctuation.'
  const n = titleLetters(title).length
  if (n < rules.minLength) return `Title needs at least ${rules.minLength} letters.`
  if (n > rules.maxLength) return `Title can be at most ${rules.maxLength} letters.`
  return null
}

// ── Shop matching (Rule 11) ──────────────────────────────────────────────────

/**
 * Fuzzy match the OCR text against a shop list — stands in for rapidfuzz's
 * partial_ratio. Returns the best shop name and a 0..100 score.
 */
export function matchShop(detectedText: string, shopNames: string[]): { name: string; score: number } | null {
  const hay = detectedText.toLowerCase().replace(/\s+/g, ' ')
  if (!hay || shopNames.length === 0) return null

  let best: { name: string; score: number } | null = null
  for (const name of shopNames) {
    const needle = name.toLowerCase()
    let score: number
    if (hay.includes(needle)) {
      score = 100
    } else {
      // longest common run of characters, as a share of the shop name
      let run = 0
      let bestRun = 0
      for (let i = 0; i < hay.length; i++) {
        run = needle.includes(hay[i]) ? run + 1 : 0
        bestRun = Math.max(bestRun, run)
      }
      score = Math.round((bestRun / needle.length) * 100)
    }
    if (!best || score > best.score) best = { name, score }
  }
  return best && best.score >= 60 ? best : null
}

/** Rule 12: a wall of text is a directory board, not one shop's sign. */
export const DIRECTORY_BOARD_WORD_LIMIT = 25
