// Resort Tree App Sprint — the worked example teams are shown before they build.
//
// Ported from the Resort Tree Explorer sample in the gamesystem deck: four
// trees with photos, stats and fun facts, plus a "Which Tree Am I?" mini quiz.
// Photos come from public/aitb/reels/tree.
//
// The overlay is portalled to <body>: the AI Team Building card wraps its
// contents in .animate-slide-up, and a transformed ancestor becomes the
// containing block for position:fixed, which would pin this inside the card
// instead of centring it on screen.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Tree = {
  img: string
  emoji: string
  name: string
  my: string
  latin: string
  col: string
  height: string
  age: string
  home: string
  facts: string[]
  wow: string
}

const TREES: Tree[] = [
  {
    img: '/aitb/reels/tree/tree1.jpg', emoji: '🥥', name: 'Coconut Palm',
    my: 'Pokok Kelapa', latin: 'Cocos nucifera', col: '#34d399',
    height: 'Up to 30 m tall', age: 'Lives 60–80 years', home: 'Tropical beaches',
    facts: [
      'Every single part is useful — food, drink, rope, even the roof!',
      'One palm can grow 50–80 coconuts every year.',
      'A coconut can float across the ocean and sprout on a faraway beach.',
    ],
    wow: "A coconut is not a nut — it's one giant seed!",
  },
  {
    img: '/aitb/reels/tree/tree2.jpg', emoji: '🌧️', name: 'Rain Tree',
    my: 'Pokok Pukul Lima', latin: 'Samanea saman', col: '#22d3ee',
    height: 'Up to 25 m tall', age: 'Lives 80–100 years', home: 'Came from South America',
    facts: [
      'Its canopy spreads wider than the tree is tall — a giant green umbrella!',
      "Its leaves fold up before rain and every evening around 5 o'clock.",
      "That's why we call it Pokok Pukul Lima — the 5 o'clock tree!",
    ],
    wow: 'This tree can tell you the time AND the weather!',
  },
  {
    img: '/aitb/reels/tree/tree3.jpg', emoji: '🌸', name: 'Frangipani',
    my: 'Bunga Kemboja', latin: 'Plumeria', col: '#f472b6',
    height: 'Up to 8 m tall', age: 'Lives 100+ years', home: 'Loves sunny gardens',
    facts: [
      'Its sweet flowers welcome guests at resorts and spas.',
      'The flowers smell strongest at night.',
      'Cut one branch, plant it in soil — a whole new tree grows!',
    ],
    wow: 'Its flowers have no nectar — they charm moths with pure perfume!',
  },
  {
    img: '/aitb/reels/tree/tree4.jpg', emoji: '🌳', name: 'Banyan Tree',
    my: 'Pokok Ara', latin: 'Ficus benghalensis', col: '#a78bfa',
    height: 'Up to 20 m tall', age: 'Lives 200+ years', home: "Asia's gentle giant",
    facts: [
      "It grows a 'beard' of hanging roots that turn into brand-new trunks.",
      'One banyan can spread so wide it looks like a little forest.',
      'Birds, bats and squirrels feast on its tiny figs.',
    ],
    wow: 'One famous banyan in India is bigger than a football field!',
  },
]

const TREE_QUIZ: { q: string; a: number }[] = [
  { q: "I fold my leaves at pukul lima — 5 o'clock sharp!", a: 1 },
  { q: 'My giant seed can float across the whole ocean!', a: 0 },
  { q: 'My perfume makes the spa smell amazing!', a: 2 },
  { q: 'My hanging roots grow into brand-new trunks!', a: 3 },
]

type View = { kind: 'home' } | { kind: 'tree'; i: number } | { kind: 'quiz' }

