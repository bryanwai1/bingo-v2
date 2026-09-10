-- ============================================================
-- 008b — stop renters reading each other's data.
--
-- Today every bingo table is `select using (true)`. Renter A can read
-- Renter B's cards, teams and scores. For a rented tool that is the
-- failure that ends the product.
--
-- Constraint: players are ANONYMOUS. A phone loads the board before it
-- has any identity, so reads cannot simply be closed. The rule instead:
--   • anon may read the board that is LIVE (game_started) — that is the
--     event actually running, which is public by nature;
--   • an authenticated account may read its own tenant;
--   • plus any board shared with it through bingo_event_boards (009).
--
-- Writes stay as they are in this migration. Tightening reads first is
-- the smaller blast radius: a wrong read policy blanks a screen, a wrong
-- write policy loses an event's scores.
--
-- ROLLBACK IS AT THE BOTTOM. If anything blanks mid-event, paste it.
-- ============================================================

-- Can this caller see this section?
create or replace function public.can_read_section(p_section uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- owner sees everything
    public.is_bingo_owner()
    -- my own tenant
    or exists (select 1 from bingo_sections s
                where s.id = p_section and public.bingo_can_write(s.owner_id))
    -- shared with me through an event I accepted
    or p_section in (select public.shared_section_ids())
    -- the live board — anonymous players need it before they identify
    or exists (select 1 from bingo_sections s
                where s.id = p_section and s.game_started)
    or exists (select 1 from bingo_settings g
                where g.id = 'main' and g.active_section_id = p_section);
$$;

grant execute on function public.can_read_section(uuid) to anon, authenticated;

-- ── Replace the open SELECT policies ────────────────────────
drop policy if exists "read open" on public.bingo_sections;
create policy "read scoped" on public.bingo_sections
  for select using (public.can_read_section(id));

drop policy if exists "read open" on public.bingo_tasks;
create policy "read scoped" on public.bingo_tasks
  for select using (section_id is null or public.can_read_section(section_id));

drop policy if exists "read open" on public.bingo_teams;
create policy "read scoped" on public.bingo_teams
  for select using (public.can_read_section(section_id));

drop policy if exists "read open" on public.bingo_board_cards;
create policy "read scoped" on public.bingo_board_cards
  for select using (public.can_read_section(section_id));

drop policy if exists "read open" on public.bingo_categories;
create policy "read scoped" on public.bingo_categories
  for select using (section_id is null or public.can_read_section(section_id));

drop policy if exists "read open" on public.bingo_members;
create policy "read scoped" on public.bingo_members
  for select using (public.can_read_section(section_id));

-- Child tables hang off a task; follow the parent's visibility.
drop policy if exists "read open" on public.bingo_task_pages;
create policy "read scoped" on public.bingo_task_pages
  for select using (exists (select 1 from bingo_tasks t
    where t.id = task_id and (t.section_id is null or public.can_read_section(t.section_id))));

drop policy if exists "read open" on public.bingo_task_photos;
create policy "read scoped" on public.bingo_task_photos
  for select using (exists (select 1 from bingo_tasks t
    where t.id = task_id and (t.section_id is null or public.can_read_section(t.section_id))));

drop policy if exists "read open" on public.bingo_task_links;
create policy "read scoped" on public.bingo_task_links
  for select using (exists (select 1 from bingo_tasks t
    where t.id = task_id and (t.section_id is null or public.can_read_section(t.section_id))));

drop policy if exists "read open" on public.bingo_scans;
create policy "read scoped" on public.bingo_scans
  for select using (exists (select 1 from bingo_teams tm
    where tm.id = team_id and public.can_read_section(tm.section_id)));

drop policy if exists "read open" on public.bingo_photo_submissions;
create policy "read scoped" on public.bingo_photo_submissions
  for select using (exists (select 1 from bingo_tasks t
    where t.id = task_id and (t.section_id is null or public.can_read_section(t.section_id))));

drop policy if exists "read open" on public.bingo_duels;
create policy "read scoped" on public.bingo_duels
  for select using (public.can_read_section(section_id));

drop policy if exists "read open" on public.bingo_award_configs;
create policy "read scoped" on public.bingo_award_configs
  for select using (public.can_read_section(section_id));

-- bingo_settings, bingo_challenge_sections and bingo_contest_games stay
-- open: the first is a single global config row the anonymous front door
-- needs, the others are library metadata with no client data in them.

notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK — paste this whole block to restore open reads.
-- ============================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'bingo_sections','bingo_tasks','bingo_teams','bingo_board_cards',
--     'bingo_categories','bingo_members','bingo_task_pages','bingo_task_photos',
--     'bingo_task_links','bingo_scans','bingo_photo_submissions','bingo_duels',
--     'bingo_award_configs']
--   loop
--     execute format('drop policy if exists "read scoped" on public.%I', t);
--     execute format('create policy "read open" on public.%I for select using (true)', t);
--   end loop;
-- end $$;
-- notify pgrst, 'reload schema';
