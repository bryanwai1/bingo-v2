// Admin walkthrough: every card on a board, one at a time, as the player sees it.
// Reuses the sample board's card screen (a sandbox: nothing is saved).
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBingoAuth } from '../hooks/useBingoAuth'
import { fetchBoardTasks, fetchPrizeTasks } from '../lib/boardCards'
import { withCategoryColors, prereqResolver } from '../lib/bingoTileDisplay'
import { effectiveInputs, inputKinds } from '../lib/completionInputs'
import { PrizeStrip } from '../lib/prizeCard/PrizeStrip'
import { prizeVars } from '../lib/prizeCard/shared'
import { SampleTaskDetail } from './BingoDashSample'
import type { BingoSection, BingoTask } from '../types/database'

/** One plain line saying how a team finishes this card. */
function submitMethod(t: BingoTask): string {
  if (t.is_prize) return 'Prize card: claimed when a team reaches the target'
  const parts: string[] = []
  if (t.task_type === 'sign_splice') parts.push('Sign Splice')
  else if (t.task_type === 'breakout_hunt') parts.push('Breakout hunt')
  else if (t.is_contest) parts.push('Versus another team')
  else if (t.is_bundle) parts.push('Bundle of activities')
  const kinds = inputKinds(effectiveInputs(t.task_type, (t as unknown as { completion_inputs?: unknown }).completion_inputs))
  if (kinds.length) parts.push(kinds.map(k => k[0].toUpperCase() + k.slice(1)).join(' + '))
  if (t.require_marshal) parts.push('Marshal code')
  if (!parts.length) parts.push('Tap Complete')
  return parts.join(' · ')
}