export function SampleTreeApp({ color }: { color: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'home' })
  const [qi, setQi] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const startQuiz = () => { setQi(0); setScore(0); setPicked(null); setView({ kind: 'quiz' }) }

  const answer = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    if (i === TREE_QUIZ[qi].a) setScore(s => s + 1)
    window.setTimeout(() => { setPicked(null); setQi(n => n + 1) }, 900)
  }

  const launch = () => { setView({ kind: 'home' }); setOpen(true) }

  return (
    <div className="mb-5">
      <div className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">
        🌴 Sample tree app — this is what your team will build
      </div>

      <button
        onClick={launch}
        className="glow-card w-full rounded-2xl overflow-hidden text-left active:scale-[0.98]"
        style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${color}55`, ['--tc' as string]: color }}
      >
        <div className="grid grid-cols-4 gap-px">
          {TREES.map(t => (
            <img key={t.img} src={t.img} alt="" loading="lazy"
                 className="w-full aspect-square object-cover block" />
          ))}
        </div>
        <div className="px-3 py-2.5">
          <p className="font-black text-white text-base">🌳 Resort Tree Explorer</p>
          <p className="text-white/50 text-xs">
            4 resort trees · photos · fun facts · mini quiz — a real working example
          </p>
          <span
            className="inline-block mt-2 px-4 py-2 rounded-xl font-black text-sm text-black"
            style={{ background: color }}
          >
            ▶ Open fullscreen
          </span>
        </div>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1220]">
          <div className="min-h-full p-4 pb-10 max-w-3xl mx-auto">
            <Header
              title={view.kind === 'home' ? '🌴 Resort Tree Explorer'
                : view.kind === 'quiz' ? '🎯 Which Tree Am I?'
                : `${TREES[view.i].emoji} ${TREES[view.i].name}`}
              sub={view.kind === 'home' ? 'A sample tree app — 4 trees, fun facts and a mini quiz. Built with AI!'
                : view.kind === 'quiz' ? `Question ${Math.min(qi + 1, TREE_QUIZ.length)} of ${TREE_QUIZ.length} · Score ${score}`
                : `${TREES[view.i].my} · ${TREES[view.i].latin}`}
              showBack={view.kind !== 'home'}
              onBack={() => setView({ kind: 'home' })}
              onClose={() => setOpen(false)}
            />

            {view.kind === 'home' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TREES.map((t, i) => (
                  <button key={t.img} onClick={() => setView({ kind: 'tree', i })}
                          className="glow-card rounded-2xl overflow-hidden text-left active:scale-[0.98]"
                          style={{ border: `2px solid ${t.col}`, background: 'rgba(255,255,255,0.04)', ['--tc' as string]: t.col }}>
                    <img src={t.img} alt="" className="w-full aspect-video object-cover block" />
                    <div className="px-3 py-2">
                      <p className="font-black text-white">{t.emoji} {t.name}</p>
                      <p className="text-white/50 text-xs">{t.my} · <i>{t.latin}</i></p>
                    </div>
                  </button>
                ))}
                <button onClick={startQuiz}
                        className="glow-card rounded-2xl overflow-hidden text-left active:scale-[0.98]"
                        style={{ border: '2px solid #fbbf24', background: 'rgba(255,255,255,0.04)', ['--tc' as string]: '#fbbf24' }}>
                  <div className="w-full aspect-video grid place-items-center text-5xl"
                       style={{ background: 'linear-gradient(135deg,#7c3aed44,#fbbf2433)' }}>❓</div>
                  <div className="px-3 py-2">
                    <p className="font-black text-white">🎯 Which Tree Am I?</p>
                    <p className="text-white/50 text-xs">4-question mini quiz — tap to play!</p>
                  </div>
                </button>
              </div>
            )}

            {view.kind === 'tree' && <TreeDetail i={view.i} onGo={i => setView({ kind: 'tree', i })} />}

            {view.kind === 'quiz' && (
              qi >= TREE_QUIZ.length ? (
                <div className="rounded-2xl p-8 text-center"
                     style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.15)' }}>
                  <div className="text-6xl">{score === 4 ? '🏆' : score >= 2 ? '🌟' : '🌱'}</div>
                  <p className="font-black text-white text-2xl my-3">You got {score} / {TREE_QUIZ.length}!</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={startQuiz}
                            className="px-5 py-3 rounded-2xl font-black text-black bg-white active:scale-95 transition-transform">
                      🔁 Play again
                    </button>
                    <button onClick={() => setView({ kind: 'home' })}
                            className="px-5 py-3 rounded-2xl font-black text-white bg-white/10 border-2 border-white/25 active:scale-95 transition-transform">
                      ← All trees
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-5"
                     style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.15)' }}>
                  <p className="font-black text-white text-lg mb-4">“{TREE_QUIZ[qi].q}”</p>
                  <div className="flex flex-col gap-2">
                    {TREES.map((t, i) => {
                      const right = picked !== null && i === TREE_QUIZ[qi].a
                      const wrong = picked === i && i !== TREE_QUIZ[qi].a
                      return (
                        <button key={t.img} onClick={() => answer(i)} disabled={picked !== null}
                                className="px-4 py-3 rounded-xl font-bold text-white text-left transition-colors"
                                style={{
                                  background: right ? 'rgba(52,211,153,0.25)' : wrong ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.06)',
                                  border: `2px solid ${right ? '#34d399' : wrong ? '#f87171' : 'rgba(255,255,255,0.15)'}`,
                                }}>
                          {t.emoji} {t.name} {right ? '✅' : wrong ? '❌' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Header({ title, sub, showBack, onBack, onClose }: {
  title: string; sub: string; showBack: boolean; onBack: () => void; onClose: () => void
}) {
  return (
    <div className="flex items-start gap-3 mb-4 sticky top-0 z-10 py-3 bg-[#0b1220]">
      <div className="flex-1 min-w-0">
        <h1 className="font-black text-white text-xl leading-tight">{title}</h1>
        <p className="text-white/50 text-xs">{sub}</p>
      </div>
      {showBack && (
        <button onClick={onBack}
                className="px-3 py-2 rounded-xl text-xs font-black text-white bg-white/10 border border-white/25 flex-shrink-0">
          ← All trees
        </button>
      )}
      <button onClick={onClose} aria-label="Close the sample tree app"
              className="px-3 py-2 rounded-xl text-xs font-black text-black bg-white flex-shrink-0">
        ✕ Close
      </button>
    </div>
  )
}

function TreeDetail({ i, onGo }: { i: number; onGo: (i: number) => void }) {
  const t = TREES[i]
  const prev = TREES[(i + 3) % 4]
  const next = TREES[(i + 1) % 4]
  return (
    <div>
      <img src={t.img} alt="" className="w-full max-h-[44vh] object-cover rounded-2xl block" />
      <div className="grid grid-cols-3 gap-2 my-3">
        {[`📏 ${t.height}`, `🎂 ${t.age}`, `🌍 ${t.home}`].map(s => (
          <div key={s} className="rounded-xl px-2 py-2 text-center text-[11px] font-bold text-white/80"
               style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {s}
          </div>
        ))}
      </div>
      <p className="text-xs font-black tracking-widest uppercase text-gray-400 mb-2">Fun facts</p>
      <ul className="flex flex-col gap-2 mb-4">
        {t.facts.map(f => (
          <li key={f} className="rounded-xl px-3 py-2 text-white/85 text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.05)', borderLeft: `4px solid ${t.col}` }}>
            {f}
          </li>
        ))}
      </ul>
      <div className="rounded-2xl px-4 py-3 font-bold text-white"
           style={{ background: `${t.col}22`, border: `2px solid ${t.col}` }}>
        💡 {t.wow}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={() => onGo((i + 3) % 4)}
                className="flex-1 px-3 py-3 rounded-xl text-sm font-black text-white bg-white/10 border border-white/25 truncate">
          ← {prev.emoji} {prev.name}
        </button>
        <button onClick={() => onGo((i + 1) % 4)}
                className="flex-1 px-3 py-3 rounded-xl text-sm font-black text-white bg-white/10 border border-white/25 truncate">
          {next.emoji} {next.name} →
        </button>
      </div>
    </div>
  )
}
