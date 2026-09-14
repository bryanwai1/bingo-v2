// The "see a sample" panel.
//
// Renders whatever sample a card has (see src/lib/cardSamples.ts): a photo
// pair, a clip, a tool or storyboard frames that play in turn. Shown open by
// default so the team sees the target before starting; the header folds it
// away once they have.

import { useEffect, useRef, useState } from 'react'
import { sampleFor, type Artefact, type Clip, type Frame, type Mark, type Panel, type Tool } from '../lib/cardSamples'

const FRAME_MS = 2600

/** A person, drawn rather than photographed so it scales anywhere. */
function Figure({ mark }: { mark: Extract<Mark, { kind: 'figure' }>; color: string }) {
  const size = mark.size ?? 1
  const paint = mark.tint ?? 'rgba(255,255,255,0.92)'
  return (
    <div
      className="absolute bottom-[14%] flex flex-col items-center"
      style={{
        left: `${mark.at}%`,
        transform: `translateX(-50%) scale(${size}) ${mark.flip ? 'scaleX(-1)' : ''}`,
        transformOrigin: 'bottom center',
        transition: 'left .6s ease, transform .6s ease',
      }}
    >
      <span className="rounded-full" style={{ width: 13, height: 13, background: paint }} />
      <span className="rounded-md mt-0.5" style={{ width: 20, height: 26, background: paint, opacity: 0.8 }} />
    </div>
  )
}

function MarkView({ mark, color }: { mark: Mark; color: string }) {
  if (mark.kind === 'figure') return <Figure mark={mark} color={color} />

  if (mark.kind === 'prop') {
    return (
      <span
        className={`absolute select-none ${mark.anim ? `sb-${mark.anim}` : ''}`}
        style={{
          left: `${mark.at}%`,
          top: `${mark.y ?? 40}%`,
          fontSize: mark.size ?? 28,
          transform: 'translate(-50%, -50%)',
          lineHeight: 1,
        }}
      >
        {mark.glyph}
      </span>
    )
  }

  if (mark.kind === 'note') {
    return (
      <span
        className="absolute text-white/70 font-bold text-center px-2"
        style={{
          left: `${mark.at ?? 50}%`,
          top: `${mark.y ?? 80}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: 10,
          maxWidth: '90%',
        }}
      >
        {mark.text}
      </span>
    )
  }

  // arrow
  const left = Math.min(mark.from, mark.to)
  const width = Math.abs(mark.to - mark.from)
  return (
    <span
      className="absolute flex items-center gap-1"
      style={{ left: `${left}%`, top: `${mark.y ?? 50}%`, width: `${width}%`, transform: 'translateY(-50%)' }}
    >
      <span className="flex-1 border-t-2 border-dashed" style={{ borderColor: color, opacity: 0.7 }} />
      <span style={{ color, fontSize: 12, lineHeight: 1 }}>▶</span>
      {mark.label && (
        <span className="absolute left-0 -top-4 text-[9px] font-black uppercase tracking-wider whitespace-nowrap"
          style={{ color, opacity: 0.85 }}>
          {mark.label}
        </span>
      )}
    </span>
  )
}

function FrameView({ frame, color, active }: { frame: Frame; color: string; active: boolean }) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          aspectRatio: '4 / 3',
          background: frame.wash ?? 'rgba(0,0,0,0.35)',
          border: `2px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
          boxShadow: active ? `0 0 18px ${color}55` : 'none',
          opacity: active ? 1 : 0.45,
          transition: 'border-color .4s, opacity .4s, box-shadow .4s',
        }}
      >
        {/* Corner ticks, so it reads as a viewfinder rather than a box. */}
        {[['top-1.5 left-1.5', 'border-t-2 border-l-2'], ['top-1.5 right-1.5', 'border-t-2 border-r-2'],
          ['bottom-1.5 left-1.5', 'border-b-2 border-l-2'], ['bottom-1.5 right-1.5', 'border-b-2 border-r-2']]
          .map(([pos, edge]) => (
            <span key={pos} className={`absolute ${pos} ${edge} w-3 h-3`} style={{ borderColor: `${color}88` }} />
          ))}

        {frame.marks.map((mark, i) => <MarkView key={i} mark={mark} color={color} />)}
      </div>
      <p className="text-[10px] font-black uppercase tracking-wider text-center mt-1.5"
        style={{ color: active ? color : 'rgba(255,255,255,0.35)', transition: 'color .4s' }}>
        {frame.caption}
      </p>
    </div>
  )
}

/** One half of a before/after sample: the picture, what it is, and — for a
 *  clip — a play badge, since a still cannot show that it moves. */
function PanelView({ panel, badge, color }: { panel: Panel; badge: string; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="relative rounded-xl overflow-hidden" style={{ border: `2px solid ${color}55` }}>
        <img src={panel.img} alt="" className="w-full block"
          style={{
            aspectRatio: panel.ratio ?? '4 / 3',
            objectFit: panel.fit ?? 'cover',
            background: panel.fit === 'contain' ? '#000' : undefined,
          }} />

        {panel.overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-1">
            {panel.overlay.map((line, i) => (
              <p key={i} className={i === 0
                ? 'text-[10px] font-black uppercase tracking-[0.3em] text-stone-700 mb-1'
                : 'text-[11px] font-bold text-stone-800 leading-snug'}>
                {line}
              </p>
            ))}
          </div>
        )}

        {badge && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
          style={{ background: badge === 'Before' ? 'rgba(0,0,0,0.65)' : color, color: badge === 'Before' ? '#fff' : '#000' }}>
          {badge}
        </span>}

        {panel.video && (
          <>
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-11 h-11 rounded-full bg-black/45 border-2 border-white/80 flex items-center justify-center text-white text-lg leading-none">▶</span>
            </span>
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-black">
              {panel.video}
            </span>
          </>
        )}
      </div>
      <p className="text-white/60 text-[11px] font-bold leading-snug text-center mt-1.5">{panel.caption}</p>
    </div>
  )
}

