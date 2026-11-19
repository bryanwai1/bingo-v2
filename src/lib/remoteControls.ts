// ════════════════════════════════════════════════════════════════════════════
// REMOTE CARD CONTROLS — lets the phone remote drive whatever a card puts on the demo screen.
//
// Every card has its own controls (a Play button, a text box, a Submit, a photo picker, a picture to tap).
// Rather than teach the remote each card, the demo SCANS the open card's DOM, tells the phone what it
// found, and the phone sends back "press #3", "type this into #1", "tap here on #2". Controls with a
// data-remote marker (Start, Next, Complete...) already have their own remote buttons and are skipped.
// ════════════════════════════════════════════════════════════════════════════

export type RemoteControl = {
  /** Position in the scan: the id a command uses (checked against the label, in case the card re-rendered). */
  i: number
  kind: 'button' | 'text' | 'select' | 'file' | 'tap'
  label: string
  value?: string
  options?: string[]
  numeric?: boolean
  /** A row of one-letter boxes shows up as one text control this long. */
  maxLen?: number
  disabled?: boolean
  /** A tap area: the picture to show on the phone, and its width / height. */
  image?: string
  ratio?: number
}

type Found = { el: HTMLElement; ring: HTMLElement; c: RemoteControl }

const SEL = 'button, input, textarea, select, [data-remote-tap]'
const clean = (s: string | null | undefined, n = 60) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const shown = (el: Element) => el.getClientRects().length > 0

function collect(): Found[] {
  const root = document.querySelector('[data-remote-card]')
  if (!root) return []
  const out: Found[] = []
  const seenRows = new Set<Element>()
  const add = (el: HTMLElement, ring: HTMLElement, c: Omit<RemoteControl, 'i'>) => out.push({ el, ring, c: { ...c, i: out.length } })

  root.querySelectorAll<HTMLElement>(SEL).forEach(el => {
    if (el.hasAttribute('data-remote') || el.closest('[data-remote-skip]')) return

    if (el.hasAttribute('data-remote-tap')) {
      if (!shown(el)) return
      const r = el.getBoundingClientRect()
      add(el, el, { kind: 'tap', label: clean(el.getAttribute('data-remote-tap')) || 'Tap the picture', image: el.querySelector('img')?.src, ratio: r.width / Math.max(1, r.height) })
      return
    }

    if (el instanceof HTMLButtonElement) {
      if (!shown(el)) return
      const label = clean(el.getAttribute('aria-label')) || clean(el.textContent) || clean(el.title)
      if (label) add(el, el, { kind: 'button', label, disabled: el.disabled })
      return
    }

    if (el instanceof HTMLSelectElement) {
      if (!shown(el)) return
      add(el, el, {
        kind: 'select', label: clean(el.getAttribute('aria-label')) || clean(el.labels?.[0]?.textContent) || clean(el.options[0]?.text) || 'Choose',
        options: [...el.options].map(o => clean(o.text)), value: clean(el.selectedOptions[0]?.text), disabled: el.disabled,
      })
      return
    }

    const input = el as HTMLInputElement | HTMLTextAreaElement
    const type = (input as HTMLInputElement).type
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'range') return

    if (type === 'file') {
      const wrap = input.closest<HTMLElement>('label') ?? input.parentElement
      if (!wrap || !shown(wrap)) return
      add(input, wrap, { kind: 'file', label: clean(wrap.textContent) || 'Add a photo' })
      return
    }

    if (!shown(input)) return

    if (type === 'checkbox' || type === 'radio') {
      const label = clean(input.closest('label')?.textContent) || clean(input.getAttribute('aria-label')) || 'Option'
      add(input, input.closest<HTMLElement>('label') ?? input, { kind: 'button', label: `${(input as HTMLInputElement).checked ? '☑' : '☐'} ${label}`, disabled: input.disabled })
      return
    }

    // A row of one-letter boxes (the answer letters) is one control: typing the word fills them in turn.
    if (input.maxLength === 1 && input.parentElement) {
      const row = input.parentElement
      if (seenRows.has(row)) return
      seenRows.add(row)
      const boxes = [...row.querySelectorAll<HTMLInputElement>('input')].filter(b => b.maxLength === 1)
      const label = clean(row.parentElement?.querySelector('label')?.textContent) || 'Answer'
      add(input, row, { kind: 'text', label, value: boxes.map(b => b.value).join(''), maxLen: boxes.length, disabled: input.disabled })
      return
    }

    add(input, input, {
      kind: 'text',
      label: clean(input.getAttribute('aria-label')) || clean(input.placeholder) || clean(input.labels?.[0]?.textContent) || 'Text',
      value: input.value,
      numeric: input.inputMode === 'numeric' || (input as HTMLInputElement).type === 'number',
      maxLen: input.maxLength > 0 ? input.maxLength : undefined,
      disabled: input.disabled || input.readOnly,
    })
  })
  return out
}

