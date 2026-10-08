import { supabase } from './supabase'

// Board-only card edits. A card is shared by every board that places it; the
// first time a board edits one, fork_card_for_board gives that board its own
// copy and re-points the box, so the edit never reaches the library or other
// boards. See supabase/core-tables/20261008_board_card_fork.sql.

/** The board's own copy of the card in this box (made now if it is still shared). */
export async function ensureBoardCopy(placementId: string): Promise<string> {
  const { data, error } = await supabase.rpc('fork_card_for_board', { p_placement: placementId })
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Could not make a board copy of this card.')
  return data
}

/** Put the box back on the library card and delete the board's copy. */
export async function revertBoardCopy(placementId: string): Promise<string> {
  const { data, error } = await supabase.rpc('revert_board_copy', { p_placement: placementId })
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Could not go back to the library card.')
  return data
}
