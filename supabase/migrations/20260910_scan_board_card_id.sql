-- ============================================================================
-- bingo_scans: track completion per BOARD BOX, not just per card
--
-- Symptom: bingo_scans is keyed by (team_id, task_id) only. When the same
-- card is placed in several boxes on one board (cards are universal — see
-- boardCards.ts), completing it from any one box marks every box holding
-- that card as done, and awards its points only once instead of once per
-- box. Reported live: "Longest Breathe" placed 3x on one board, entering
-- the marshal password once ticked all 3 boxes.
--
-- Fix: board taps now carry which bingo_board_cards row they came from
-- (?box=<id> on the task URL), and recordScan() looks up/creates the scan
-- scoped to that placement when given one. Existing scans (board_card_id
-- IS NULL) keep behaving exactly as before — this is additive, no backfill,
-- no data loss. Only *newly* completed boxes get correctly independent
-- tracking; already-completed cards do not retroactively split.
-- ============================================================================

alter table public.bingo_scans
  add column if not exists board_card_id uuid references public.bingo_board_cards(id) on delete set null;

create index if not exists bingo_scans_board_card_idx on public.bingo_scans(board_card_id);

notify pgrst, 'reload schema';
