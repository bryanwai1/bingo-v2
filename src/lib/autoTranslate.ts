import { useEffect } from 'react'
import { useLang } from '../hooks/useLanguage'
import { getCachedMs, isKnownMs, translateToMs } from './translate'

/**
 * Whole-page Malay translation.
 *
 * The app has thousands of English strings and no dictionary, so instead of
 * wrapping each one, this walks the rendered DOM when the language is 'ms':
 * every text node (plus placeholder / title tooltips) is swapped for its
 * Malay translation from the shared cache, and a MutationObserver keeps up
 * with whatever React renders next — new tabs, modals, lazy pages. Switching
 * back to 'en' restores every original.
 *
 * Opt an element out with translate="no" (also skips inputs, code, scripts).
 */

const SKIP_SELECTOR = 'script,style,code,pre,textarea,input,select,option,[translate="no"],[contenteditable="true"]'
const ATTRS = ['placeholder', 'title', 'aria-label'] as const

// Text node -> the English it showed before we touched it.
const originals = new WeakMap<Text, string>()
// Element -> original attribute values.
const attrOriginals = new WeakMap<Element, Partial<Record<(typeof ATTRS)[number], string>>>()

let active = false
let observer: MutationObserver | null = null
let rerun: number | null = null

// Only send things that look like words: skips numbers, emoji, "—", URLs, ids.
function worthTranslating(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 4000) return false
  if (!/[A-Za-z]{2,}/.test(t)) return false
  if (/^(https?:\/\/|www\.)/i.test(t)) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return false
  return true
}

function skipped(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return !!el && !!el.closest(SKIP_SELECTOR)
}

function applyText(node: Text, english: string, ms: string) {
  if (!active || !node.isConnected) return
  // React (or the user) changed it since we asked — the observer will retry.
  if (originals.get(node) !== english) return
  const trimmed = english.trim()
  const next = english.replace(trimmed, ms)
  if (node.data !== next) node.data = next
}

function translateText(node: Text) {
  if (skipped(node)) return
  const current = node.data
  const trimmed = current.trim()
  if (!worthTranslating(current)) return
  // Already Malay (from <T> or a previous pass) — nothing to do.
  if (isKnownMs(trimmed)) return
  originals.set(node, current)
  const cached = getCachedMs(trimmed)
  if (cached) { applyText(node, current, cached); return }
  translateToMs(trimmed).then(ms => applyText(node, current, ms))
}

function translateAttrs(el: Element) {
  if (el.closest('script,style,[translate="no"]')) return
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr)
    if (!value || !worthTranslating(value) || isKnownMs(value)) continue
    const saved = attrOriginals.get(el) ?? {}
    saved[attr] = value
    attrOriginals.set(el, saved)
    const apply = (ms: string) => {
      if (!active || !el.isConnected || attrOriginals.get(el)?.[attr] !== value) return
      if (el.getAttribute(attr) === value) el.setAttribute(attr, ms)
    }
    const cached = getCachedMs(value)
    if (cached) apply(cached); else translateToMs(value).then(apply)
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
  const el = root as Element
  if (el.nodeType === Node.ELEMENT_NODE) {
    if (el.matches?.(SKIP_SELECTOR) && !el.matches('input,select')) return
    translateAttrs(el)
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null = tw.nextNode()
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text)
    else translateAttrs(n as Element)
    n = tw.nextNode()
  }
}

function restore() {
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null = tw.nextNode()
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const orig = originals.get(n as Text)
      if (orig !== undefined) { if ((n as Text).data !== orig) (n as Text).data = orig; originals.delete(n as Text) }
    } else {
      const saved = attrOriginals.get(n as Element)
      if (saved) {
        for (const attr of ATTRS) if (saved[attr] !== undefined) (n as Element).setAttribute(attr, saved[attr]!)
        attrOriginals.delete(n as Element)
      }
    }
    n = tw.nextNode()
  }
}

function onMutations(records: MutationRecord[]) {
  for (const r of records) {
    if (r.type === 'characterData') {
      translateText(r.target as Text)
    } else if (r.type === 'childList') {
      r.addedNodes.forEach(walk)
    } else if (r.type === 'attributes' && r.target.nodeType === Node.ELEMENT_NODE) {
      translateAttrs(r.target as Element)
    }
  }
}

export function setAutoTranslate(on: boolean) {
  if (on === active) return
  active = on
  document.documentElement.lang = on ? 'ms' : 'en'
  if (on) {
    walk(document.body)
    observer = new MutationObserver(onMutations)
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: [...ATTRS],
    })
    // Lazy pages resolve after the first walk; one more pass catches text
    // that mounted while translations were still in flight.
    rerun = window.setTimeout(() => { if (active) walk(document.body) }, 1500)
  } else {
    observer?.disconnect(); observer = null
    if (rerun) { clearTimeout(rerun); rerun = null }
    restore()
  }
}

/** Mount once at the app root: keeps the page translator in step with the language. */
export function useAutoTranslate() {
  const lang = useLang()
  useEffect(() => { setAutoTranslate(lang === 'ms') }, [lang])
}
