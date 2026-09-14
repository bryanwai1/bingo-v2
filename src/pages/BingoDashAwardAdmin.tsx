import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { BingoSection, BingoTeam } from '../types/database'
import {
  SLIDE_LABELS,
  addSlide,
  buildAwardSlides,
  countsFromOrder,
  defaultSlideOrder,
  isPrizeKind,
  normalizeSlideOrder,
  removeSlide,
  type AwardSlideKind,
  type AwardSlideId,
  type PrizeKind,
} from '../lib/awardSlides'

type DraftConfig = {
  total_points: number
  image_url: string | null
  slide_order: AwardSlideId[]
  slide_points: Record<string, number>
  holding_title: string
  main_title: string
  main_subtitle: string
  main_tagline: string
}

const INITIAL_ORDER: AwardSlideId[] = defaultSlideOrder({
  consolation_count: 0,
  consolation_group_count: 2,
  third_count: 1,
  second_count: 1,
  first_count: 1,
})

const EMPTY_DRAFT: DraftConfig = {
  total_points: 0,
  image_url: null,
  slide_order: INITIAL_ORDER,
  slide_points: {},
  holding_title: 'AWARDS',
  main_title: 'HSBC KL EXPLORACE 2026',
  main_subtitle: 'HSBC KL Explorace 2026',
  main_tagline: 'AWARDS CEREMONY',
}