function find(i: number, label: string): Found | null {
  const all = collect()
  return all[i]?.c.label === label ? all[i] : all.find(f => f.c.label === label) ?? null
}

/** What the open card shows right now, for the phone. Empty when no card is open. */
export const scanControls = (): RemoteControl[] => collect().map(f => f.c)

/** The element to ring on the demo screen for a control (a hidden file input is rung by its label). */
export const controlRing = (i: number, label: string): HTMLElement | null => find(i, label)?.ring ?? null

/** Set a field the way a keyboard would, so React sees it (its own value setter is bypassed on purpose). */
function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event: 'input' | 'change') {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event(event, { bubbles: true }))
}

export function pressControl(i: number, label: string) {
  find(i, label)?.el.click()
}

export function typeControl(i: number, label: string, value: string) {
  const f = find(i, label)
  if (!f || f.c.disabled) return
  const el = f.el
  if (el instanceof HTMLSelectElement) {
    const opt = [...el.options].find(o => clean(o.text) === value)
    if (opt) setNative(el, opt.value, 'change')
    return
  }
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  if (el.maxLength === 1 && el.parentElement) {
    const chars = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    ;[...el.parentElement.querySelectorAll<HTMLInputElement>('input')].filter(b => b.maxLength === 1)
      .forEach((b, k) => { if (chars[k]) setNative(b, chars[k], 'input') })
    return
  }
  setNative(el, el.maxLength > 0 ? value.slice(0, el.maxLength) : value, 'input')
}

/** A stand-in photo for a card that wants one: a labelled picture made on the spot, put in the file picker. */
export async function giveFile(i: number, label: string) {
  const f = find(i, label)
  if (!f || !(f.el instanceof HTMLInputElement)) return
  const canvas = document.createElement('canvas')
  canvas.width = 800; canvas.height = 600
  const g = canvas.getContext('2d')
  if (!g) return
  const bg = g.createLinearGradient(0, 0, 800, 600)
  bg.addColorStop(0, '#00b14f'); bg.addColorStop(1, '#0b3d22')
  g.fillStyle = bg; g.fillRect(0, 0, 800, 600)
  g.fillStyle = 'rgba(255,255,255,.92)'
  g.font = '800 56px system-ui, sans-serif'; g.textAlign = 'center'
  g.fillText('📷 Demo photo', 400, 290)
  g.font = '600 30px system-ui, sans-serif'
  g.fillText(new Date().toLocaleTimeString(), 400, 350)
  const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const dt = new DataTransfer()
  dt.items.add(new File([blob], `demo-photo-${Date.now()}.png`, { type: 'image/png' }))
  f.el.files = dt.files
  f.el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** A tap on a picture, at a fraction (0-1) of its width and height, with a dot where it landed. */
export function tapControl(i: number, label: string, x: number, y: number) {
  const f = find(i, label)
  if (!f) return
  const r = f.el.getBoundingClientRect()
  const cx = r.left + Math.min(1, Math.max(0, x)) * r.width
  const cy = r.top + Math.min(1, Math.max(0, y)) * r.height
  f.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }))
  const dot = document.createElement('div')
  dot.setAttribute('aria-hidden', 'true')
  dot.style.cssText = `position:fixed;left:${cx - 16}px;top:${cy - 16}px;width:32px;height:32px;border-radius:9999px;border:3px solid #facc15;` +
    'box-shadow:0 0 12px 2px rgba(250,204,21,.8);pointer-events:none;z-index:2147483000;box-sizing:border-box;'
  document.body.appendChild(dot)
  window.setTimeout(() => dot.remove(), 700)
}