/** A document the team is meant to produce, laid out from its own data. */
function ArtefactView({ artefact, color }: { artefact: Artefact; color: string }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${color}55`, background: 'rgba(0,0,0,0.25)' }}>
      <div className="px-4 py-2.5 text-center" style={{ background: `${color}22` }}>
        <p className="text-white font-black text-sm">{artefact.title}</p>
      </div>

      <div className="px-4 py-3">
        {artefact.sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-4' : ''}>
            {section.heading && (
              <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color }}>
                {section.heading}
              </p>
            )}
            {section.rows.map((row, ri) => (
              <div key={ri} className="flex items-baseline gap-3 py-1.5 border-b border-white/10 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold leading-tight">{row.left}</p>
                  {row.note && <p className="text-white/40 text-[10px] font-bold leading-snug">{row.note}</p>}
                </div>
                {row.right && <span className="text-white/90 text-xs font-black whitespace-nowrap">{row.right}</span>}
              </div>
            ))}
          </div>
        ))}

        {artefact.total && (
          <div className="flex items-baseline gap-3 mt-3 pt-2.5 border-t-2" style={{ borderColor: `${color}66` }}>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color }}>{artefact.total.left}</p>
              {artefact.total.note && (
                <p className="text-white/40 text-[10px] font-bold">{artefact.total.note}</p>
              )}
            </div>
            <span className="font-black text-sm" style={{ color }}>{artefact.total.right}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** A working page, embedded so it can be used without leaving the card. */
function ToolView({ tool, color }: { tool: Tool; color: string }) {
  return (
    <div>
      <div className="rounded-2xl overflow-hidden bg-black/30" style={{ border: `2px solid ${color}55` }}>
        <iframe
          src={tool.src}
          title={tool.label}
          className="w-full block"
          style={{ height: 430, border: 0 }}
          loading="lazy"
        />
      </div>
      <a
        href={tool.src}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
        style={{ background: color, color: '#000' }}
      >
        {tool.label} ↗
      </a>
    </div>
  )
}

/** A worked clip. Not autoplaying — a team watches it when it chooses to. */
function ClipView({ clip, color }: { clip: Clip; color: string }) {
  return (
    <div>
      <div className="rounded-2xl overflow-hidden bg-black" style={{ border: `2px solid ${color}55` }}>
        <video src={clip.src} controls playsInline preload="metadata" className="w-full block" />
      </div>
      <p className="text-white/60 text-[11px] font-bold leading-snug text-center mt-1.5">{clip.caption}</p>
    </div>
  )
}

export function CardSample({ title, color }: { title: string | null | undefined; color: string }) {
  const sample = sampleFor(title)
  // Open by default: a team should see what "done" looks like before it
  // starts, not discover the sample after guessing. It still folds away.
  const [open, setOpen] = useState(true)
  const [frame, setFrame] = useState(0)
  const timer = useRef<number | null>(null)

  // Only runs while the panel is open, and only for a storyboard — a closed
  // sample, or a still pair, should cost nothing.
  const frames = sample?.frames
  useEffect(() => {
    if (!open || !frames) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || frames.length < 2) return
    timer.current = window.setInterval(() => setFrame(f => (f + 1) % frames.length), FRAME_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [open, frames])

  if (!sample) return null

  return (
    <div className="mb-6 mt-6">
      <button
        onClick={() => { setOpen(v => !v); setFrame(0) }}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border transition-colors"
        style={{ borderColor: `${color}55`, background: `${color}14` }}
      >
        <span className="text-xs font-black uppercase tracking-widest" style={{ color }}>
          🎬 {open ? 'Hide the sample' : 'See a sample first'}
        </span>
        <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-white font-bold text-sm text-center mb-3">{sample.headline}</p>

          {sample.tool && <ToolView tool={sample.tool} color={color} />}
          {sample.artefact && <ArtefactView artefact={sample.artefact} color={color} />}

          <div className="flex gap-3">
            {sample.pair && (
              <>
                {sample.pair.before && (
                  <PanelView panel={sample.pair.before} badge="Before" color={color} />
                )}
                {/* A lone panel carries no badge — "After" means nothing
                    without a before to compare it to. */}
                <PanelView panel={sample.pair.after} badge={sample.pair.before ? 'After' : ''} color={color} />
              </>
            )}
            {frames?.map((f, i) => (
              <FrameView key={i} frame={f} color={color} active={i === frame} />
            ))}
          </div>

          {/* Panels first, clip after: a sample reads before → after. */}
          {sample.clip && <div className="mt-3"><ClipView clip={sample.clip} color={color} /></div>}

          {sample.footnote && (
            <p className="text-white/50 text-xs font-bold text-center mt-3 leading-snug">{sample.footnote}</p>
          )}
        </div>
      )}
    </div>
  )
}
