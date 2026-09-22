const CACHE_KEY = 'fr_translate_ms_v1'
const cache = new Map<string, string>()
// Every Malay string we have ever produced, so the page translator can tell
// "already translated" text from English and leave it alone.
const outputs = new Set<string>()
const inflight = new Map<string, Promise<string>>()
// MyMemory rejects queries over 500 bytes; longer text is sent sentence by
// sentence in chunks under this size.
const MAX_CHUNK = 450
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>
      for (const k in obj) { cache.set(k, obj[k]); outputs.add(obj[k]) }
    }
  } catch { /* ignore */ }
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const obj: Record<string, string> = {}
      cache.forEach((v, k) => { obj[k] = v })
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj))
    } catch { /* ignore */ }
  }, 500)
}

export function getCachedMs(text: string): string | null {
  load()
  return cache.get(text) ?? null
}

/** True when `text` is something this module already translated into Malay. */
export function isKnownMs(text: string): boolean {
  load()
  return outputs.has(text)
}

function remember(source: string, translated: string) {
  cache.set(source, translated)
  outputs.add(translated)
  scheduleSave()
}

async function fetchMs(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ms`
  const resp = await fetch(url)
  const data = await resp.json()
  const out = data?.responseData?.translatedText as string | undefined
  // MyMemory reports quota / errors as a 4xx status inside the JSON body with
  // the message in translatedText — never show that to the user.
  if (!out || (typeof data?.responseStatus === 'number' && data.responseStatus >= 400)) return text
  // Short words sometimes come back as an unrelated sentence from the public
  // translation memory (e.g. "Default" -> a whole phrase). Malay runs a little
  // longer than English, but not several times longer — keep the source then.
  if (out.length > text.length * 3 + 12) return text
  return out
}

// Split long text into sentence-ish chunks under the API limit.
function chunk(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text]
  const parts = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const part of parts) {
    if (cur && (cur + part).length > MAX_CHUNK) { out.push(cur); cur = '' }
    if (part.length > MAX_CHUNK) {
      for (let i = 0; i < part.length; i += MAX_CHUNK) out.push(part.slice(i, i + MAX_CHUNK))
    } else {
      cur += part
    }
  }
  if (cur) out.push(cur)
  return out
}

export function translateToMs(text: string): Promise<string> {
  if (!text || !text.trim()) return Promise.resolve(text)
  load()
  const cached = cache.get(text)
  if (cached) return Promise.resolve(cached)
  const existing = inflight.get(text)
  if (existing) return existing
  const promise = (async () => {
    try {
      const pieces = chunk(text)
      const translated = pieces.length === 1
        ? await fetchMs(text)
        : (await Promise.all(pieces.map(p => p.trim() ? fetchMs(p) : Promise.resolve(p)))).join('')
      remember(text, translated)
      return translated
    } catch {
      return text
    } finally {
      inflight.delete(text)
    }
  })()
  inflight.set(text, promise)
  return promise
}
