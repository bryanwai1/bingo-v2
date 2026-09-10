-- ============================================================
-- Cube board: up to 6 faces of 25 tiles.
--
-- Deliberately NOT new scoring. Each face stays an ordinary 5×5 with the
-- existing line rules; a session just opens 1, 2 or 6 of them and the points
-- scale accordingly. Keeping the rules identical is what stops this becoming
-- a different game that nobody can explain to a room.
--
--   slot 0..24    → face 0
--   slot 25..49   → face 1
--   ...
--   slot 125..149 → face 5
-- face = slot / 25, position on that face = slot % 25.
-- ============================================================

alter table public.bingo_board_cards drop constraint if exists bingo_board_cards_slot_check;
alter table public.bingo_board_cards
  add constraint bingo_board_cards_slot_check check (slot >= 0 and slot < 150);

alter table public.bingo_sections
  add column if not exists face_count int not null default 1
    check (face_count in (1, 2, 6));

comment on column public.bingo_sections.face_count is
  'How many cube faces are in play: 1 (flat board), 2, or 6. Points scale with it.';

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────
-- alter table public.bingo_board_cards drop constraint if exists bingo_board_cards_slot_check;
-- alter table public.bingo_board_cards
--   add constraint bingo_board_cards_slot_check check (slot >= 0 and slot < 25);
-- alter table public.bingo_sections drop column if exists face_count;
-- notify pgrst, 'reload schema';
