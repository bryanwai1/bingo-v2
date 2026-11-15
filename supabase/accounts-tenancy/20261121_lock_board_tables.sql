-- Lock the BOARD tables to their owner, in the database. Companion to
-- 20261121_lock_owner_only_tables.sql (same "app_all" problem: a live policy
-- named app_all, USING true / CHECK true, overrides the real rules).
--
-- Why it matters for the shared library: the owner's Default board IS the shared
-- library's home. With app_all, anyone could rename, rearrange or DELETE it.
-- After this: read stays open (players need it); writes follow bingo_can_write:
--   * house boards (owner_id NULL)  -> owner only (and the owner's own crew)
--   * a tenant's boards             -> that tenant only
--
-- Restores exactly the policies already defined in core-tables/*.sql.
--
-- NOTE: the demo page's signed-out glow write goes through set_section_glow()
-- "glow_slots" highlight on a section while signed out. Signed out, that one
-- write is now refused (the owner signed in still works). Skip this file if the
-- demo page's remote-highlight must keep working signed out.

-- bingo_sections
drop policy if exists "app_all" on public.bingo_sections;
drop policy if exists "read open" on public.bingo_sections;
drop policy if exists "tenant insert" on public.bingo_sections;
drop policy if exists "tenant update" on public.bingo_sections;
drop policy if exists "tenant delete" on public.bingo_sections;
create policy "read open" on public.bingo_sections for select using (true);
create policy "tenant insert" on public.bingo_sections for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_sections for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_sections for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

-- bingo_board_cards, bingo_categories: owned through their section
drop policy if exists "app_all" on public.bingo_board_cards;
drop policy if exists "read open" on public.bingo_board_cards;
drop policy if exists "tenant write" on public.bingo_board_cards;
create policy "read open" on public.bingo_board_cards for select using (true);
create policy "tenant write" on public.bingo_board_cards for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));

drop policy if exists "app_all" on public.bingo_categories;
drop policy if exists "read open" on public.bingo_categories;
drop policy if exists "tenant write" on public.bingo_categories;
create policy "read open" on public.bingo_categories for select using (true);
create policy "tenant write" on public.bingo_categories for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));

-- bingo_challenge_sections: owned through game_section_id
drop policy if exists "app_all" on public.bingo_challenge_sections;
drop policy if exists "read open" on public.bingo_challenge_sections;
drop policy if exists "tenant write" on public.bingo_challenge_sections;
create policy "read open" on public.bingo_challenge_sections for select using (true);
create policy "tenant write" on public.bingo_challenge_sections for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = game_section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = game_section_id and public.bingo_can_write(s.owner_id)));

-- bingo_award_configs
drop policy if exists "app_all" on public.bingo_award_configs;
drop policy if exists "read open" on public.bingo_award_configs;
drop policy if exists "tenant write" on public.bingo_award_configs;
create policy "read open" on public.bingo_award_configs for select using (true);
create policy "tenant write" on public.bingo_award_configs for all to authenticated
  using (exists (select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (exists (select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));
