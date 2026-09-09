import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoScan } from '../types/database'

export function useBingoScans() {
  const recordScan = useCallback(async (teamId: string, taskId: string): Promise<BingoScan | null> => {
    // .single() errors when it finds anything other than exactly one row, so a
    // team that somehow ended up with two scans for a card would get null here
    // and be given a third, and a fourth. Take the oldest and carry on: the
    // duplicates then heal instead of multiplying.
    const { data: existing } = await supabase
      .from('bingo_scans')
      .select('*')
      .eq('team_id', teamId)
      .eq('task_id', taskId)
      .order('scanned_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existing) return existing

    const { data, error } = await supabase
      .from('bingo_scans')
      .insert({ team_id: teamId, task_id: taskId })
      .select()
      .single()
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
