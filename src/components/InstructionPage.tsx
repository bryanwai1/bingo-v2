import { useState } from 'react'
import type { TaskPage } from '../types/database'
import { T } from './T'

interface InstructionPageProps {
  page: TaskPage
  hexCode: string
}

export function InstructionPage({ page, hexCode }: InstructionPageProps) {
  const pointers = [
    page.pointer_1, page.pointer_2, page.pointer_3,
    page.pointer_4, page.pointer_5, page.pointer_6,
  ]
  const examples = [
    page.example_1, page.example_2, page.example_3,
    page.example_4, page.example_5, page.example_6,
  ]
  const icons = [
    page.icon_1, page.icon_2, page.icon_3,
    page.icon_4, page.icon_5, page.icon_6,
  ]

  // Build list of active pointers with their index
  const activePointers = pointers
    .map((p, i) => ({ text: p, example: examples[i], icon: icons[i], index: i }))
    .filter((p) => p.text)

  const [openExample, setOpenExample] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-5">
      {page.media_url && (
        <div className="rounded-2xl overflow-hidden bg-gray-100 animate-slide-up shadow-lg">
          {page.media_type === 'video' ? (
            <video
              src={page.media_url}
              controls
              className="w-full max-h-[min(46vh,520px)] object-contain"
            />
          ) : (
            <img
              src={page.media_url}
              alt="Instruction"
              className="w-full max-h-[min(46vh,520px)] object-contain"
            />
          )}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {activePointers.map(({ text, example, icon, index }) => (
          <div
            key={index}
            className="animate-bounce-in relative group"
            style={{ animationDelay: `${index * 0.12}s` }}
          >
            {/* Outer glow / shadow layer */}
            <div
              className="absolute inset-0 rounded-[20px] opacity-40 blur-sm translate-y-1"
              style={{ backgroundColor: hexCode }}
            />
            {/* Main card */}
            <div
              className="relative rounded-[20px] p-[3px] overflow-hidden"
              style={{
                background: `linear-gradient(145deg, ${hexCode}, ${hexCode}cc)`,
                boxShadow: `0 6px 0 ${hexCode}88, 0 8px 20px ${hexCode}44`,
              }}
            >
              {/* Inner content with gloss */}
              <div
                className="relative rounded-[17px] px-5 py-4 overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${hexCode}00 0%, ${hexCode}22 100%)`,
                  backgroundColor: 'white',
                }}
              >
                {/* Top shine */}
                <div
                  className="absolute inset-x-0 top-0 h-1/2 rounded-t-[17px] pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)',
                  }}
                />
                <div className="relative flex items-center gap-4">
                  {/* Icon or number badge */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={icon ? {
                      background: `linear-gradient(145deg, ${hexCode}20, ${hexCode}10)`,
                      boxShadow: `0 3px 8px ${hexCode}22`,
                    } : {
                      background: `linear-gradient(135deg, ${hexCode}, ${hexCode}bb)`,
                      boxShadow: `0 3px 8px ${hexCode}66, inset 0 2px 4px rgba(255,255,255,0.3)`,
                    }}
                  >
                    {icon ? (
                      <span className="text-2xl">{icon}</span>
                    ) : (
                      <span className="a-text font-black text-lg">{index + 1}</span>
                    )}
                  </div>
                  {/* Text + button */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 text-lg leading-snug font-bold"><T>{text}</T></p>
                    {example && (
                      <button
                        onClick={() => setOpenExample(openExample === index ? null : index)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all active:scale-95"
                        style={{
                          backgroundColor: openExample === index ? hexCode : `${hexCode}18`,
                          color: openExample === index ? 'white' : hexCode,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <T>{openExample === index ? 'Hide Example' : 'See Example'}</T>
                      </button>
                    )}
                  </div>
                </div>
                {/* Example image expandable */}
                {example && openExample === index && (
                  <div className="relative mt-3 rounded-xl overflow-hidden bg-gray-100 animate-slide-up">
                    <img
                      src={example}
                      alt={`Example for step ${index + 1}`}
                      className="w-full max-h-[min(40vh,440px)] object-contain"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
