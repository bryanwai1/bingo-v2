import type { ChangeEvent, ReactNode, Ref } from 'react'

// A big dashed "choose a file or drop it here" box. The input lives inside the
// label, so a click opens the file dialog and lib/fileDrop.ts turns a dropped
// file into the same onChange.
export function UploadBox({ onChange, accept = 'image/*', multiple, disabled, busy, title, hint, icon = '🖼', size = 'md', dark, inputRef, className = '' }: {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  busy?: boolean
  title?: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  /** sm: a compact strip for rows in a list. md: a roomy box. */
  size?: 'sm' | 'md'
  /** For dark backgrounds (slides). */
  dark?: boolean
  inputRef?: Ref<HTMLInputElement>
  className?: string
}) {
  const off = disabled || busy
  const tone = dark
    ? 'border-white/30 text-white/70 hover:border-white/60 hover:bg-white/5'
    : 'border-gray-300 bg-gray-50/60 text-gray-600 hover:border-violet-400 hover:bg-violet-50/60'
  return (
    <label className={`flex ${size === 'sm' ? 'flex-row gap-2 px-3 py-2' : 'flex-col gap-1.5 px-6 py-8'} items-center justify-center text-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${tone} ${off ? 'opacity-50 pointer-events-none' : ''} ${className}`}>
      <span className={size === 'sm' ? 'text-lg' : 'text-4xl'}>{busy ? '⏳' : icon}</span>
      <span className="flex flex-col items-center">
        <span className={`font-black ${size === 'sm' ? 'text-xs' : 'text-base'} ${dark ? 'text-white' : 'text-gray-800'}`}>
          {busy ? 'Uploading…' : title ?? (multiple ? 'Choose files or drop them here' : 'Choose a file or drop it here')}
        </span>
        {hint && !busy && <span className={`${size === 'sm' ? 'text-[10px]' : 'text-xs'} mt-0.5 opacity-70`}>{hint}</span>}
      </span>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} disabled={off} className="hidden" onChange={onChange} />
    </label>
  )
}