export function BingoDashBoardPreview() {
  const { sectionId = '' } = useParams()
  // The page is public (shareable link). Only a signed-in admin sees the
  // editor link and the prize reveal text, which RLS keeps away from anon.
  const { session } = useBingoAuth()
  const isAdmin = !!session
  const [section, setSection] = useState<BingoSection | null>(null)
  const [tasks, setTasks] = useState<BingoTask[]>([])
  const [prize, setPrize] = useState<BingoTask[]>([])
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  // Copies this page's link so it can be pasted straight into a chat.
  const copyLink = async () => {
    const url = window.location.href
    let ok = false
    try { await navigator.clipboard.writeText(url); ok = true } catch {
      // Older browsers / non-secure contexts: fall back to a hidden textarea.
      try {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select()
        ok = document.execCommand('copy'); ta.remove()
      } catch { /* leave ok false */ }
    }
    setCopied(ok ? 'ok' : 'fail')
    window.setTimeout(() => setCopied(null), 2000)
  }
  const [secret, setSecret] = useState<{ id: string; row: Record<string, string> | null } | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      const [{ data: sec }, grid, pr] = await Promise.all([
        supabase.from('bingo_sections').select('*').eq('id', sectionId).maybeSingle(),
        fetchBoardTasks(sectionId), fetchPrizeTasks(sectionId),
      ])
      if (!live) return
      setSection((sec as BingoSection) ?? null)
      setTasks(withCategoryColors(grid).sort((a, b) => a.sort_order - b.sort_order))
      setPrize(pr)
      setLoaded(true)
    })()
    return () => { live = false }
  }, [sectionId])

  const slides = useMemo(() => [...tasks, ...prize], [tasks, prize])
  const cur: BingoTask | undefined = slides[Math.min(idx, Math.max(slides.length - 1, 0))]
  const go = (n: number) => { setIdx(Math.max(0, Math.min(slides.length - 1, n))); setListOpen(false) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'ArrowRight') go(idx + 1)
      if (e.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // A prize slide shows the winner's reveal text, which only an admin can read.
  const curId = cur?.id
  const curIsPrize = !!cur?.is_prize
  useEffect(() => {
    if (!curId || !curIsPrize || !isAdmin) return
    let live = true
    supabase.from('bingo_prize_secrets').select('*').eq('task_id', curId).maybeSingle().then(({ data }) => { if (live) setSecret({ id: curId, row: data as Record<string, string> | null }) })
    return () => { live = false }
  }, [curId, curIsPrize, isAdmin])
  const reveal = secret && secret.id === curId ? secret.row : null

  const resolver = useMemo(() => prereqResolver(tasks), [tasks])

  if (!loaded) return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center">Loading cards…</div>
  if (!cur) return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center">This board has no cards yet.</div>

  const btn = 'px-4 h-11 rounded-lg text-sm font-bold disabled:opacity-30'
  const prev = <button type="button" disabled={idx === 0} onClick={() => go(idx - 1)} className={`${btn} bg-white/10`}>◀ Prev</button>
  const next = <button type="button" disabled={idx >= slides.length - 1} onClick={() => go(idx + 1)} className={`${btn} bg-violet-600`}>Next ▶</button>
  const list = slides.map((t, i) => (
    <button key={t.placement_id ?? t.id} type="button" onClick={() => go(i)}
      className={`w-full text-left px-3 min-h-11 py-2 rounded-lg text-sm ${i === idx ? 'bg-violet-600' : 'hover:bg-white/10'}`}>
      <span className="text-gray-400 mr-2">{i + 1}</span>{t.title}
    </button>
  ))
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col text-white">
      <header className="shrink-0 border-b border-white/10 bg-gray-950 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {isAdmin
          ? <Link to="/bingo-dash/admin" className="text-sm text-teal-400 hover:underline min-h-11 flex items-center">← Board Editor</Link>
          : <span className="text-sm font-bold text-white min-h-11 flex items-center [overflow-wrap:anywhere]">{section?.name ?? 'Board preview'}</span>}
        <button type="button" onClick={() => void copyLink()} aria-live="polite"
          className={`ml-auto px-3 h-11 rounded-lg text-sm font-bold ${copied === 'ok' ? 'bg-teal-600' : copied === 'fail' ? 'bg-red-600' : 'bg-white/10'}`}>
          {copied === 'ok' ? '✓ Link copied' : copied === 'fail' ? 'Copy failed' : '🔗 Share link'}
        </button>
        {/* Phone: the card list opens from the counter. Laptop: the list is always on the left. */}
        <button type="button" onClick={() => setListOpen(o => !o)} className="md:hidden px-3 h-11 rounded-lg bg-white/10 text-sm font-bold">
          {idx + 1} / {slides.length} ▾
        </button>
        <span className="hidden md:inline text-sm text-gray-300">{idx + 1} / {slides.length}</span>
        <span className="hidden md:flex gap-2">{prev}{next}</span>
        <div className="basis-full text-xs text-gray-300 flex flex-wrap gap-x-3">
          <span className="font-bold text-white [overflow-wrap:anywhere]">{cur.title}</span>
          <span>{submitMethod(cur)}</span>
          {!cur.is_prize && <span>{cur.points} pts</span>}
          {cur.prerequisite_task_id && <span>Unlocks after another card</span>}
          <span className="text-gray-500">Preview only, nothing is saved</span>
        </div>
      </header>

      {listOpen && (
        <div className="md:hidden absolute z-[90] top-[100px] inset-x-4 max-h-[60dvh] overflow-y-auto rounded-xl border border-white/10 bg-gray-950 shadow-2xl p-1">{list}</div>
      )}

      <div className="flex-1 min-h-0 flex">
        <aside className="hidden md:block w-72 shrink-0 overflow-y-auto border-r border-white/10 bg-gray-950 p-2">{list}</aside>
      {/* A transformed box makes the card's fixed overlay fit this frame instead of the window. */}
      <div className="flex-1 min-w-0 flex justify-center p-2 md:p-4">
        <div className="relative w-full max-w-[480px] h-full overflow-hidden rounded-2xl border border-white/10 bg-gray-950" style={{ transform: 'translateZ(0)' }}>
          {cur.is_prize ? (
            <div className="h-full overflow-y-auto p-4 space-y-4" style={prizeVars('default')}>
              <p className="text-sm text-gray-300">What teams see on the board:</p>
              <PrizeStrip state={{ kind: 'locked', count: 12, threshold: cur.prize_threshold ?? 20 }} theme="default" busy={false} message={null} title={cur.title} hint={cur.completion_warning} onClaim={() => {}} onOpen={() => {}} />
              <PrizeStrip state={{ kind: 'claimable', canClaim: true }} theme="default" busy={false} message={null} title={cur.title} onClaim={() => {}} onOpen={() => {}} />
              {isAdmin && <div className="rounded-xl border border-white/10 p-3 text-sm space-y-1">
                <p className="font-bold">Reveal text the winner sees</p>
                {reveal ? (
                  <>
                    <p className="[overflow-wrap:anywhere]">{reveal.message || '(no congratulation text yet)'}</p>
                    {reveal.marshal_name && <p>Marshal: {reveal.marshal_name}</p>}
                    {reveal.location_text && <p>Location: {reveal.location_text}</p>}
                    {reveal.maps_url && <a className="text-teal-400 underline [overflow-wrap:anywhere]" href={reveal.maps_url} target="_blank" rel="noopener noreferrer">{reveal.maps_label || 'Open in Google Maps'}</a>}
                  </>
                ) : <p className="text-gray-400">Nothing saved yet.</p>}
              </div>}
            </div>
          ) : (
            <SampleTaskDetail
              key={cur.id}
              task={cur}
              teamName="Sample Team"
              marshalPassword="4321"
              completed={false}
              bonusDefaults={section ?? undefined}
              skipSplash
              chain={{
                prev: tasks.find(t => t.id === resolver(cur)) ?? null,
                locked: false,
                next: tasks.find(t => resolver(t) === cur.id) ?? null,
              }}
              onJump={t => { const i = slides.findIndex(x => x.id === t.id); if (i >= 0) go(i) }}
              onComplete={() => {}}
              onUncomplete={() => {}}
              onClose={() => go(idx + 1)}
            />
          )}
        </div>
      </div>
      </div>

      {/* Phone: Prev / Next within thumb reach, clear of the home indicator. */}
      <nav className="md:hidden shrink-0 grid grid-cols-2 gap-3 border-t border-white/10 bg-gray-950 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {prev}{next}
      </nav>
    </div>
  )
}
