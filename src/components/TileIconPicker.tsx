import { CategoryIcon } from './BingoTileFace'
import { TILE_ICON_POOL } from '../lib/tileIcons'

/**
 * Pick the icon shown on this card's board tile. "Auto" follows the category;
 * anything else is saved on the card (bingo_tasks.tile_icon) and wins over it.
 */
export function TileIconPicker({
  value, category, color, onChange, compact = false,
}: {
  value: string | null | undefined
  category: string
  /** The tile colour, so the preview looks like the real tile. */
  color: string
  onChange: (key: string | null) => void
  /** Fewer columns, for a narrow modal. */
  compact?: boolean
}) {
  const tile = (selected: boolean) =>
    `relative flex flex-col items-center justify-center gap-1 rounded-xl p-2 border-2 transition-all ${
      selected ? 'border-violet-600 ring-2 ring-violet-300' : 'border-transparent hover:border-gray-300'
    }`

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8'}`}>
      <button type="button" onClick={() => onChange(null)} className={tile(!value)} title="Use the category's icon">
        <span className="w-12 h-12 rounded-lg flex items-center justify-center text-white" style={{ background: color }}>
          <CategoryIcon category={category} className="w-7 h-7" />
        </span>
        <span className="text-[11px] font-bold text-gray-600">Auto</span>
      </button>
      {TILE_ICON_POOL.map(i => (
        <button key={i.key} type="button" onClick={() => onChange(i.key)} className={tile(value === i.key)} title={i.label}>
          <span className="w-12 h-12 rounded-lg flex items-center justify-center text-white" style={{ background: color }}>
            <CategoryIcon category={category} iconKey={i.key} className="w-7 h-7" />
          </span>
          <span className="text-[11px] text-gray-500 leading-tight text-center">{i.label}</span>
        </button>
      ))}
    </div>
  )
}
