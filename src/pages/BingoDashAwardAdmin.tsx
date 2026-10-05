import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { BingoSection, BingoTeam } from '../types/database'
import {
  DEFAULT_PRIZE_COUNTS,
  CEREMONY_COLOR,
  SLIDE_LABELS,
  addSlide,
  buildAwardSlides,
  countsFromOrder,
  defaultSlideOrder,
  isPrizeKind,
  isPlaceKind,
  normalizeSlideOrder,
  readSlideText,
  removeSlide,
  resetSlideOrder,
  SLIDE_TEXT_DEFAULTS,
  type SlideText,
  type SlideTextBlock,
  type AwardSlideKind,
  type AwardSlideId,
  type PrizeKind,
} from '../lib/awardSlides'

type DraftConfig = {
  total_points: number
  /** The photo applied to every place slide unless that slide overrides it. */
  image_url: string | null
  /** One slogan, shown on all five place slides. */
  award_slogan: string
  /** Main slide background as #rrggbb; null uses the ceremony purple. */
  main_bg: string | null
  /** Per-place photo overrides keyed by slide id. Beats image_url. */
  slide_photos: Record<string, string>
  slide_order: AwardSlideId[]
  slide_points: Record<string, number>
  holding_title: string
  main_title: string
  main_subtitle: string
  main_tagline: string
  /** Editable text for intro / holding / lineup / scoreboard / closing + logo. */
  slide_text: SlideText
}

// New shows default to five places and no consolation groups. Existing saved
// orders are untouched - they simply contain no fourth:/fifth: ids. The counts
// are shared with the ceremony so an unconfigured board cannot show one
// sequence here and another on the projector.
const INITIAL_ORDER: AwardSlideId[] = defaultSlideOrder(DEFAULT_PRIZE_COUNTS)

const EMPTY_DRAFT: DraftConfig = {
  total_points: 0,
  image_url: null,
  award_slogan: '',
  main_bg: null,
  slide_photos: {},
  slide_order: INITIAL_ORDER,
  slide_points: {},
  holding_title: 'AWARDS',
  main_title: '',
  main_subtitle: '',
  main_tagline: 'AWARDS CEREMONY',
  slide_text: {},
}

