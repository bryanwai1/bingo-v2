import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoScan } from '../types/database'

export function useBingoScans() {
  // boardCardId scopes the scan to one specific board box (bingo_board_cards
  // row), so a card placed in several boxes on one board completes each box
  // independently instead of one scan being shared by all of them. Omit it
  // (bare task link, e.g. a QR code that only encodes the card) to fall back
  // to the card-wide scan every box used to share.
  const recordScan = useCallback(async (teamId: string, taskId: string, boardCardId?: string | null): Promise<BingoScan | null> => {
    // A plain "select existing, else insert" isn't atomic: two calls for the
    // same (team, task, box) — e.g. an effect firing twice — can both see
    // "nothing yet" and both insert, producing duplicate rows. bingo_scans
    // has a unique index on (team_id, task_id, board_card_key) — see
    // supabase/migrations/20260910_scan_unique_constraint.sql — so upsert
    // with ignoreDuplicates lets the DB be the single source of truth: at
    // most one row is ever created no matter how the calls interleave.
    const { error: upsertError } = await supabase
      .from('bingo_scans')
      .upsert(
        { team_id: teamId, task_id: taskId, board_card_id: boardCardId ?? null },
        { onConflict: 'team_id,task_id,board_card_key', ignoreDuplicates: true },
      )
    if (upsertError) throw upsertError

    // DO NOTHING upserts don't return the row they collided with, so fetch
    // it — by now it's guaranteed to exist, either just-inserted or already
    // there, so this read carries no race of its own.
    let query = supabase
      .from('bingo_scans')
      .select('*')
      .eq('team_id', teamId)
      .eq('task_id', taskId)
    query = boardCardId ? query.eq('board_card_id', boardCardId) : query.is('board_card_id', null)
    const { data, error } = await query.limit(1).single()
    if (error) throw error
    return data
  }, [])

  const toggleComplete = useCallback(async (scanId: string, completed: boolean) => {
    const { error } = await supabase
      .from('bingo_scans')
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', scanId)
    if (error) throw error
  }, [])

  /** Interactive-module result (Nerf cups, roulette wheels, dealt cards) for
   *  an AI Team Building card played standalone (not inside the bundle tile).
   *  Written once by whichever phone completes the draw, read back by every
   *  teammate through the bingo_scans realtime subscription. */
  const saveWords = useCallback(async (scanId: string, words: string[]) => {
    const { error } = await supabase.from('bingo_scans').update({ words }).eq('id', scanId)
    if (error) throw error
  }, [])

  /** Persist the ticked-step set for a standalone AI Team Building card —
   *  mirrors toggle_bundle_step's array-of-indexes shape, just written
   *  directly since bingo_scans has no completion/status gate to guard. */
  const saveSteps = useCallback(async (scanId: string, stepsDone: number[]) => {
    const { error } = await supabase.from('bingo_scans').update({ steps_done: stepsDone }).eq('id', scanId)
    if (error) throw error
  }, [])

  /**
   * A non-leader member submits a tile. It goes PENDING — no points, nothing
   * on the host's screen — until the team leader approves. This is what stops
   * four phones sending the same completion to one marshal.
   */
  const submitTile = useCallback(async (teamId: string, taskId: string, memberId: string) => {
    const { error } = await supabase.rpc('submit_tile', {
      p_team: teamId, p_task: taskId, p_member: memberId,
    })
    if (error) return { error: error.message }
    return {}
  }, [])

  /** The team leader approves (completes + scores) or rejects a submission. */
  const approveTile = useCallback(async (scanId: string, leaderId: string, approve = true) => {
    const { error } = await supabase.rpc('approve_tile', {
      p_scan: scanId, p_leader: leaderId, p_approve: approve,
    })
    if (error) {
      const m = error.message || ''
      if (m.includes('NOT_THE_LEADER')) return { error: 'Only the team leader can approve.' }
      if (m.includes('NOT_YOUR_TEAM'))  return { error: 'That submission is not from your team.' }
      return { error: m }
    }
    return {}
  }, [])

  return { recordScan, toggleComplete, submitTile, approveTile, saveWords, saveSteps }
}
