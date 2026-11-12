// Icons and the two theme palettes (Dark = default, Grab) for the prize card
// screens. One family, 2px stroke, as DESIGN-008 asks. Plain .ts (createElement)
// so the render tests can import it without a JSX loader.
import { createElement } from 'react'
import type { CSSProperties } from 'react'

export type PrizeTheme = 'default' | 'grab'

/** DESIGN-008 tokens: one accent per theme. Set as CSS variables on the screen root. */
export function prizeVars(theme: PrizeTheme): CSSProperties {
  const v = theme === 'grab'
    ? { '--pz-accent': '#00B14F', '--pz-ink': '#02150a', '--pz-text': '#ffffff', '--pz-text2': '#f3f4f6', '--pz-soft': 'rgba(0,177,79,.22)', '--pz-accent-text': '#4ade80', '--pz-surface': 'rgba(8,10,16,.58)', '--pz-border': 'rgba(255,255,255,.18)' }
    : { '--pz-accent': '#ffc400', '--pz-ink': '#1c1300', '--pz-text': '#f4f6f9', '--pz-text2': 'rgba(244,246,249,.74)', '--pz-soft': 'rgba(255,196,0,.26)', '--pz-accent-text': '#ffd84a', '--pz-surface': 'rgba(255,255,255,.06)', '--pz-border': 'rgba(255,255,255,.16)' }
  return v as CSSProperties
}

const icon = (d: string, defaultSize: number) => ({ size = defaultSize }: { size?: number }) =>
  createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }, createElement('path', { d }))

export const LockIcon = icon('M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', 18)
export const TrophyIcon = icon('M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8M10 17h4', 22)
export const MapPinIcon = icon('M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 20)
export const CaretLeftIcon = icon('M15 5l-7 7 7 7', 20)
