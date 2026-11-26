// Drag-and-drop for every file input in the app.
//
// Each upload control is a hidden <input type="file"> behind a label or button.
// Rather than wiring a drop handler into every one, this finds the control the
// file was dropped on (the nearest ancestor holding exactly one file input),
// highlights it while a file is dragged over, and hands the dropped files to
// that input as if they had been picked in the dialog - so each screen's own
// onChange (validation, compression, upload) runs unchanged.

const HIGHLIGHT = 'file-drop-active'
const MAX_LEVELS = 4

function findTarget(from: EventTarget | null): { zone: HTMLElement; input: HTMLInputElement } | null {
  let el = from instanceof Element ? (from as HTMLElement) : null
  for (let i = 0; el && i <= MAX_LEVELS; i++, el = el.parentElement) {
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="file"]')
    if (inputs.length === 1) return inputs[0].disabled ? null : { zone: el, input: inputs[0] }
    if (inputs.length > 1) return null
  }
  return null
}

function matchesAccept(file: File, accept: string): boolean {
  const rules = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (rules.length === 0) return true
  const name = file.name.toLowerCase(), type = file.type.toLowerCase()
  return rules.some(r =>
    r.startsWith('.') ? name.endsWith(r)
    : r.endsWith('/*') ? type.startsWith(r.slice(0, -1))
    : type === r)
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

export function installFileDrop() {
  let active: HTMLElement | null = null
  const clear = () => { active?.classList.remove(HIGHLIGHT); active = null }

  document.addEventListener('dragover', e => {
    if (!hasFiles(e)) return
    e.preventDefault() // also stops the browser opening a file dropped on the page
    const t = findTarget(e.target)
    if (t?.zone !== active) { clear(); active = t?.zone ?? null; active?.classList.add(HIGHLIGHT) }
    if (e.dataTransfer) e.dataTransfer.dropEffect = t ? 'copy' : 'none'
  })
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) clear() })
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    clear()
    const t = findTarget(e.target)
    if (!t) return
    let files = Array.from(e.dataTransfer?.files ?? []).filter(f => matchesAccept(f, t.input.accept))
    if (!t.input.multiple) files = files.slice(0, 1)
    if (files.length === 0) return
    const dt = new DataTransfer()
    files.forEach(f => dt.items.add(f))
    t.input.files = dt.files
    t.input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