export function BingoDashAwardAdmin() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>()
  const navigate = useNavigate()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [configId, setConfigId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftConfig>(EMPTY_DRAFT)
  const [teams, setTeams] = useState<BingoTeam[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingTeamId, setUploadingTeamId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const teamFileRef = useRef<HTMLInputElement>(null)
  const pendingTeamRef = useRef<string | null>(null)

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
          third_count: cfg.third_count ?? 1,
          second_count: cfg.second_count ?? 1,
          first_count: cfg.first_count ?? 1,
        }
        setDraft({
          total_points: cfg.total_points ?? 0,
          image_url: cfg.image_url ?? null,
          slide_order: normalizeSlideOrder(cfg.slide_order, counts),
          slide_points: (cfg.slide_points && typeof cfg.slide_points === 'object') ? cfg.slide_points : {},
          holding_title: cfg.holding_title ?? 'AWARDS',
          main_title: cfg.main_title ?? 'HSBC KL EXPLORACE 2026',
          main_subtitle: cfg.main_subtitle ?? 'HSBC KL Explorace 2026',
          main_tagline: cfg.main_tagline ?? 'AWARDS CEREMONY',
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
  const hasMain = draft.slide_order.includes('main')
  const hasIntro = draft.slide_order.includes('intro')
  const hasHolding = draft.slide_order.includes('holding')
  const hasLineup = draft.slide_order.includes('lineup')
  const hasScoreboard = draft.slide_order.includes('scoreboard')
  const hasClosing = draft.slide_order.includes('closing')

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
      const { [id]: _, ...restPoints } = d.slide_points
      return {
        ...d,
        slide_order: removeSlide(d.slide_order, id),
        slide_points: restPoints,
      }
    })
  }

  const setSlidePoints = (id: AwardSlideId, value: number) => {
    const v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
    setDraft(d => ({ ...d, slide_points: { ...d.slide_points, [id]: v } }))
  }

  const uploadTeamPhoto = async (teamId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert(`${file.name} too large (max 5 MB).`); return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return }
    setUploadingTeamId(teamId)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `${teamId}-${Date.now()}.${ext}`
      const path = `bingo-media/team-photos/${fileName}`
      const { error } = await supabase.storage.from('media').upload(path, file)
      if (error) { alert(`Upload failed: ${error.message}`); return }
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      const photo_url = urlData.publicUrl
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, photo_url } : t))
      const { error: updateErr } = await supabase.from('bingo_teams').update({ photo_url }).eq('id', teamId)
      if (updateErr) alert(`Save failed: ${updateErr.message}`)
    } finally {
      setUploadingTeamId(null)
    }
  }

  const removeTeamPhoto = async (teamId: string) => {
    if (!confirm('Remove this group\u2019s photo?')) return
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, photo_url: null } : t))
    const { error } = await supabase.from('bingo_teams').update({ photo_url: null }).eq('id', teamId)
    if (error) alert(`Failed: ${error.message}`)
  }

  const deleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Delete team "${teamName}" and all their scan records? This cannot be undone.`)) return
    const prev = teams
    setTeams(p => p.filter(t => t.id !== teamId))
    const { error } = await supabase.from('bingo_teams').delete().eq('id', teamId)
    if (error) {
      alert(`Failed to delete: ${error.message}`)
      setTeams(prev)
    }
  }

  const pickTeamPhoto = (teamId: string) => {
    pendingTeamRef.current = teamId
    teamFileRef.current?.click()
  }

  const save = async () => {
    if (!section) return
    setSaving(true)
    try {
      const counts = countsFromOrder(draft.slide_order)
      const payload = {
        section_id: section.id,
        total_points: draft.total_points,
        image_url: draft.image_url,
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
      }
      if (configId) {
        const { error } = await supabase.from('bingo_award_configs').update(payload).eq('id', configId)
        if (error) { alert(`Save failed: ${error.message}`); return }
      } else {
        const { data, error } = await supabase
          .from('bingo_award_configs')
          .insert(payload)
          .select()
          .single()
        if (error || !data) { alert(`Save failed: ${error?.message ?? 'unknown'}`); return }
        setConfigId(data.id)
      }
      setSavedAt(Date.now())
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
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/bingo-dash/slides/awards')}
          className="text-xs text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest font-semibold"
        >
          ← Awards Home
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black truncate">🎖 Award Slides · {section.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5">Configure ceremony content, prize points, and slide order</p>
        </div>
        <button
          onClick={() => navigate(`/bingo-dash/slides/awards/${section.slug}`)}
          className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          ▶ Run show
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-black disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-emerald-600 font-semibold">Saved ✓</span>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: holding slide content */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-4">Main slide (HSBC opener)</h2>
            <p className="text-xs text-gray-400 mb-4">Red-themed branded slide. Mirrors the leader's brief opener.</p>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={draft.main_title}
              onChange={e => setDraft(d => ({ ...d, main_title: e.target.value }))}
              placeholder="HSBC KL EXPLORACE 2026"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Subtitle</label>
            <input
              type="text"
              value={draft.main_subtitle}
              onChange={e => setDraft(d => ({ ...d, main_subtitle: e.target.value }))}
              placeholder="HSBC KL Explorace 2026"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <label className="block text-sm font-semibold text-gray-700 mb-1 mt-3">Tagline</label>
            <input
              type="text"
              value={draft.main_tagline}
              onChange={e => setDraft(d => ({ ...d, main_tagline: e.target.value }))}
              placeholder="AWARDS CEREMONY"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-2">Holding slide</h2>
            <p className="text-sm text-gray-600">
              Shows a fixed “Presenting Awards” reveal between the opener and the winners. No configuration needed.
            </p>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-black text-gray-900">Team photos</h2>
              <span className="text-[11px] text-gray-400">{teams.filter(t => t.photo_url).length} / {teams.length} set</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">Shown on the prize reveal slides · max 5 MB each</p>

            <input
              ref={teamFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                const id = pendingTeamRef.current
                pendingTeamRef.current = null
                if (f && id) uploadTeamPhoto(id, f)
                if (teamFileRef.current) teamFileRef.current.value = ''
              }}
            />

            {teams.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-4">No teams in this compartment yet.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {teams.map(t => {
                  const isUploading = uploadingTeamId === t.id
                  return (
                    <li key={t.id} className="relative bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col items-center gap-2">
                      <button
                        onClick={() => deleteTeam(t.id, t.name)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-xs font-bold text-gray-400 flex items-center justify-center shadow-sm"
                        title={`Delete team "${t.name}"`}
                      >✕</button>
                      <button
                        onClick={() => pickTeamPhoto(t.id)}
                        disabled={isUploading}
                        className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 border-2 border-white shadow-sm hover:ring-2 hover:ring-amber-400 transition-all disabled:opacity-50"
                        title={t.photo_url ? 'Replace photo' : 'Upload photo'}
                      >
                        {t.photo_url ? (
                          <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">👥</div>
                        )}
                      </button>
                      <p className="text-xs font-bold text-center w-full truncate" title={t.name}>{t.name}</p>
                      <div className="flex gap-1 text-[10px] font-bold uppercase tracking-wider">
                        <button
                          onClick={() => pickTeamPhoto(t.id)}
                          disabled={isUploading}
                          className="text-amber-600 hover:text-amber-700 disabled:opacity-50"
                        >
                          {isUploading ? 'Uploading…' : (t.photo_url ? 'Replace' : 'Upload')}
                        </button>
                        {t.photo_url && !isUploading && (
                          <>
                            <span className="text-gray-300">·</span>
                            <button
                              onClick={() => removeTeamPhoto(t.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-black text-gray-900 mb-2">Ceremony summary</h2>
            <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
              <li>{slides.length} slide{slides.length === 1 ? '' : 's'} total</li>
              <li>{slides.filter(s => isPrizeKind(s.kind)).length} prize reveal{slides.filter(s => isPrizeKind(s.kind)).length === 1 ? '' : 's'}</li>
              <li>Prize pool (sum of per-slide pts): <span className="font-mono font-bold">
                {slides.filter(s => isPrizeKind(s.kind)).reduce((sum, s) => sum + (draft.slide_points[s.id] ?? 0), 0)}
              </span></li>
            </ul>
          </section>
        </div>

        {/* Right: sequence + add */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-black text-gray-900">Slide sequence</h2>
              <button
                onClick={() => setDraft(d => ({ ...d, slide_order: defaultSlideOrder(countsFromOrder(d.slide_order)) }))}
                className="text-xs text-gray-500 hover:text-gray-900 underline"
                title="Put slides back in default order (intro → holding → consolation → 3rd → 2nd → 1st)"
              >
                Reset order
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Reorder with arrows · Remove with ✕ · Type prize pts per slide</p>

            <ol className="space-y-2">
              {slides.map((s, i) => {
                const { label, emoji, accent } = SLIDE_LABELS[s.kind]
                const pts = draft.slide_points[s.id] ?? 0
                const subtitle = s.kind === 'main'
                  ? `${draft.main_title || 'HSBC KL EXPLORACE 2026'} · ${draft.main_tagline || 'AWARDS CEREMONY'}`
                  : s.kind === 'intro'
                    ? '🏆 Award Ceremony title reveal'
                    : s.kind === 'holding'
                      ? '“Presenting Awards” reveal'
                      : s.kind === 'lineup'
                        ? `${teams.length} team${teams.length === 1 ? '' : 's'} · grid w/ photos`
                        : s.kind === 'scoreboard'
                          ? `${teams.length} team${teams.length === 1 ? '' : 's'} ranked · final totals`
                          : s.kind === 'closing'
                            ? `${draft.main_title || 'HSBC KL EXPLORACE 2026'} · Thank You`
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

                    {isPrizeKind(s.kind) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          value={pts}
                          onChange={e => setSlidePoints(s.id, parseFloat(e.target.value) || 0)}
                          onClick={e => (e.target as HTMLInputElement).select()}
                          className="w-20 px-2 py-1.5 rounded-lg border border-gray-300 text-center font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          title="Points this team receives"
                        />
                        <span className="text-[10px] font-bold text-gray-400 uppercase">pts</span>
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
            <p className="text-xs text-gray-400 mb-4">New slides are appended to the end. Reorder with the arrows above.</p>

            <div className="grid grid-cols-2 gap-2">
              <AddButton
                disabled={hasMain}
                emoji="🎬"
                label="Main"
                sublabel={hasMain ? 'already added' : 'HSBC-branded opener'}
                accent="#fca5a5"
                onClick={() => doAddSlide('main')}
              />
              <AddButton
                disabled={hasIntro}
                emoji="✨"
                label="Intro"
                sublabel={hasIntro ? 'already added' : 'animated opener'}
                accent="#fde68a"
                onClick={() => doAddSlide('intro')}
              />
              <AddButton
                disabled={hasHolding}
                emoji="⏳"
                label="Holding"
                sublabel={hasHolding ? 'already added' : 'AWARDS title slide'}
                accent="#fcd34d"
                onClick={() => doAddSlide('holding')}
              />
              <AddButton
                disabled={hasLineup}
                emoji="👥"
                label="Lineup"
                sublabel={hasLineup ? 'already added' : 'all teams + photos'}
                accent="#a5f3fc"
                onClick={() => doAddSlide('lineup')}
              />
              <AddButton
                disabled={hasScoreboard}
                emoji="📊"
                label="Scoreboard"
                sublabel={hasScoreboard ? 'already added' : 'all teams ranked'}
                accent="#86efac"
                onClick={() => doAddSlide('scoreboard')}
              />
              <AddButton
                disabled={hasClosing}
                emoji="🎬"
                label="Closing"
                sublabel={hasClosing ? 'already added' : 'HSBC red end card'}
                accent="#fca5a5"
                onClick={() => doAddSlide('closing')}
              />
              {(['first', 'second', 'third', 'consolation_group', 'consolation'] as PrizeKind[]).map(kind => {
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
  disabled, emoji, label, sublabel, accent, onClick,
}: {
  disabled?: boolean
  emoji: string
  label: string
  sublabel: string
  accent: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-amber-300 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:border-gray-200"
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
  )
}
