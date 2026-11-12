/** Optional card components, in rail order. Core fields (title, category, points, type, photos, instructions) stay on the page. */
export const RAIL_ITEMS = [
  { key: 'unlock', icon: '🔒', label: 'Unlocks & warning' },
  { key: 'maps', icon: '📍', label: 'Google Maps link' },
  { key: 'links', icon: '🔗', label: 'Helpful links' },
  { key: 'draw', icon: '🎲', label: 'Draw' },
] as const

export type RailKey = (typeof RAIL_ITEMS)[number]['key']

/** Rail icons shown: every component the card already uses, plus the ones added with "+". */
export function railKeys(inUse: Partial<Record<RailKey, boolean>>, added: RailKey[]): RailKey[] {
  return RAIL_ITEMS.map(i => i.key).filter(k => inUse[k] || added.includes(k))
}

