// Export the award show to PowerPoint.
//
// The show is rendered in a hidden 1920×1080 iframe (?export=1), so every
// viewport-based size resolves exactly as on a 1080p projector. Each slide is
// photographed there and placed full-bleed on a 16:9 PowerPoint slide, so the
// deck always matches the show with no resizing or reflow.

export const EXPORT_W = 1920
export const EXPORT_H = 1080

/** What the show page exposes on `window` in export mode. */
export type AwardExportHook = {
  total: number
  capture: (index: number) => Promise<string>
}

declare global {
  interface Window { __awardExport?: AwardExportHook }
}

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Resolves once every image under `root` has loaded (or failed). */
async function imagesLoaded(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(imgs.map(img => img.complete
    ? img.decode().catch(() => {})
    : new Promise<void>(r => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }) })))
}

/** Resolves once `root`'s DOM has gone `quietMs` without changing (max `maxMs`).
 *  The show can re-render once more after it reports ready (late data). */
function domQuiet(root: HTMLElement, quietMs = 500, maxMs = 6000) {
  return new Promise<void>(resolve => {
    let timer = setTimeout(done, quietMs)
    const cap = setTimeout(done, maxMs)
    const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quietMs) })
    obs.observe(root, { childList: true, subtree: true, characterData: true })
    function done() { obs.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve() }
  })
}

/**
 * Jump every entrance animation to its end state and pin looping ones where
 * they are, then replace each animation with its current values as inline
 * styles. The capture library re-renders a static copy of the DOM, which would
 * otherwise restart animations from their first (often invisible) frame.
 */
function freezeAnimations(doc: Document) {
  for (const a of doc.getAnimations()) {
    const end = a.effect?.getComputedTiming().endTime
    if (typeof end === 'number' && Number.isFinite(end)) a.finish()
    else a.pause()
  }
  const snaps: Array<[HTMLElement, Record<string, string>]> = []
  for (const a of doc.getAnimations()) {
    const effect = a.effect as KeyframeEffect | null
    const target = effect?.target as HTMLElement | null
    if (!effect || !target || effect.pseudoElement || !target.style) continue
    const computed = doc.defaultView!.getComputedStyle(target) as unknown as Record<string, string>
    const values: Record<string, string> = {}
    for (const kf of effect.getKeyframes()) {
      for (const prop of Object.keys(kf)) {
        if (['offset', 'computedOffset', 'easing', 'composite'].includes(prop)) continue
        values[prop] = computed[prop]
      }
    }
    snaps.push([target, values])
  }
  for (const [target, values] of snaps) {
    target.style.animation = 'none'
    Object.assign(target.style, values)
  }
}

/** Runs inside the export iframe: show slide `index`, settle it, photograph it. */
export async function captureShowSlide(
  getRoot: () => HTMLElement | null,
  goTo: (index: number) => void,
  index: number,
): Promise<string> {
  goTo(index)
  await frame(); await frame()
  const doc = getRoot()?.ownerDocument
  if (!doc) throw new Error('Show is not on screen')
  await domQuiet(doc.body)
  // Place slides stay `invisible` until their artwork has loaded.
  for (let t = 0; t < 50 && doc.body.querySelector('.invisible'); t++) await wait(100)
  await frame(); await frame()
  await imagesLoaded(doc.body)
  await doc.fonts?.ready
  freezeAnimations(doc)
  await frame()
  const root = getRoot()
  if (!root) throw new Error('Show is not on screen')
  const { toJpeg } = await import('html-to-image')
  return toJpeg(root, {
    width: EXPORT_W,
    height: EXPORT_H,
    pixelRatio: 1,
    quality: 0.92,
    style: { width: `${EXPORT_W}px`, height: `${EXPORT_H}px` },
  })
}

/**
 * Runs in the admin page: load the show off-screen, capture every slide and
 * download them as a .pptx.
 */
export async function exportAwardShowToPpt(
  sectionSlug: string,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.src = `/bingo-dash/slides/awards/${encodeURIComponent(sectionSlug)}?export=1`
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed', left: '-30000px', top: '0',
    width: `${EXPORT_W}px`, height: `${EXPORT_H}px`,
    border: '0', pointerEvents: 'none',
  })
  document.body.appendChild(iframe)
  try {
    let hook: AwardExportHook | undefined
    for (let t = 0; t < 300 && !hook; t++) {
      await wait(100)
      hook = iframe.contentWindow?.__awardExport
    }
    if (!hook) throw new Error('The show did not load. Check that the board has slides, then try again.')
    if (hook.total === 0) throw new Error('There are no slides to export.')

    const images: string[] = []
    onProgress?.(0, hook.total)
    for (let i = 0; i < hook.total; i++) {
      images.push(await hook.capture(i))
      onProgress?.(i + 1, hook.total)
    }

    const { default: PptxGenJS } = await import('pptxgenjs')
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in, exactly 16:9
    for (const data of images) {
      pptx.addSlide().addImage({ data, x: 0, y: 0, w: '100%', h: '100%' })
    }
    await pptx.writeFile({ fileName })
  } finally {
    iframe.remove()
  }
}
