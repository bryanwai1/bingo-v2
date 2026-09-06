import { useLang, setLang } from '../hooks/useLanguage'

interface Props {
  className?: string
  variant?: 'dark' | 'light'
}

export function LanguageToggle({ className = '', variant = 'dark' }: Props) {
  const lang = useLang()
  const isDark = variant === 'dark'
  return (
    <div
      className={`inline-flex rounded-full p-1 backdrop-blur-sm border ${
        isDark ? 'bg-black/30 border-white/20' : 'bg-white border-gray-200'
      } ${className}`}
    >
      {(['en', 'ms'] as const).map(l => {
        const active = lang === l
        return (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${
              active
                ? isDark ? 'bg-white text-gray-900' : 'a-surface a-text'
                : isDark ? 'a-text-2 hover:a-text' : 'text-gray-500 hover:text-gray-800'
            }`}
            aria-label={l === 'en' ? 'Switch to English' : 'Tukar ke Bahasa Malaysia'}
          >
            {l === 'en' ? 'EN' : 'BM'}
          </button>
        )
      })}
    </div>
  )
}
