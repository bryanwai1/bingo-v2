import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CubeBoard } from '../components/CubeBoard'
import { normaliseFaceCount, activeFaces, TILES_PER_FACE } from '../lib/cubeFaces'
import { fetchBoardTasks } from '../lib/boardCards'
import type { BingoSection, BingoTask, BingoScan } from '../types/database'

// The cube on its own page.
//
// It lived on the projector for about an hour and looked wrong there: clipped
// against the rankings, competing with the thing the room actually reads. On
// its own screen with room to breathe it works — a second display, or
// something to leave up during a break.

export function BingoDashCube() {
  const { slug } = useParams<{ slug: string }>()
  const [section, setSection] = useState<BingoSection | null>(null)
  const [tasks, setTasks] = useState<BingoTask[]>([])
  const [scans, setScans] = useState<BingoScan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const q = supabase.from('bingo_sections').select('*')
      const { data: sec } = slug
        ? await q.eq('slug', slug).maybeSingle()
        : await (async () => {
            const { data: st } = await supabase.from('bingo_settings')
              .select('active_section_id').eq('id', 'main').maybeSingle()
            return st?.active_section_id
              ? supabase.from('bingo_sections').select('*').eq('id', st.active_section_id).maybeSingle()
              : { data: null }
          })()
      if (!sec) { setLoading(false); return }
      setSection(sec)
      setTasks(await fetchBoardTasks(sec.id))
      const { data: sc } = await supabase.from('bingo_scans')
        .select('*, bingo_teams!inner(section_id)')
        .eq('bingo_teams.section_id', sec.id).eq('completed', true)
      setScans((sc ?? []) as BingoScan[])
      setLoading(false)
    }
    void load()
    const ch = supabase.channel('cube-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_scans' }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [slug])

  if (loading) {
    return <div className="min-h-screen bg-black grid place-items-center text-white/40">Loading…</div>
  }
  if (!section) {
    return <div className="min-h-screen bg-black grid place-items-center text-white/40">No board found.</div>
  }

  const faceCount = normaliseFaceCount(section.face_count)
  const faces = activeFaces(faceCount).map(f =>
    Array.from({ length: TILES_PER_FACE }, (_, i) =>
      tasks.find(t => t.sort_order === f * TILES_PER_FACE + i) ?? null))
  const completedSlots = new Set<number>(
    tasks.filter(t => scans.some(sc => sc.task_id === t.id)).map(t => t.sort_order))
  const totalTiles = tasks.length

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Deep-space backdrop — layered radial gradients rather than an image,
          so it scales to any projector without a large download. */}
      <div className="absolute inset-0" style={{
        background:
          'radial-gradient(ellipse 80% 60% at 20% 30%, rgba(56,189,248,0.14), transparent 60%),' +
          'radial-gradient(ellipse 70% 50% at 80% 70%, rgba(168,85,247,0.16), transparent 60%),' +
          'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(13,148,136,0.12), transparent 60%),' +
          '#03060a',
      }} />
      <div className="absolute inset-0 opacity-50" style={{
        backgroundImage:
          'radial-gradient(1px 1px at 12% 22%, #fff, transparent),' +
          'radial-gradient(1px 1px at 68% 14%, #fff, transparent),' +
          'radial-gradient(1px 1px at 34% 78%, #fff, transparent),' +
          'radial-gradient(1px 1px at 88% 62%, #fff, transparent),' +
          'radial-gradient(1px 1px at 52% 44%, #fff, transparent),' +
          'radial-gradient(1px 1px at 24% 56%, #fff, transparent),' +
          'radial-gradient(1px 1px at 76% 88%, #fff, transparent),' +
          'radial-gradient(1px 1px at 44% 8%, #fff, transparent)',
        backgroundSize: '520px 520px',
      }} />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <div className="text-center mb-8">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-teal-300/70">Bingo Dash</p>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mt-1">{section.name}</h1>
          <p className="text-white/40 mt-2">
            {completedSlots.size} of {totalTiles} tiles claimed
            {faceCount > 1 && ` · ${faceCount} faces`}
          </p>
        </div>

        <CubeBoard faces={faces} completedSlots={completedSlots} size={360} />

        {/* Fullscreen is what makes this usable on a second screen during a
            break — the browser chrome is the only thing spoiling it. */}
        <button
          onClick={() => {
            const el = document.documentElement
            if (document.fullscreenElement) void document.exitFullscreen()
            else void el.requestFullscreen?.()
          }}
          className="mt-8 px-5 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95"
          style={{ background: 'rgba(45,212,191,0.14)', border: '1.5px solid rgba(45,212,191,0.4)', color: '#5eead4' }}
        >
          ⛶ Fullscreen for the projector
        </button>

        <p className="absolute bottom-6 text-[11px] tracking-widest uppercase text-white/25">
          Powered by <span className="text-teal-300/60 font-bold">Pixels and Purpose Enterprise</span>
        </p>
      </div>
    </div>
  )
}
