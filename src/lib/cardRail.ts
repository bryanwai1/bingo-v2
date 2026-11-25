/** Optional card components, in rail order. Core fields (title, category, points, type, photos, instructions) stay on the page. */
export const RAIL_ITEMS = [
  { key: 'unlock', icon: '🔒', label: 'Unlocks & warning' },
  { key: 'station', icon: '⏱️', label: 'Station' },
  { key: 'needs', icon: '👥', label: 'People & place' },
  { key: 'maps', icon: '📍', label: 'Google Maps link' },
  { key: 'links', icon: '🔗', label: 'Helpful links' },
  { key: 'draw', icon: '🎲', label: 'Draw' },
  { key: 'schedule', icon: '🗓️', label: 'Schedule' },
] as const

export type RailKey = (typeof RAIL_ITEMS)[number]['key']
