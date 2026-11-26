import { supabase } from './supabase'

// Admin corrections to a game's times and scores, kept so a group's question
// ("why did my points change?") can be answered. Admin-only: the table has no
// anonymous access. See supabase/media-photos/051_time_adjustments.sql.
export type AdjustmentKind = 'time_set' | 'time_reset' | 'card_reset' | 'fix_all' | 'undo_approval' | 'undo_rejection'

export interface Adjustment {
  id: string
  section_id: string
  team_id: string | null
  task_id: string | null
  kind: AdjustmentKind
  detail: string
  reason: string | null
  by_email: string | null
  created_at: string
}

export const KIND_LABEL: Record<AdjustmentKind, string> = {
  time_set: 'Time edited',
  time_reset: 'Time restored',
  card_reset: 'Card reset',
  fix_all: 'Fixed for everyone',
  undo_approval: 'Approval undone',
  undo_rejection: 'Rejection undone',
}

export async function logAdjustment(a: Pick<Adjustment, 'section_id' | 'team_id' | 'task_id' | 'kind' | 'detail' | 'reason'>) {
  const { data } = await supabase.auth.getSession()
  await supabase.from('bingo_adjustments').insert({ ...a, by_email: data.session?.user.email ?? null })
}
