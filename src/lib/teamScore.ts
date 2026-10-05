import { buildBingoSlots, scoreWithBingoLines } from './bingoLines'
import { duelBonusByTeam } from '../hooks/useBingoDuels'
import { boxPoints, round2, type BonusDefaults } from './timeBonus'
import type { BingoTask, BingoTeam, BingoScan, BingoDuel } from '../types/database'

// ════════════════════════════════════════════════════════════════════════════
// ONE place a team's score is computed.
//
// The projector and the award ceremony each carried their own copy of this,
// and the copies drifted: the award slides never read `tiebreak`, always added
// the manual bonus (the projector has a toggle), ignored duel wins when
// breaking ties, built the 25 slots by hand instead of via buildBingoSlots,
// and recounted bingo lines from a duplicated copy of BINGO_LINES. The result
// was an award ceremony that could crown a different winner than the
// scoreboard the room had just been watching.
//
// Callers pass data already narrowed to one board. This module deliberately
// takes no sectionId: a second place that filters by section is exactly the
// duplication being removed.
// ════════════════════════════════════════════════════════════════════════════

/** A task as placed on a board — `sort_order` is the slot, 0-24. */
export type BoardTask = BingoTask & { sort_order: number; placement_id?: string | null }

export interface TeamScoreInput {
  teams: BingoTeam[]
  /** May span other boards; filtered by team_id here. */
  scans: BingoScan[]
  /** Tasks as placed on THIS board. */
  boardTasks: BoardTask[]
  /** Resolved duels for this board. */
  duels: BingoDuel[]
  /** The board's default bonus window; cards without their own follow it. */
  board?: BonusDefaults | null
}

export interface TeamScore {
  team: BingoTeam
  /** Box points (time bonus included), before any line bonus. */
  tilePoints: number
  /** What the completed bingo lines added on top. */
  lineBonus: number
  /** Contest winnings. Never scaled by a line — a winning defender has no tile. */
  duelBonus: number
  /** Tiles + line bonus + duel. This is the projector's default figure. */
  basePoints: number
  /** The facilitator's manual award. */
  bonusPoints: number
  /**
   * basePoints + bonusPoints — the projector's "Total after Bonus" figure,
   * and what the award ceremony shows. Running the projector with the bonus
   * toggle OFF will therefore show smaller numbers than the award slides;
   * that is intended, not a mismatch.
   */
  total: number
  bingos: number
  tasksDone: number
  /** When this team last scored. Infinity = never. */
  reachedAt: number
}

export function scoreTeams({ teams, scans, boardTasks, duels, board }: TeamScoreInput): TeamScore[] {
  const duelBonuses = duelBonusByTeam(duels)
  const num = (v: unknown) => Number(v ?? 0) || 0

  // completedBingoLines matches slot.id against the completed set, so the
  // slots carry the PLACEMENT id (falling back to task id for rows predating
  // that column) — line detection is then per box, not per card.
  const slots = buildBingoSlots(boardTasks)
  const lineSlots = slots.map(t => (t ? { ...t, id: t.placement_id ?? t.id } : null))
  const boardTaskIds = new Set(boardTasks.map(t => t.id))

  return teams.map<TeamScore>(team => {
    const teamScans = scans.filter(s => s.team_id === team.id)

    // A card placed in several boxes completes per box (scans.board_card_id).
    // Scans from before that column existed have none and still count toward
    // every box sharing their task_id — see
    // supabase/scan-completion/20260910_scan_board_card_id.sql.
    const completedPlacementIds = new Set(
      teamScans.filter(s => s.completed && s.board_card_id).map(s => s.board_card_id as string),
    )
    const legacyCompletedTaskIds = new Set(
      teamScans
        .filter(s => s.completed && !s.board_card_id && boardTaskIds.has(s.task_id))
        .map(s => s.task_id),
    )
    const completed = boardTasks.filter(
      t => (t.placement_id && completedPlacementIds.has(t.placement_id)) || legacyCompletedTaskIds.has(t.id),
    )
    const completedIds = new Set(completed.map(t => t.placement_id ?? t.id))

    // When each box was crossed off, so a line multiplier lifts the total
    // standing at that moment rather than the final one.
    const completedAt = new Map<string, number>()
    for (const s of teamScans) {
      if (!s.completed) continue
      const when = s.completed_at ? Date.parse(s.completed_at) : 0
      const key = s.board_card_id ?? s.task_id
      completedAt.set(key, Math.min(completedAt.get(key) ?? Infinity, when))
    }

    // Each box pays its base points scaled by how fast the team finished it.
    const { total: tileAndLinePoints, tilePoints, lineBonus, bingos } = scoreWithBingoLines(
      completed.map(t => ({
        id: t.placement_id ?? t.id,
        points: boxPoints(t, teamScans, board),
        at: completedAt.get(t.placement_id ?? '') ?? completedAt.get(t.id) ?? 0,
      })),
      lineSlots,
    )

    const duelBonus = num(duelBonuses.get(team.id))
    const bonusPoints = num(team.bonus_points)
    const basePoints = round2(tileAndLinePoints + duelBonus)

    const lastScan = teamScans.reduce((latest, s) => {
      if (!s.completed || !boardTaskIds.has(s.task_id) || !s.completed_at) return latest
      return Math.max(latest, Date.parse(s.completed_at))
    }, 0)
    // A duel win is a scoring moment too, so it counts for tie-breaking.
    const lastDuel = duels.reduce((latest, d) => {
      if (d.winner_team_id !== team.id || !d.resolved_at) return latest
      return Math.max(latest, Date.parse(d.resolved_at))
    }, 0)

    return {
      team,
      tilePoints,
      lineBonus,
      duelBonus,
      basePoints,
      bonusPoints,
      total: round2(basePoints + bonusPoints),
      bingos,
      tasksDone: completedIds.size,
      reachedAt: Math.max(lastScan, lastDuel) || Infinity,
    }
  })
}

/**
 * Ranking order: score, then most lines, then most boxes, then whoever got
 * there first — a team matching the leader later stays below them.
 *
 * `includeBonus` is a DISPLAY choice, never a scoring one: the projector
 * passes its "Total after Bonus" toggle through, the ceremony leaves it on.
 */
export function compareTeamScores(
  a: TeamScore,
  b: TeamScore,
  opts: { includeBonus?: boolean } = {},
): number {
  const includeBonus = opts.includeBonus ?? true
  const score = (r: TeamScore) => (includeBonus ? r.total : r.basePoints)
  if (score(b) !== score(a)) return score(b) - score(a)
  if (b.bingos !== a.bingos) return b.bingos - a.bingos
  if (b.tasksDone !== a.tasksDone) return b.tasksDone - a.tasksDone
  if (a.reachedAt !== b.reachedAt) return a.reachedAt - b.reachedAt
  return a.team.name.localeCompare(b.team.name, undefined, { numeric: true })
}

export function rankTeams(input: TeamScoreInput, opts: { includeBonus?: boolean } = {}): TeamScore[] {
  return scoreTeams(input).sort((a, b) => compareTeamScores(a, b, opts))
}

/** Scores always show 2 decimal places, so 140 and 97.5 read as 140.00 and 97.50. */
export function formatScore(v: unknown): string {
  const n = Number(v ?? 0) || 0
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
