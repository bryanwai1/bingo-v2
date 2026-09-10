-- ================================================================
-- Bingo Dash: universal cards across boards
--
-- 1) bingo_board_cards: per-board placements (board <-> card junction).
--    A card can now sit on any number of boards - no more cloning a
--    card just to reuse it on another board.
-- 2) Backfill: every card currently on a grid (in_grid = true) gets a
--    placement row on its home board, keeping its existing slot.
-- 3) Cleanup: delete leftover duplicate cards created by the old
--    copy-per-board flow (same title as an older card, not placed on
--    any board, no scans / photo submissions / snake-tile references).
--
-- Run once in the Supabase SQL editor BEFORE deploying the app update.
-- The legacy bingo_tasks.in_grid / sort_order columns are left in place
-- (the old app version keeps working until the new build is deployed).
-- ================================================================

create table if not exists bingo_board_cards (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references bingo_sections(id) on delete cascade,
  task_id uuid not null references bingo_tasks(id) on delete cascade,
  slot int not null default 0 check (slot >= 0 and slot < 25),
  created_at timestamptz not null default now(),
  unique (section_id, task_id)
);
create index if not exists bingo_board_cards_section_idx on bingo_board_cards (section_id);
create index if not exists bingo_board_cards_task_idx on bingo_board_cards (task_id);

-- RLS: same permissive pattern as the other bingo_* tables.
alter table bingo_board_cards enable row level security;
drop policy if exists "anon read bingo_board_cards"  on bingo_board_cards;
drop policy if exists "anon write bingo_board_cards" on bingo_board_cards;
create policy "anon read bingo_board_cards"  on bingo_board_cards for select using (true);
create policy "anon write bingo_board_cards" on bingo_board_cards for all    using (true) with check (true);

-- Backfill placements from the legacy in_grid/sort_order columns.
insert into bingo_board_cards (section_id, task_id, slot)
select section_id, id, least(greatest(sort_order, 0), 24)
  from bingo_tasks
 where in_grid
on conflict (section_id, task_id) do nothing;

-- Optional: preview which duplicate cards the cleanup below will delete.
-- select t.id, t.title, s.name as compartment, t.created_at
--   from bingo_tasks t
--   join bingo_tasks orig
--     on lower(trim(orig.title)) = lower(trim(t.title))
--    and (orig.created_at < t.created_at or (orig.created_at = t.created_at and orig.id < t.id))
--   join bingo_sections s on s.id = t.section_id
--  where not exists (select 1 from bingo_board_cards bc where bc.task_id = t.id)
--    and not exists (select 1 from bingo_scans sc where sc.task_id = t.id)
--    and not exists (select 1 from bingo_photo_submissions ps where ps.task_id = t.id)
--    and not exists (select 1 from snake_tiles st where st.task_id = t.id);

-- Delete leftover duplicates from the old copy-per-board flow.
-- Only rows that are invisible to players are removed: never placed on a
-- board, never scanned, no photo submissions, not used by Snake & Ladder.
delete from bingo_tasks t
 using bingo_tasks orig
 where lower(trim(orig.title)) = lower(trim(t.title))
   and (orig.created_at < t.created_at or (orig.created_at = t.created_at and orig.id < t.id))
   and not exists (select 1 from bingo_board_cards bc where bc.task_id = t.id)
   and not exists (select 1 from bingo_scans sc where sc.task_id = t.id)
   and not exists (select 1 from bingo_photo_submissions ps where ps.task_id = t.id)
   and not exists (select 1 from snake_tiles st where st.task_id = t.id);

-- Tell PostgREST to reload so the new table becomes visible immediately.
notify pgrst, 'reload schema';
