import { supabase } from './supabase'

const PREFIX = '/storage/v1/object/public/media/'

// Duplicating a card copies its photo and sample rows but not the files, so
// one file can back several cards. Only remove it once nothing points at it.
const REFS: [table: string, column: string][] = [
  ['bingo_task_photos', 'photo_url'],
  ['bingo_task_samples', 'media_url'],
  ['bingo_task_pages', 'media_url'],
  ['bingo_breakout_puzzles', 'image_url'],
]

/** Delete a file from the 'media' bucket if no card row still uses it. Call after deleting the row. */
export async function removeMediaIfUnused(url: string | null | undefined) {
  const at = url?.indexOf(PREFIX) ?? -1
  if (!url || at < 0) return
  const counts = await Promise.all(REFS.map(([table, column]) =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, url)))
  // If any check failed, keep the file — a leftover file is cheaper than a broken card.
  if (counts.some(r => r.error || (r.count ?? 0) > 0)) return
  await supabase.storage.from('media').remove([decodeURIComponent(url.slice(at + PREFIX.length))])
}
