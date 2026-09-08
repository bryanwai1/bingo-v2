// Breakout Hunt — the playable card.
//
// Ten puzzles, each pointing at an object somewhere in the venue. Only the
// decoding half can be checked by the app, so that is what gates progress:
// solve the puzzle, and only then does the camera open to photograph the real
// object. The photo is evidence, never auto-verified.
//
// Demo boards have no real team row, so `demo` runs the whole thing in memory.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CameraCapture } from './CameraCapture'
import { downscale, sha256 } from '../lib/signSplice'
import {
  isCorrectGuess,
  type BreakoutProgress, type BreakoutPuzzle,
} from '../lib/breakoutHunt'

type Phase = 'loading' | 'board' | 'puzzle' | 'camera' | 'saving' | 'done'

export function BreakoutHuntCard({ teamId, taskId, demo = false, onComplete }: {
  teamId: string
  taskId: string
  demo?: boolean
  /** Called once, when every puzzle has been approved, so the host page can
   *  cross the tile off the board. */
  onComplete?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [puzzles, setPuzzles] = useState<BreakoutPuzzle[]>([])
  const [progress, setProgress] = useState<Record<string, BreakoutProgress>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [guess, setGuess] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const demoHashes = useRef<Set<string>>(new Set())
  const completedFired = useRef(false)

  const open = puzzles.find(p => p.id === openId) ?? null
  const prog = openId ? progress[openId] : undefined
  const solvedCount = puzzles.filter(p => progress[p.id]?.photo_url).length
  const allShot = puzzles.length > 0 && solvedCount === puzzles.length
  const statuses = puzzles.map(p => progress[p.id]?.review_status ?? 'draft')
  const awaitingReview = statuses.some(x => x === 'pending')
  const rejected = puzzles.filter(p => progress[p.id]?.review_status === 'rejected')
  const allApproved = puzzles.length > 0 && statuses.every(x => x === 'approved')

  // ── load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: pz } = await supabase.from('bingo_breakout_puzzles')
      .select('id, position, image_url, prompt, answer, aliases, hint')
      .eq('task_id', taskId).order('position')
    const list = (pz ?? []) as BreakoutPuzzle[]
    setPuzzles(list)

    if (!demo) {
      const { data: pr } = await supabase.from('bingo_breakout_progress')
        .select('puzzle_id, attempts, hint_used, solved_at, photo_url, photo_at, submitted_at, review_status')
        .eq('team_id', teamId).eq('task_id', taskId)
      const map: Record<string, BreakoutProgress> = {}
      for (const r of (pr ?? []) as BreakoutProgress[]) map[r.puzzle_id] = r
      setProgress(map)
        const approved = Object.values(map).filter(r => r.review_status === 'approved').length
      setPhase(list.length > 0 && approved === list.length ? 'done' : 'board')
      return
    }
    setPhase('board')
  }, [teamId, taskId, demo])

  useEffect(() => { void load() }, [load])

  // The marshal approves later, so completion is detected on whatever render
  // first sees a full set of approvals — not at the moment the photos are sent.
  useEffect(() => {
    if (allApproved && !completedFired.current) {
      completedFired.current = true
      onComplete?.()
    }
  }, [allApproved, onComplete])

  const patchProgress = async (puzzleId: string, patch: Partial<BreakoutProgress>) => {
    setProgress(prev => ({
      ...prev,
      [puzzleId]: { ...(prev[puzzleId] ?? { puzzle_id: puzzleId, attempts: 0, hint_used: false, solved_at: null, photo_url: null, photo_at: null }), ...patch },
    }))
    if (demo) return
    await supabase.from('bingo_breakout_progress')
      .upsert({ team_id: teamId, task_id: taskId, puzzle_id: puzzleId, ...patch }, { onConflict: 'team_id,puzzle_id' })
  }

  // ── guess ──────────────────────────────────────────────────────────────────
  const submitGuess = async () => {
    if (!open) return
    const attempts = (prog?.attempts ?? 0) + 1
    if (!isCorrectGuess(guess, open)) {
      setError(`Not quite — that's attempt ${attempts}. Look again.`)
      setNotice(null)
      await patchProgress(open.id, { attempts })
      return
    }
    setError(null)
    setNotice(`Correct — it's ${open.answer}. Now go and find it!`)
    setGuess('')
    await patchProgress(open.id, { attempts, solved_at: new Date().toISOString() })
  }

  const revealHint = async () => {
    if (!open) return
    setNotice(open.hint ?? 'No hint for this one — ask your AI assistant to help decode it.')
    setError(null)
    await patchProgress(open.id, { hint_used: true })
  }

  // ── photo ──────────────────────────────────────────────────────────────────
  const handlePhoto = async (blob: Blob) => {
    if (!open) return
    setPhase('saving')
    setError(null)
    try {
      setBusy('Checking the photo…')
      const small = await downscale(blob)
      const hash = await sha256(small)

      // One photo cannot stand in for two puzzles.
      const reused = demo
        ? demoHashes.current.has(hash)
        : ((await supabase.from('bingo_breakout_progress')
            .select('id').eq('team_id', teamId).eq('task_id', taskId).eq('photo_hash', hash).limit(1)).data ?? []).length > 0
      if (reused) {
        setError('That photo has already been used for another puzzle. Take a new one.')
        setPhase('puzzle')
        return
      }

      let url: string
      if (demo) {
        demoHashes.current.add(hash)
        url = URL.createObjectURL(small)
      } else {
        setBusy('Saving your photo…')
        const path = `bingo-media/breakout/${teamId}-${taskId}-${open.id}-${Date.now()}.jpg`
        const up = await supabase.storage.from('media').upload(path, small, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      }

      await patchProgress(open.id, { photo_url: url, photo_hash: hash, photo_at: new Date().toISOString() } as Partial<BreakoutProgress>)
      setNotice(`${open.answer} found! ${solvedCount + 1} of ${puzzles.length} done.`)
      setOpenId(null)
      setPhase('board')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that photo.')
      setPhase('puzzle')
    } finally {
      setBusy(null)
    }
  }

  // Send all ten to the admin photo page as one batch, each labelled with the
  // puzzle it answers so the reviewer is not guessing what they are looking at.
  const submitForReview = async () => {
    if (!allShot) return
    setBusy('Sending your 10 photos for review…')
    setError(null)
    try {
      if (!demo) {
        const rows = puzzles.map(p => ({
          team_id: teamId,
          task_id: taskId,
          photo_url: progress[p.id]!.photo_url,
          status: 'pending',
          label: `${p.position + 1}. ${p.answer}`,
          puzzle_id: p.id,
        }))
        const { error: insErr } = await supabase.from('bingo_photo_submissions').insert(rows)
        if (insErr) throw insErr
        const stamp = new Date().toISOString()
        await Promise.all(puzzles.map(p =>
          supabase.from('bingo_breakout_progress')
            .update({ submitted_at: stamp, review_status: 'pending' })
            .eq('team_id', teamId).eq('puzzle_id', p.id)))
      }
      setProgress(prev => {
        const next = { ...prev }
        for (const p of puzzles) next[p.id] = { ...next[p.id], review_status: 'pending', submitted_at: new Date().toISOString() }
        return next
      })
      setNotice('Sent! A marshal is checking your 10 photos.')
      setPhase('board')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your photos.')
    } finally {
      setBusy(null)
    }
  }

  // A rejected photo is cleared so the team can retake just that one.
  const retake = async (puzzleId: string) => {
    if (!demo) {
      await supabase.from('bingo_breakout_progress')
        .update({ photo_url: null, photo_hash: null, photo_at: null, review_status: 'draft', submitted_at: null })
        .eq('team_id', teamId).eq('puzzle_id', puzzleId)
    }
    setProgress(prev => ({ ...prev, [puzzleId]: { ...prev[puzzleId], photo_url: null, photo_at: null, review_status: 'draft' } }))
    setOpenId(puzzleId)
    setPhase('camera')
  }

  // ── render ─────────────────────────────────────────────────────────────────
  const banner = (
    <>
      {error && (
        <div className="mb-3 p-3 rounded-2xl bg-red-400/15 border border-red-400/40 text-center">
          <p className="text-red-200 font-bold text-sm">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="mb-3 p-3 rounded-2xl bg-emerald-400/15 border border-emerald-400/40 text-center">
          <p className="text-emerald-100 font-bold text-sm">{notice}</p>
        </div>
      )}
      {busy && (
        <div className="mb-3 p-3 rounded-2xl bg-white/10 border border-white/25 text-center">
          <p className="text-white font-bold text-sm">{busy}</p>
        </div>
      )}
    </>
  )

  if (phase === 'loading') return <p className="text-white/60 text-center py-6 font-bold">Loading puzzles…</p>

  if (puzzles.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-white/10 border-2 border-white/25 text-center">
        <p className="text-white font-black mb-1">No puzzles set up yet</p>
        <p className="text-white/50 text-sm">Ask your facilitator to add them on this card.</p>
      </div>
    )
  }

  if (phase === 'camera' && open) {
    return (
      <div>
        <p className="text-white font-black text-lg text-center mb-1">Photograph the {open.answer}</p>
        <p className="text-white/50 text-sm text-center mb-4">
          At least one team member must be in the shot.
        </p>
        {banner}
        <CameraCapture
          hint={`${open.answer} — with a team member in frame`}
          onCapture={blob => void handlePhoto(blob)}
          onCancel={() => setPhase('puzzle')}
        />
      </div>
    )
  }

  if ((phase === 'puzzle' || phase === 'saving') && open) {
    const solved = !!prog?.solved_at
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => { setOpenId(null); setPhase('board'); setError(null); setNotice(null); setGuess('') }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/25 text-white text-xs font-black">
            ← All puzzles
          </button>
          <span className="text-white/50 text-xs font-bold">Puzzle {open.position + 1} of {puzzles.length}</span>
        </div>
        {banner}

        {open.image_url && (
          <img src={open.image_url} alt={`Puzzle ${open.position + 1}`}
               className="w-full rounded-2xl border-2 border-white/25 mb-3 max-h-[46vh] object-contain bg-black/30" />
        )}
        {open.prompt && (
          <p className="text-white font-black text-2xl text-center tracking-wide my-4">{open.prompt}</p>
        )}

        {solved ? (
          <button onClick={() => { setError(null); setPhase('camera') }} disabled={!!busy}
                  className="w-full py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40">
            📷 Photograph the {open.answer}
          </button>
        ) : (
          <>
            <input
              value={guess}
              onChange={e => setGuess(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submitGuess() }}
              placeholder="What is it?"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 border-2 border-white/30 text-white text-center text-lg font-black placeholder:text-white/30 focus:outline-none focus:border-white/60"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => void revealHint()}
                      className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/30 text-white font-black">
                💡 Hint
              </button>
              <button onClick={() => void submitGuess()} disabled={!guess.trim()}
                      className="flex-[2] py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40">
                Check answer
              </button>
            </div>
            {(prog?.attempts ?? 0) > 0 && (
              <p className="text-white/40 text-xs text-center mt-2 font-bold">
                {prog?.attempts} attempt{prog?.attempts === 1 ? '' : 's'} so far
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="text-center">
        <p className="text-white font-black text-xl mb-1">🏆 All {puzzles.length} found!</p>
        <p className="text-white/60 text-sm mb-4">Every puzzle decoded and photographed.</p>
        {banner}
        <div className="grid grid-cols-2 gap-2">
          {puzzles.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden border border-white/25 bg-white/5">
              {progress[p.id]?.photo_url && (
                <img src={progress[p.id].photo_url!} alt={p.answer} className="w-full aspect-video object-cover" />
              )}
              <p className="text-white text-xs font-black px-2 py-1.5">{p.answer}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // board
  return (
    <div>
      <p className="text-white font-black text-lg text-center mb-1">🔍 Breakout Hunt</p>
      <p className="text-white/50 text-sm text-center mb-4">
        {allApproved ? 'All 10 approved by the marshal.'
          : rejected.length > 0 ? `${rejected.length} photo${rejected.length === 1 ? '' : 's'} sent back — retake ${rejected.length === 1 ? 'it' : 'them'}.`
          : awaitingReview ? 'Sent for review — waiting for the marshal.'
          : `${solvedCount} of ${puzzles.length} found · decode a puzzle, then photograph the real thing`}
      </p>
      {banner}

      {/* Send the whole set at once: the marshal reviews 10 photos as one job. */}
      {allShot && !awaitingReview && !allApproved && rejected.length === 0 && (
        <button onClick={() => void submitForReview()} disabled={!!busy}
                className="w-full mb-4 py-4 rounded-2xl bg-white text-black font-black text-lg disabled:opacity-40">
          Send all {puzzles.length} for review
        </button>
      )}
      {rejected.length > 0 && (
        <div className="mb-4 p-3 rounded-2xl" style={{ background: 'rgba(248,113,113,0.15)', border: '2px solid rgba(248,113,113,0.45)' }}>
          <p className="text-red-100 font-bold text-sm mb-2">
            The marshal sent {rejected.length === 1 ? 'one photo' : `${rejected.length} photos`} back. Retake and send again.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rejected.map(p => (
              <button key={p.id} onClick={() => void retake(p.id)}
                      className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-black">
                Retake {p.answer}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {puzzles.map(p => {
          const st = progress[p.id]
          const done = !!st?.photo_url
          const solved = !!st?.solved_at
          return (
            <button
              key={p.id}
              onClick={() => { setOpenId(p.id); setGuess(''); setError(null); setNotice(null); setPhase('puzzle') }}
              className="glow-card rounded-xl overflow-hidden text-left active:scale-[0.98]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `2px solid ${
                  st?.review_status === 'rejected' ? '#f87171'
                  : st?.review_status === 'approved' ? '#34d399'
                  : done ? '#22d3ee' : solved ? '#fbbf24' : 'rgba(255,255,255,0.25)'}`,
                ['--tc' as string]:
                  st?.review_status === 'rejected' ? '#f87171'
                  : st?.review_status === 'approved' ? '#34d399'
                  : done ? '#22d3ee' : solved ? '#fbbf24' : '#ffffff',
              }}
            >
              {done && st?.photo_url ? (
                <img src={st.photo_url} alt={p.answer} className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square grid place-items-center text-3xl">
                  {solved ? '📷' : '❓'}
                </div>
              )}
              <p className="text-white text-[11px] font-black px-1.5 py-1 truncate">
                {st?.review_status === 'approved' ? `✓ ${p.answer}`
                  : st?.review_status === 'rejected' ? `↺ ${p.answer}`
                  : st?.review_status === 'pending' ? `⏳ ${p.answer}`
                  : done ? p.answer
                  : solved ? 'Go find it'
                  : `Puzzle ${p.position + 1}`}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
