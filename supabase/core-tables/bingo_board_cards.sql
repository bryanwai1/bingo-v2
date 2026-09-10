-- bingo_board_cards: placements. Cards are universal — one bingo_tasks row
-- can sit in several boxes, on the same board or different ones — this is
-- the join table that records which box each placement occupies.
-- Source: core-tables/20260610_bingo_board_cards.sql (original), widened by
-- core-tables/004_unlimited_placements.sql and cube-board/012_cube_board.sql.

create table public.bingo_board_cards (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.bingo_sections(id) on delete cascade,
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  -- 0..24 on a flat board; a cube board packs 25 tiles per face into this
  -- same column (face = slot / 25, position on that face = slot % 25), so
  -- the range widens with the number of faces cube-board/012 allows.
  slot        int not null default 0
    constraint bingo_board_cards_slot_check check (slot >= 0 and slot < 150),
  created_at  timestamptz not null default now()
);

create index bingo_board_cards_section_idx on public.bingo_board_cards(section_id);
create index bingo_board_cards_task_idx on public.bingo_board_cards(task_id);

-- A board can reuse the same card in several boxes, so uniqueness is on the
-- SLOT, not the (section, task) pair (that original constraint was dropped
-- in core-tables/004_unlimited_placements.sql to allow duplicate placement).
create unique index bingo_board_cards_section_slot_key
  on public.bingo_board_cards(section_id, slot);

alter table public.bingo_board_cards enable row level security;

create policy "read open" on public.bingo_board_cards for select using (true);
create policy "tenant write" on public.bingo_board_cards for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));
-- Note: unlike most gameplay tables, there is deliberately no "anon write"
-- policy here — board layout is an admin/authenticated-only action; anon
-- sessions (players) can only read placements, never write them.

alter publication supabase_realtime add table public.bingo_board_cards;