export function BingoDashAwardAdmin() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>()
  const navigate = useNavigate()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [configId, setConfigId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftConfig>(EMPTY_DRAFT)
  const [teams, setTeams] = useState<BingoTeam[]>([])
  // Main and place editors are always open; the other slide editors open on demand.
  const [openEditors, setOpenEditors] = useState<Set<string>>(new Set())
  const toggleEditor = (kind: string) => {
    const alwaysOpen = kind === 'main' || kind === 'place'
    if (!alwaysOpen) setOpenEditors(prev => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind); else next.add(kind)
      return next
    })
    if (alwaysOpen || !openEditors.has(kind)) {
      setTimeout(() => document.getElementById(`editor-${kind}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    }
  }
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const awardFileRef = useRef<HTMLInputElement>(null)
  /** Which place slide the file dialog was opened for; null = apply-to-all. */
  const pendingAwardRef = useRef<string | null>(null)
  const [uploadingAward, setUploadingAward] = useState<string | null>(null)

  useEffect(() => {
    if (!sectionSlug) return
    let cancelled = false
    ;(async () => {
      const { data: sec } = await supabase
        .from('bingo_sections')
        .select('*')
        .eq('slug', sectionSlug)
        .maybeSingle()
      if (cancelled) return
      if (!sec) { setLoaded(true); return }
      setSection(sec)
      const { data: cfg } = await supabase
        .from('bingo_award_configs')
        .select('*')
        .eq('section_id', sec.id)
        .maybeSingle()
      if (cancelled) return
      if (cfg) {
        setConfigId(cfg.id)
        const counts = {
          consolation_count: cfg.consolation_count ?? 0,
          consolation_group_count: cfg.consolation_group_count ?? 0,
          fifth_count: 0,
          fourth_count: 0,
          third_count: cfg.third_count ?? 1,
          second_count: cfg.second_count ?? 1,
          first_count: cfg.first_count ?? 1,
        }
        setDraft({
          total_points: cfg.total_points ?? 0,
          image_url: cfg.image_url ?? null,
          // Read defensively: a database without the 20260927 migration has
          // neither column, and a ceremony must still open.
          award_slogan: cfg.award_slogan ?? '',
          main_bg: cfg.main_bg ?? null,
          slide_photos: (cfg.slide_photos && typeof cfg.slide_photos === 'object')
            ? cfg.slide_photos
            : {},
          slide_order: normalizeSlideOrder(cfg.slide_order, counts, readSlideText(cfg.slide_text).v !== 1),
          slide_points: (cfg.slide_points && typeof cfg.slide_points === 'object') ? cfg.slide_points : {},
          holding_title: cfg.holding_title ?? 'AWARDS',
          main_title: cfg.main_title ?? '',
          main_subtitle: cfg.main_subtitle ?? '',
          main_tagline: cfg.main_tagline ?? 'AWARDS CEREMONY',
          slide_text: readSlideText(cfg.slide_text),
        })
      }
      const { data: teamRows } = await supabase
        .from('bingo_teams')
        .select('*')
        .eq('section_id', sec.id)
        .order('name')
      if (cancelled) return
      setTeams(teamRows ?? [])
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [sectionSlug])

  const slides = useMemo(() => buildAwardSlides(draft.slide_order), [draft.slide_order])

  // What was last loaded or saved, to tell whether the draft has changes.
  const [savedJson, setSavedJson] = useState<string | null>(null)
  useEffect(() => {
    if (loaded && savedJson === null) setSavedJson(JSON.stringify(draft))
  }, [loaded, savedJson, draft])
  const dirty = savedJson !== null && JSON.stringify(draft) !== savedJson
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setText = (slide: keyof typeof SLIDE_TEXT_DEFAULTS, field: keyof SlideTextBlock, value: string) => {
    setDraft(d => ({
      ...d,
      slide_text: { ...d.slide_text, [slide]: { ...(d.slide_text[slide] ?? {}), [field]: value } },
    }))
  }
  const setLogo = (logo: string) => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, logo } }))

  const logoFileRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const uploadLogo = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB).`); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `bingo-media/award-photos/${section?.id ?? 'board'}-logo-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { alert(`Upload failed: ${error.message}`); return }
      setLogo(supabase.storage.from('media').getPublicUrl(path).data.publicUrl)
    } finally {
      setUploadingLogo(false)
    }
  }

  const qrFileRef = useRef<HTMLInputElement>(null)
  const [uploadingQr, setUploadingQr] = useState(false)
  const uploadQr = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB).`); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setUploadingQr(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `bingo-media/award-photos/${section?.id ?? 'board'}-qr-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { alert(`Upload failed: ${error.message}`); return }
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      setDraft(d => ({ ...d, slide_text: { ...d.slide_text, eval_qr: url } }))
    } finally {
      setUploadingQr(false)
    }
  }

  const runShow = async () => {
    if (!section) return
    if (dirty && window.confirm('You have unsaved changes. Save them before running the show?')) {
      if (!(await save())) return
    }
    navigate(`/bingo-dash/slides/awards/${section.slug}`)
  }
  const hasMain = draft.slide_order.includes('main')
  const hasIntro = draft.slide_order.includes('intro')
  const hasHolding = draft.slide_order.includes('holding')
  const hasLineup = draft.slide_order.includes('lineup')
  const hasScoreboard = draft.slide_order.includes('scoreboard')
  const hasClosing = draft.slide_order.includes('closing')
  const hasEvaluation = draft.slide_order.includes('evaluation')

  const moveSlide = (from: number, dir: -1 | 1) => {
    const to = from + dir
    if (to < 0 || to >= draft.slide_order.length) return
    const next = [...draft.slide_order]
    ;[next[from], next[to]] = [next[to], next[from]]
    setDraft(d => ({ ...d, slide_order: next }))
  }

  const doAddSlide = (kind: AwardSlideKind) => {
    setDraft(d => ({ ...d, slide_order: addSlide(d.slide_order, kind) }))
  }

  const doRemoveSlide = (id: AwardSlideId) => {
    setDraft(d => {
      const restPoints = { ...d.slide_points }
      const restPhotos = { ...d.slide_photos }
      delete restPoints[id]
      delete restPhotos[id]
      return {
        ...d,
        slide_order: removeSlide(d.slide_order, id),
        slide_points: restPoints,
        slide_photos: restPhotos,
      }
    })
  }

  /**
   * Uploads to the same public `media` bucket as team photos, with the same
   * 5 MB / image-only guards. Unlike the team flow this writes ONLY to draft
   * state - an award photo is not a team's photo, and saving is the Save
   * button's job.
   *
   * `slideId` null targets the shared apply-to-all photo.
   */
  const uploadAwardPhoto = async (slideId: string | null, file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB).`); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setUploadingAward(slideId ?? 'all')
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `bingo-media/award-photos/${section?.id ?? 'board'}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { alert(`Upload failed: ${error.message}`); return }
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      setDraft(d => slideId
        ? { ...d, slide_photos: { ...d.slide_photos, [slideId]: url } }
        : { ...d, image_url: url })
    } finally {
      setUploadingAward(null)
    }
  }

  const setPlacePhoto = (slideId: string, url: string | null) => {
    setDraft(d => {
      if (!url) {
        const rest = { ...d.slide_photos }
        delete rest[slideId]
        return { ...d, slide_photos: rest }
      }
      return { ...d, slide_photos: { ...d.slide_photos, [slideId]: url } }
    })
  }

  const pickAwardPhoto = (slideId: string | null) => {
    pendingAwardRef.current = slideId
    awardFileRef.current?.click()
  }

  const save = async (): Promise<boolean> => {
    if (!section) return false
    setSaving(true)
    try {
      const counts = countsFromOrder(draft.slide_order)
      // Drop overrides for slides that no longer exist, so removing and
      // re-adding a place cannot resurrect an old photo against a reused id.
      const liveIds = new Set(draft.slide_order)
      const photos = Object.fromEntries(
        Object.entries(draft.slide_photos).filter(([id]) => liveIds.has(id)),
      )
      const payload = {
        section_id: section.id,
        total_points: draft.total_points,
        image_url: draft.image_url,
        award_slogan: draft.award_slogan.trim() || null,
        main_bg: draft.main_bg,
        slide_photos: photos,
        consolation_count: counts.consolation_count,
        consolation_group_count: counts.consolation_group_count,
        third_count: counts.third_count,
        second_count: counts.second_count,
        first_count: counts.first_count,
        slide_order: draft.slide_order,
        slide_points: draft.slide_points,
        holding_title: draft.holding_title.trim() || null,
        main_title: draft.main_title.trim() || null,
        main_subtitle: draft.main_subtitle.trim() || null,
        main_tagline: draft.main_tagline.trim() || null,
        // v:1 tells loaders this editor saved it, so a removed scoreboard or
        // closing slide stays removed instead of being added back.
        slide_text: { ...draft.slide_text, v: 1 },
      }
      if (configId) {
        const { error } = await supabase.from('bingo_award_configs').update(payload).eq('id', configId)
        if (error) { alert(`Save failed: ${error.message}`); return false }
      } else {
        const { data, error } = await supabase
          .from('bingo_award_configs')
          .insert(payload)
          .select()
          .single()
        if (error || !data) { alert(`Save failed: ${error?.message ?? 'unknown'}`); return false }
        setConfigId(data.id)
      }
      setSavedAt(Date.now())
      setSavedJson(JSON.stringify(draft))
      return true
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Loading…</div>
  }
  if (!section) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-black">Compartment not found.</p>
        <a href="/bingo-dash/slides/awards" className="text-amber-400 hover:text-amber-300 underline">Pick another</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4">
        <button
          onClick={() => navigate('/bingo-dash/slides/awards')}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest font-semibold whitespace-nowrap"
        >
          ← Awards Home
        </button>
        <div className="order-last sm:order-none w-full sm:w-auto sm:flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-black truncate">🎖 Award Slides · {section.name}</h1>
          <p className="hidden sm:block text-xs text-gray-500 mt-0.5">Edit every slide's text, photos and order. A running show updates when you save.</p>
        </div>
        <button
          onClick={() => { void runShow() }}
          className="ml-auto sm:ml-0 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          ▶ Run show
        </button>
        <button
          onClick={() => { void save() }}
          disabled={saving}
          className="whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-black disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving ? (
          <span className="text-xs text-amber-600 font-semibold">Unsaved changes</span>
        ) : savedAt && !saving && (
          <span className="text-xs text-emerald-600 font-semibold">Saved ✓</span>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-3 sm:p-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: holding slide content */}
        <div className="space-y-6">
          <section id="editor-main" className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-4">Main slide (opener)</h2>
            <p className="text-xs text-gray-400 mb-4">The opening title card. Pick a colour, or Reset for the ceremony purple.</p>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Title (top line, smaller)</label>
            <input
              type="text"
              value={draft.main_title}
              onChange={e => setDraft(d => ({ ...d, main_title: e.target.value }))}
              placeholder="Optional — leave blank for none"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Big title (bottom line, larger)</label>
            <input
              type="text"
              value={draft.slide_text.main_title_big ?? ''}
              onChange={e => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, main_title_big: e.target.value } }))}
              placeholder="e.g. SUCCESS — leave blank for the plain single title"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Subtitle</label>
            <input
              type="text"
              value={draft.main_subtitle}
              onChange={e => setDraft(d => ({ ...d, main_subtitle: e.target.value }))}
              placeholder="Optional — leave blank for none"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Background colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={draft.main_bg ?? CEREMONY_COLOR}
                onChange={e => setDraft(d => ({ ...d, main_bg: e.target.value }))}
                className="w-12 h-10 rounded-lg border border-gray-300 bg-white p-1 cursor-pointer"
                aria-label="Main slide background colour"
              />
              <span className="font-mono text-sm text-gray-600">
                {draft.main_bg ?? 'Ceremony purple (default)'}
              </span>
              {draft.main_bg && (
                <button
                  onClick={() => setDraft(d => ({ ...d, main_bg: null }))}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Reset
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              The slide darkens this colour for the bottom of its gradient. The
              closing slide has its own colour below.
            </p>

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Tagline</label>
            <input
              type="text"
              value={draft.main_tagline}
              onChange={e => setDraft(d => ({ ...d, main_tagline: e.target.value }))}
              placeholder="AWARDS CEREMONY"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-4">Logo (main slide)</label>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void uploadLogo(file)
              }}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-14 h-14 rounded-full p-2 overflow-hidden flex items-center justify-center shrink-0" style={{ background: draft.slide_text.logo_bg || '#ffffff' }}>
                {draft.slide_text.logo && draft.slide_text.logo !== 'none' && draft.slide_text.logo !== 'default'
                  ? <img src={draft.slide_text.logo} alt="" className="max-w-full max-h-full object-contain" />
                  : <span className="text-gray-400 text-[10px] font-bold">no logo</span>}
              </div>
              {draft.slide_text.logo && draft.slide_text.logo !== 'none' && draft.slide_text.logo !== 'default' && (
                <button
                  onClick={() => setLogo('none')}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Remove logo
                </button>
              )}
              <button
                onClick={() => logoFileRef.current?.click()}
                disabled={uploadingLogo}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {uploadingLogo ? 'Uploading…' : draft.slide_text.logo && draft.slide_text.logo !== 'none' && draft.slide_text.logo !== 'default' ? 'Replace logo' : 'Upload logo'}
              </button>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
                Logo background
                <input
                  type="color"
                  value={draft.slide_text.logo_bg || '#ffffff'}
                  onChange={e => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, logo_bg: e.target.value } }))}
                  className="w-9 h-9 rounded border border-gray-300 cursor-pointer"
                />
              </label>
              {draft.slide_text.logo_bg && draft.slide_text.logo_bg.toLowerCase() !== '#ffffff' && (
                <button
                  onClick={() => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, logo_bg: undefined } }))}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Reset to white
                </button>
              )}
            </div>
          </section>

          <section id="editor-place" className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-1">Place slides (1st – 5th)</h2>
            <input
              ref={awardFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                const slideId = pendingAwardRef.current
                pendingAwardRef.current = null
                e.target.value = ''
                if (file) void uploadAwardPhoto(slideId, file)
              }}
            />
            <p className="text-sm text-gray-600 mb-4">
              The slogan below is shared by all five place slides. Any place can
              have its own photo in the slide list.
            </p>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Slogan</label>
            <input
              type="text"
              value={draft.award_slogan}
              onChange={e => setDraft(d => ({ ...d, award_slogan: e.target.value }))}
              placeholder="e.g. CHAMPIONS OF THE DAY"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Leave blank to hide the slogan strip.
            </p>

            <p className="text-[11px] text-gray-400 mt-3">
              Each place shows its own uploaded photo (set in the slide list), else
              the winning group's team photo, else the logo from the main slide.
            </p>
          </section>

          {openEditors.has('intro') && (
          <SlideTextCard
            title="Intro slide"
            hint="Animated ceremony opener."
            fields={[['pretitle', 'Small line above'], ['title', 'Title'], ['subtitle', 'Line below']]}
            slide="intro" draft={draft} onChange={setText}
          />
          )}
          {openEditors.has('holding') && (
          <SlideTextCard
            title="Holding slide"
            hint="The reveal shown before the winners."
            fields={[['pretitle', 'Small line above'], ['title', 'Title'], ['hint', 'Hint at the bottom']]}
            slide="holding" draft={draft} onChange={setText}
          />
          )}
          {openEditors.has('lineup') && (
          <SlideTextCard
            title="Lineup slide"
            hint="Every team with its photo."
            fields={[['pretitle', 'Small line above'], ['title', 'Title']]}
            slide="lineup" draft={draft} onChange={setText}
          />
          )}
          {openEditors.has('scoreboard') && (
          <SlideTextCard
            title="Full scoreboard slide"
            hint="Every team ranked. It always fits all teams on screen."
            fields={[['pretitle', 'Small line above'], ['title', 'Title']]}
            slide="scoreboard" draft={draft} onChange={setText}
          />
          )}
          {openEditors.has('evaluation') && (
          <SlideTextCard
            title="Evaluation slide"
            hint="Slogan on top (from the place slides), QR code, your name and today's date. Background follows the main slide."
            fields={[['title', 'Name']]}
            slide="evaluation" draft={draft} onChange={setText}
          >
            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">QR code</label>
            <input
              ref={qrFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void uploadQr(file)
              }}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-20 h-20 rounded-lg bg-white border border-gray-200 p-1 flex items-center justify-center shrink-0">
                {draft.slide_text.eval_qr
                  ? <img src={draft.slide_text.eval_qr} alt="" className="max-w-full max-h-full object-contain" />
                  : <span className="text-gray-400 text-[10px] font-bold">no QR</span>}
              </div>
              {draft.slide_text.eval_qr && (
                <button
                  onClick={() => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, eval_qr: undefined } }))}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Remove QR
                </button>
              )}
              <button
                onClick={() => qrFileRef.current?.click()}
                disabled={uploadingQr}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {uploadingQr ? 'Uploading…' : draft.slide_text.eval_qr ? 'Replace QR' : 'Upload QR'}
              </button>
            </div>
          </SlideTextCard>
          )}
          {openEditors.has('closing') && (
          <SlideTextCard
            title="Closing slide"
            hint={draft.main_title ? `The end card. A blank title uses the main slide's (“${draft.main_title}”).` : 'The end card. A blank title uses the main slide’s title.'}
            fields={[['pretitle', 'Small line above'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['tagline', 'Tagline']]}
            slide="closing" draft={draft} onChange={setText}
            titleFallback={draft.main_title}
          >
            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Background colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={draft.slide_text.closing?.bg || CEREMONY_COLOR}
                onChange={e => setText('closing', 'bg', e.target.value)}
                className="w-12 h-10 rounded-lg border border-gray-300 bg-white p-1 cursor-pointer"
                aria-label="Closing slide background colour"
              />
              <span className="font-mono text-sm text-gray-600">
                {draft.slide_text.closing?.bg || 'Ceremony purple (default)'}
              </span>
              {draft.slide_text.closing?.bg && (
                <button
                  onClick={() => setText('closing', 'bg', '')}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Reset
                </button>
              )}
            </div>
          </SlideTextCard>
          )}

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-1">Total after bonus</h2>
            <p className="text-xs text-gray-400 mb-3">
              On: places and scores include the facilitator's bonus points. Off: places and scores use base points only (no bonus).
            </p>
            <button
              onClick={() => setDraft(d => ({ ...d, slide_text: { ...d.slide_text, include_bonus: d.slide_text.include_bonus === false } }))}
              className={`flex items-center gap-3 px-4 py-2 rounded-xl border font-bold text-sm transition-colors ${draft.slide_text.include_bonus === false ? 'bg-gray-100 border-gray-300 text-gray-600' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}
              role="switch"
              aria-checked={draft.slide_text.include_bonus !== false}
            >
              <span className={`w-10 h-6 rounded-full relative transition-colors ${draft.slide_text.include_bonus === false ? 'bg-gray-300' : 'bg-emerald-500'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${draft.slide_text.include_bonus === false ? 'left-0.5' : 'left-[1.1rem]'}`} />
              </span>
              {draft.slide_text.include_bonus === false ? 'OFF — base points only' : 'ON — total after bonus'}
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-2">Ceremony summary</h2>
            <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
              <li>{slides.length} slide{slides.length === 1 ? '' : 's'} total</li>
              <li>{slides.filter(s => isPrizeKind(s.kind)).length} prize reveal{slides.filter(s => isPrizeKind(s.kind)).length === 1 ? '' : 's'}</li>
              <li>{teams.length} team{teams.length === 1 ? '' : 's'} on this board</li>
            </ul>
          </section>
        </div>

        {/* Right: sequence + add */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-black text-gray-900">Slide sequence</h2>
              <button
                onClick={() => setDraft(d => ({ ...d, slide_order: resetSlideOrder(d.slide_order) }))}
                className="text-xs text-gray-500 hover:text-gray-900 underline"
                title="Put slides back in default order (main → intro → holding → lineup → prizes → scoreboard → closing)"
              >
                Reset order
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Reorder with arrows · Remove with ✕</p>

            <ol className="space-y-2">
              {slides.map((s, i) => {
                const { label, emoji, accent } = SLIDE_LABELS[s.kind]
                const subtitle = s.kind === 'main'
                  ? [draft.main_title, draft.main_tagline].filter(Boolean).join(' · ') || 'No title'
                  : s.kind === 'intro'
                    ? draft.slide_text.intro?.title || SLIDE_TEXT_DEFAULTS.intro.title
                    : s.kind === 'holding'
                      ? `“${draft.slide_text.holding?.title || SLIDE_TEXT_DEFAULTS.holding.title}” reveal`
                      : s.kind === 'lineup'
                        ? `${teams.length} team${teams.length === 1 ? '' : 's'} · grid w/ photos`
                        : s.kind === 'scoreboard'
                          ? `${teams.length} team${teams.length === 1 ? '' : 's'} ranked · final totals`
                          : s.kind === 'evaluation'
                            ? `QR · ${draft.slide_text.evaluation?.title || SLIDE_TEXT_DEFAULTS.evaluation.title}`
                          : s.kind === 'closing'
                            ? [draft.slide_text.closing?.title || draft.main_title, draft.slide_text.closing?.pretitle || SLIDE_TEXT_DEFAULTS.closing.pretitle].filter(Boolean).join(' · ')
                            : s.kind === 'consolation_group'
                              ? `Team ranks ${(s.teamRanks ?? []).map(r => `#${r}`).join(', ')} · ${label}${s.rank && s.rank > 1 ? ` #${s.rank}` : ''}`
                              : `Team rank #${(s.teamRanks ?? [])[0] ?? '?'} · ${label}${s.rank && s.rank > 1 ? ` #${s.rank}` : ''}`
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5"
                  >
                    <span
                      className="w-8 h-8 flex items-center justify-center rounded-lg font-black text-base shrink-0"
                      style={{ background: accent, color: '#111' }}
                    >
                      {emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">
                        {label}{s.rank != null && s.rank > 1 ? ` · #${s.rank}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>
                    </div>

                    {isPlaceKind(s.kind) && (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                          {draft.slide_photos[s.id]
                            ? <img src={draft.slide_photos[s.id]} alt="" className="w-full h-full object-cover" />
                            : <span className="text-gray-300 text-sm">👥</span>}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex gap-1">
                            <button
                              onClick={() => pickAwardPhoto(s.id)}
                              disabled={uploadingAward === s.id}
                              className="px-1.5 py-0.5 rounded border border-gray-200 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                              title="Upload a photo for this place only"
                            >
                              {uploadingAward === s.id ? '…' : 'Upload'}
                            </button>
                            {draft.slide_photos[s.id] && (
                              <button
                                onClick={() => setPlacePhoto(s.id, null)}
                                className="px-1.5 py-0.5 rounded border border-gray-200 bg-white text-[10px] font-bold text-gray-600 hover:bg-red-50 hover:text-red-600"
                                title="Fall back to the team photo, then the logo"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <span className="text-[9px] text-gray-400">
                            {draft.slide_photos[s.id] ? 'own photo' : 'team photo / logo'}
                          </span>
                        </div>
                      </div>
                    )}

                    <span className="text-[10px] font-mono text-gray-400 w-5 text-right">{i + 1}</span>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => moveSlide(i, -1)}
                        disabled={i === 0}
                        className="w-7 h-5 rounded bg-white border border-gray-200 hover:bg-gray-100 text-xs disabled:opacity-30 flex items-center justify-center"
                        title="Move up"
                      >▲</button>
                      <button
                        onClick={() => moveSlide(i, 1)}
                        disabled={i === slides.length - 1}
                        className="w-7 h-5 rounded bg-white border border-gray-200 hover:bg-gray-100 text-xs disabled:opacity-30 flex items-center justify-center"
                        title="Move down"
                      >▼</button>
                    </div>
                    <button
                      onClick={() => doRemoveSlide(s.id)}
                      className="w-7 h-7 rounded bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0"
                      title="Remove this slide"
                    >✕</button>
                  </li>
                )
              })}
              {slides.length === 0 && (
                <li className="text-sm text-gray-400 italic text-center py-6">
                  No slides yet. Use the buttons below to add one.
                </li>
              )}
            </ol>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-1">Add a slide</h2>
            <p className="text-xs text-gray-400 mb-4">New slides go to their natural place (openers first, prizes before the scoreboard, closing last). Reorder with the arrows above.</p>

            <div className="grid grid-cols-2 gap-2">
              <AddButton
                disabled={hasMain}
                emoji="🎬"
                label="Main"
                sublabel={hasMain ? 'already added' : 'title card opener'}
                accent="#fca5a5"
                onClick={() => doAddSlide('main')}
                onEdit={() => toggleEditor('main')}
                editing={openEditors.has('main')}
              />
              <AddButton
                disabled={hasIntro}
                emoji="✨"
                label="Intro"
                sublabel={hasIntro ? 'already added' : 'animated opener'}
                accent="#fde68a"
                onClick={() => doAddSlide('intro')}
                onEdit={() => toggleEditor('intro')}
                editing={openEditors.has('intro')}
              />
              <AddButton
                disabled={hasHolding}
                emoji="⏳"
                label="Holding"
                sublabel={hasHolding ? 'already added' : 'AWARDS title slide'}
                accent="#fcd34d"
                onClick={() => doAddSlide('holding')}
                onEdit={() => toggleEditor('holding')}
                editing={openEditors.has('holding')}
              />
              <AddButton
                disabled={hasLineup}
                emoji="👥"
                label="Lineup"
                sublabel={hasLineup ? 'already added' : 'all teams + photos'}
                accent="#a5f3fc"
                onClick={() => doAddSlide('lineup')}
                onEdit={() => toggleEditor('lineup')}
                editing={openEditors.has('lineup')}
              />
              <AddButton
                disabled={hasScoreboard}
                emoji="📊"
                label="Scoreboard"
                sublabel={hasScoreboard ? 'already added' : 'all teams ranked'}
                accent="#86efac"
                onClick={() => doAddSlide('scoreboard')}
                onEdit={() => toggleEditor('scoreboard')}
                editing={openEditors.has('scoreboard')}
              />
              <AddButton
                disabled={hasClosing}
                emoji="🎬"
                label="Closing"
                sublabel={hasClosing ? 'already added' : 'thank-you end card'}
                accent="#fca5a5"
                onClick={() => doAddSlide('closing')}
                onEdit={() => toggleEditor('closing')}
                editing={openEditors.has('closing')}
              />
              <AddButton
                disabled={hasEvaluation}
                emoji="📝"
                label="Evaluation"
                sublabel={hasEvaluation ? 'already added' : 'QR code + name + date'}
                accent="#bae6fd"
                onClick={() => doAddSlide('evaluation')}
                onEdit={() => toggleEditor('evaluation')}
                editing={openEditors.has('evaluation')}
              />
              {(['first', 'second', 'third', 'fourth', 'fifth', 'consolation_group', 'consolation'] as PrizeKind[]).map(kind => {
                const sublabel = kind === 'consolation_group'
                  ? `${slides.filter(s => s.kind === kind).length} group${slides.filter(s => s.kind === kind).length === 1 ? '' : 's'} · 3 teams each`
                  : `Currently ${slides.filter(s => s.kind === kind).length}`
                return (
                  <AddButton
                    key={kind}
                    emoji={SLIDE_LABELS[kind].emoji}
                    label={`+ ${SLIDE_LABELS[kind].label}`}
                    sublabel={sublabel}
                    accent={SLIDE_LABELS[kind].accent}
                    onClick={() => doAddSlide(kind)}
                    onEdit={() => toggleEditor('place')}
                  />
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function AddButton({
  disabled, emoji, label, sublabel, accent, onClick, onEdit, editing,
}: {
  disabled?: boolean
  emoji: string
  label: string
  sublabel: string
  accent: string
  onClick: () => void
  onEdit?: () => void
  editing?: boolean
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center gap-3 p-3 pr-12 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-amber-300 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:border-gray-200"
      >
        <span
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
          style={{ background: accent }}
        >
          {emoji}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{label}</p>
          <p className="text-[11px] text-gray-500 truncate">{sublabel}</p>
        </div>
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          title={editing ? 'Hide editor' : 'Edit this slide'}
          aria-label={`Edit ${label}`}
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg border flex items-center justify-center text-sm transition-colors ${editing ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-300'}`}
        >
          ✏️
        </button>
      )}
    </div>
  )
}

