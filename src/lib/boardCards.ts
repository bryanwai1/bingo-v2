import { supabase } from './supabase'
import type { BingoBoardCard, BingoTask } from '../types/database'

// Fetch the cards placed on a board, ordered by slot. Placements live in
// bingo_board_cards (cards are universal — one task can sit on many boards),
// so the returned tasks carry sort_order = slot and in_grid = true to stay
// compatible with the 5x5 layout helpers (buildBingoSlots etc.).
export async function fetchBoardTasks(sectionId: string): Promise<BingoTask[]> {
  const { data: placements } = await supabase
    .from('bingo_board_cards')
    .select('*')
    .eq('section_id', sectionId)
    .order('slot')
  if (!placements || placements.length === 0) return []
  const { data: tasks } = await supabase
    .from('bingo_tasks')
    .select('*')
    .in('id', placements.map(p => p.task_id))
  if (!tasks) return []
  // A category can carry a fallback icon for cards with none of their own.
  // Best effort: if the column is not there yet the cards just use the old icons.
  const { data: cats } = await supabase.from('bingo_categories')
    .select('section_id, name, tile_icon').in('section_id', [...new Set(tasks.map(t => t.section_id))])
  const catIcon = new Map<string, string>()
  for (const c of (cats ?? []) as { section_id: string; name: string; tile_icon: string | null }[]) {
    if (c.tile_icon) catIcon.set(`${c.section_id}|${c.name}`, c.tile_icon)
  }
  const byId = new Map<string, BingoTask>(tasks.map(t => [t.id, {
    ...t, category_icon: catIcon.get(`${t.section_id}|${(t.category ?? '').trim()}`) ?? null,
  }]))
  return (placements as BingoBoardCard[])
    .filter(p => byId.has(p.task_id))
    .map(p => ({ ...byId.get(p.task_id)!, sort_order: p.slot, in_grid: true, placement_id: p.id }))
}

/**
 * Tasks for one cube face, re-indexed so sort_order is 0-24 within that face.
 * The player grid treats sort_order as a position in a 5x5, so a face has to
 * arrive looking like an ordinary board — otherwise face 1's slot 25 falls
 * straight into the overflow bucket and the tile appears in the wrong place.
 */
export function tasksForFace(all: BingoTask[], face: number): BingoTask[] {
  const lo = face * 25, hi = lo + 25
  return all
    .filter(t => (t.sort_order ?? 0) >= lo && (t.sort_order ?? 0) < hi)
    .map(t => ({ ...t, sort_order: (t.sort_order ?? 0) - lo }))
}
