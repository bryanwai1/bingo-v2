import { Link } from 'react-router-dom'
import type { TaskLink } from '../types/database'
import { normalizeUrl } from '../lib/normalizeUrl'
import { T } from './T'

/** A row in the list. Admin-entered links open in a new tab; a chained
 *  card's neighbour (`to`) is an in-app route and stays in the same tab. */
export type LinkItem = Pick<TaskLink, 'id' | 'label' | 'url'> & {
  to?: string
  /** Handled in-page instead of navigating (the demo swaps cards in place). */
  onSelect?: () => void
  icon?: string
  sub?: string
}

interface Props {
  links: LinkItem[]
  hexCode: string
  heading?: string
}

export function TaskLinkButtons({ links, hexCode, heading = 'Links for this task' }: Props) {
  if (links.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-white/70">
        🔗 <T>{heading}</T>
      </p>
      <div className="flex flex-col gap-2.5">
        {links.map((link) => {
          const className = 'group relative rounded-2xl p-[2px] overflow-hidden transition-transform active:scale-[0.98]'
          const style = {
            background: `linear-gradient(145deg, ${hexCode}, ${hexCode}99)`,
            boxShadow: `0 4px 0 ${hexCode}77, 0 6px 16px ${hexCode}44`,
          }
          const inner = (
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
                  {link.icon ?? '🔗'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-gray-900 font-black text-base leading-tight truncate"><T>{link.label}</T></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: hexCode }}>
                    <T>{link.sub ?? 'Click here to open link ↗'}</T>
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
                {link.to || link.onSelect ? <path d="M5 12h14M13 6l6 6-6 6" /> : <><path d="M7 17L17 7" /><path d="M7 7h10v10" /></>}
              </svg>
            </div>
          )
          return link.onSelect ? (
            <button key={link.id} type="button" onClick={link.onSelect} className={`${className} w-full text-left`} style={style}>{inner}</button>
          ) : link.to ? (
            <Link key={link.id} to={link.to} className={className} style={style}>{inner}</Link>
          ) : (
            <a key={link.id} href={normalizeUrl(link.url)} target="_blank" rel="noopener noreferrer" className={className} style={style}>{inner}</a>
          )
        })}
      </div>
    </div>
  )
}