function SlideTextCard({
  title, hint, fields, slide, draft, onChange, titleFallback, children,
}: {
  title: string
  hint: string
  fields: [keyof SlideTextBlock, string][]
  slide: keyof typeof SLIDE_TEXT_DEFAULTS
  draft: DraftConfig
  onChange: (slide: keyof typeof SLIDE_TEXT_DEFAULTS, field: keyof SlideTextBlock, value: string) => void
  /** Placeholder for a title whose default is another slide's text. */
  titleFallback?: string
  children?: React.ReactNode
}) {
  const defaults = SLIDE_TEXT_DEFAULTS[slide] as SlideTextBlock
  return (
    <section id={`editor-${slide}`} className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="font-black text-gray-900 mb-1">{title}</h2>
      <p className="text-xs text-gray-400 mb-3">{hint} Leave a field empty to use the text shown in grey.</p>
      {fields.map(([field, label], i) => (
        <div key={field} className={i > 0 ? 'mt-3' : ''}>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
          <input
            type="text"
            value={draft.slide_text[slide]?.[field] ?? ''}
            onChange={e => onChange(slide, field, e.target.value)}
            placeholder={defaults[field] ?? (field === 'title' ? titleFallback : '') ?? ''}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>
      ))}
      {children}
    </section>
  )
}
