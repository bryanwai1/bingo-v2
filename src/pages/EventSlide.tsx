import { useState, useRef } from 'react'
import { ParticleBackground } from '../components/ParticleBackground'
import { useFullscreen } from '../hooks/useFullscreen'

const DEFAULT_EVENT_NAME = 'SWIFT TEAM BUILDING'
const DEFAULT_TIME_RANGE = '9:00 AM – 12:00 PM'

export function EventSlide() {
  const [logo, setLogo] = useState<string | null>(() => localStorage.getItem('event_logo'))
  const [eventName, setEventName] = useState(() => localStorage.getItem('event_name') || DEFAULT_EVENT_NAME)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(eventName)
  const [timeRange, setTimeRange] = useState(() => localStorage.getItem('event_time') || DEFAULT_TIME_RANGE)
  const [editingTime, setEditingTime] = useState(false)
  const [editTimeValue, setEditTimeValue] = useState(timeRange)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setLogo(result)
      localStorage.setItem('event_logo', result)
    }
    reader.readAsDataURL(file)
  }

  const handleNameSave = () => {
    setEventName(editValue)
    localStorage.setItem('event_name', editValue)
    setEditing(false)
  }

  const handleTimeSave = () => {
    setTimeRange(editTimeValue)
    localStorage.setItem('event_time', editTimeValue)
    setEditingTime(false)
  }

  const removeLogo = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLogo(null)
    localStorage.removeItem('event_logo')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden select-none">
      <ParticleBackground />

      <div className="relative z-10 flex flex-col items-center gap-6 px-12 text-center">

        {/* Logo upload area */}
        <div className="group relative">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          {logo ? (
            <div className="cursor-pointer relative" onClick={() => fileInputRef.current?.click()} title="Click to replace logo">
              <img src={logo} alt="Client logo" className="h-20 max-w-xs object-contain opacity-95 group-hover:opacity-70 transition-opacity duration-300" />
              <button
                onClick={removeLogo}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/70 text-white/50 hover:text-white text-xs transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
              >×</button>
              <p className="text-white/20 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Click to change</p>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-96 max-w-full h-36 px-10 border-2 border-dashed border-white/25 rounded-3xl flex flex-col items-center justify-center gap-1 text-white/45 hover:border-white/50 hover:text-white/70 hover:bg-white/5 transition-all duration-300"
            >
              <span className="text-4xl">🏢</span>
              <span className="text-sm font-semibold tracking-wider uppercase">Choose a logo or drop it here</span>
            </button>
          )}
        </div>

        <div className="w-24 h-px bg-white/10" />

        {/* Event name */}
        {editing ? (
          <div className="flex flex-col items-center gap-3">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditing(false) }}
              className="text-5xl md:text-7xl font-black text-white bg-transparent border-b-2 border-white/40 outline-none text-center tracking-tight w-full max-w-4xl"
            />
            <p className="text-white/30 text-xs uppercase tracking-widest">Press Enter to save</p>
          </div>
        ) : (
          <h1
            className="text-5xl md:text-7xl font-black tracking-tight leading-tight animate-slide-up animate-silver-title cursor-pointer"
            onClick={() => { setEditValue(eventName); setEditing(true) }}
            title="Click to edit"
          >
            {eventName}
          </h1>
        )}

        {editingTime ? (
          <div className="flex flex-col items-center gap-2 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <input
              autoFocus
              value={editTimeValue}
              onChange={(e) => setEditTimeValue(e.target.value)}
              onBlur={handleTimeSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTimeSave(); if (e.key === 'Escape') setEditingTime(false) }}
              className="text-white/70 text-xl md:text-2xl font-medium tracking-[0.3em] uppercase bg-transparent border-b-2 border-white/40 outline-none text-center w-full max-w-2xl"
            />
            <p className="text-white/30 text-xs uppercase tracking-widest">Press Enter to save</p>
          </div>
        ) : (
          <p
            className="text-white/45 text-xl md:text-2xl font-medium tracking-[0.3em] uppercase animate-slide-up cursor-pointer hover:text-white/70 transition-colors"
            style={{ animationDelay: '0.1s' }}
            onClick={() => { setEditTimeValue(timeRange); setEditingTime(true) }}
            title="Click to edit"
          >
            {timeRange}
          </p>
        )}

        <a
          href="/event/grouping"
          className="mt-10 px-8 py-3.5 rounded-2xl text-sm font-bold text-white/40 hover:text-white border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all duration-300 uppercase tracking-widest animate-slide-up"
          style={{ animationDelay: '0.2s' }}
        >
          View Team Groups →
        </a>
      </div>

      {/* Top-left nav */}
      <a href="/" className="absolute top-6 left-6 z-10 text-xs text-white/20 hover:text-white/50 transition-colors uppercase tracking-widest">
        ← Hub
      </a>

      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 z-10 w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 text-white/30 hover:text-white transition-all"
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        )}
      </button>
    </div>
  )
}
