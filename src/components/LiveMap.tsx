import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { BingoTeam } from '../types/database'
import { groupInfo, type Loc } from '../hooks/liveLocation'

// OpenFreeMap: free street tiles, no key or account.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const STALE_MS = 60_000
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}
const boundsOf = (locs: Loc[]) => locs.reduce((b, l) => b.extend([l.lng, l.lat]), new maplibregl.LngLatBounds())

interface Mark { m: maplibregl.Marker; dot: HTMLElement; tag: HTMLElement; el: HTMLElement }

export function LiveMap({ locs, teams, isAdmin = false, className = '', title }: { locs: Map<string, Loc>; teams: BingoTeam[]; isAdmin?: boolean; className?: string; title?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marks = useRef(new Map<string, Mark>())
  const touched = useRef(false) // once the viewer pans or zooms, stop re-framing for new arrivals
  const [now, setNow] = useState(() => Date.now())
  const [sel, setSel] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [focus, setFocus] = useState<string | null>(null) // group picked in the legend: others fade
  const [pulse, setPulse] = useState<string | null>(null) // group whose dots blink for a few seconds
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const info = useMemo(() => groupInfo(teams), [teams])

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current!, style: STYLE, center: [101.7, 3.1], zoom: 5 })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('click', () => { setSel(null); setFollow(false) })
    m.on('dragstart', () => { touched.current = true })
    m.on('zoomstart', e => { if (e.originalEvent) touched.current = true })
    map.current = m
    const tick = setInterval(() => setNow(Date.now()), 5000)
    const placed = marks.current
    return () => { clearInterval(tick); m.remove(); map.current = null; placed.clear(); touched.current = false }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    let added = false
    for (const l of locs.values()) {
      const g = info.get(l.team_id)
      if (!g) continue
      let e = marks.current.get(l.key)
      if (!e) {
        const el = document.createElement('div')
        el.className = 'flex items-center gap-1 cursor-pointer'
        const dot = document.createElement('i')
        dot.className = 'block w-3.5 h-3.5 rounded-full border-2 border-white shadow'
        const tag = document.createElement('span')
        tag.className = 'text-[11px] font-bold bg-white text-gray-900 rounded-md px-1.5 py-px whitespace-nowrap border border-gray-300'
        el.append(dot, tag)
        el.onclick = ev => { ev.stopPropagation(); setSel(l.key) }
        e = { m: new maplibregl.Marker({ element: el, anchor: 'left', offset: [-7, 0] }).setLngLat([l.lng, l.lat]).addTo(m), dot, tag, el }
        marks.current.set(l.key, e)
        added = true
      }
      e.m.setLngLat([l.lng, l.lat])
      e.dot.style.background = g.color
      e.tag.textContent = `${g.short} ${l.name}`
      e.el.style.opacity = now - l.t > STALE_MS ? '0.45' : focus && focus !== l.team_id ? '0.3' : '1'
      e.dot.classList.toggle('loc-pulse', pulse === l.team_id)
    }
    if (added && !touched.current) m.fitBounds(boundsOf([...locs.values()]), { padding: 80, maxZoom: 17, duration: 0 })
    const s = follow && sel ? locs.get(sel) : null
    if (s) m.easeTo({ center: [s.lng, s.lat] })
  }, [locs, info, now, follow, sel, focus, pulse])

  // Legend tap: frame that group and make its dots blink; tap again to see everyone.
  const pickGroup = (teamId: string) => {
    clearTimeout(pulseTimer.current)
    setSel(null); setFollow(false)
    if (focus === teamId) { setFocus(null); setPulse(null); map.current?.fitBounds(boundsOf([...locs.values()]), { padding: 80, maxZoom: 17 }); return }
    const mine = [...locs.values()].filter(l => l.team_id === teamId)
    if (mine.length === 0) return
    touched.current = true
    setFocus(teamId); setPulse(teamId)
    map.current?.fitBounds(boundsOf(mine), { padding: 100, maxZoom: 17 })
    pulseTimer.current = setTimeout(() => setPulse(null), 4000)
  }
  useEffect(() => () => clearTimeout(pulseTimer.current), [])

  const chosen = sel ? locs.get(sel) : undefined
  const g = chosen ? info.get(chosen.team_id) : undefined
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* inline: maplibre's own css sets position:relative on this node and would win over a class */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {locs.size === 0 && <p className="absolute inset-x-0 top-3 text-center text-xs font-bold text-gray-700 pointer-events-none"><span className="bg-white/90 rounded-full px-3 py-1">Waiting for players to share their location…</span></p>}
      <div className="absolute left-2 top-2 max-h-[45%] overflow-y-auto rounded-xl bg-white/95 text-gray-900 px-1.5 py-1.5 text-xs sm:text-sm shadow">
        {title && <p className="font-black px-2 pb-1">{title}</p>}
        {[...info.entries()].map(([id, g]) => {
          const live = [...locs.values()].some(l => l.team_id === id)
          return (
            <button key={id} onClick={() => pickGroup(id)} disabled={!live && focus !== id}
              className={`w-full min-h-[36px] flex items-center gap-2 px-2 rounded-lg text-left ${focus === id ? 'bg-gray-900 text-white' : live ? 'hover:bg-gray-100' : 'text-gray-400'}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
              <span className="truncate">{g.name}</span>
              {!live && <span className="text-[10px] ml-auto">no signal</span>}
            </button>
          )
        })}
      </div>
      {locs.size > 0 && (
        <button onClick={() => { setFocus(null); setPulse(null); map.current?.fitBounds(boundsOf([...locs.values()]), { padding: 80, maxZoom: 17 }) }}
          className="absolute left-2 bottom-6 min-h-[44px] px-3 rounded-xl bg-white text-gray-900 text-xs font-black shadow">Fit all</button>
      )}
      {chosen && g && (
        <div className="absolute inset-x-2 bottom-6 sm:left-auto sm:right-2 sm:w-72 bg-white text-gray-900 rounded-2xl shadow-lg p-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: g.color }} />
            <div className="min-w-0 flex-1">
              <p className="font-black leading-tight truncate">{chosen.name || 'Player'}{chosen.role === 'observer' ? ' · observer' : ''}</p>
              <p className="text-xs text-gray-500 truncate">{g.name} · updated {ago(chosen.t)}</p>
            </div>
            <button onClick={() => { setSel(null); setFollow(false) }} aria-label="Close" className="w-9 h-9 text-xl text-gray-400">×</button>
          </div>
          {now - chosen.t > STALE_MS && <p className="text-[11px] text-amber-700 mt-1">No update for a while: they may have moved on.</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setFollow(f => !f)} className={`flex-1 min-h-[44px] rounded-xl text-sm font-black ${follow ? 'bg-teal-600 text-white' : 'bg-gray-100'}`}>{follow ? 'Following' : 'Follow'}</button>
            {isAdmin && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${chosen.lat},${chosen.lng}&travelmode=walking`} target="_blank" rel="noopener noreferrer"
                onClick={e => { e.preventDefault(); window.open(e.currentTarget.href, '_blank', 'noopener,noreferrer') }}
                className="flex-1 min-h-[44px] rounded-xl text-sm font-black bg-blue-600 text-white flex items-center justify-center">Navigate</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
