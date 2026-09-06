import type { TaskLink } from '../types/database'
import { normalizeUrl } from '../lib/normalizeUrl'
import { T } from './T'

interface Props {
  links: TaskLink[]
  hexCode: string
  heading?: string
}

export function TaskLinkButtons({ links, hexCode, heading = 'Links for this task' }: Props) {
  if (links.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-black uppercase tracking-[0.15em] a-text-2">
        🔗 <T>{heading}</T>
      </p>
      <div className="flex flex-col gap-2.5">
        {links.map((link) => (
          <a
            key={link.id}
            href={normalizeUrl(link.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-2xl p-[2px] overflow-hidden transition-transform active:scale-[0.98]"
            style={{
              background: `linear-gradient(145deg, ${hexCode}, ${hexCode}99)`,
              boxShadow: `0 4px 0 ${hexCode}77, 0 6px 16px ${hexCode}44`,
            }}
          >
            <div
              className="relative rounded-[14px] px-4 py-3 flex items-center justify-between gap-3"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.88) 100%)`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                  style={{
                    background: `linear-gradient(135deg, ${hexCode}, ${hexCode}bb)`,
                    boxShadow: `0 2px 6px ${hexCode}55`,
                  }}
                >
                  🔗
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-gray-900 font-black text-base leading-tight truncate"><T>{link.label}</T></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: hexCode }}>
                    <T>Click here to open link ↗</T>
                  </span>
                </div>
              </div>
              <svg
                className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke={hexCode}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
