-- ============================================================
-- Rental accounts, Phase C: multi-tenant RLS hardening
--
-- RUN ONLY AFTER the Phase B build is deployed and verified, and NEVER on
-- an event day. Rollback script at the bottom un-bricks a live event.
--
-- Posture (decided in plan):
--   * SELECT stays open everywhere — anonymous players, projectors and
--     admins previewing links all read with the anon key. Read isolation
--     between renters is UI-level only (documented caveat).
--   * Writes to CONFIG tables become authenticated + ownership-checked.
--   * GAMEPLAY tables keep anonymous writes (players have no auth.uid())
--     but those policies are restricted TO anon; authenticated sessions
--     get tenant-scoped policies instead, so a logged-in admin can never
--     mutate another tenant's teams/scans even if the UI regressed.
--   * Tenancy: owner_id IS NULL = house (Bryan) data.
--
-- DELIBERATELY NOT HARDENED (out of rental scope, anonymous admin pages
-- still write them): bingo_award_configs, snake_*, vote_*, shape_*.
-- KNOWN BREAKAGE after this runs: the anonymous Snake & Ladder admin
-- (/snake-ladder/admin) creates its cards in bingo_tasks/bingo_sections/
-- bingo_task_pages — those inserts will be rejected until that admin is
-- moved behind a login. Flagged to Bryan.
--
-- BEFORE RUNNING, confirm in the SQL editor (plan "open items"):
--   select * from pg_policies where schemaname='public' order by tablename;
--   \d public.settings   \d public.bingo_challenge_sections
-- ============================================================

-- ── 0. Helper ───────────────────────────────────────────────
-- True when the current session may write a row owned by row_owner:
-- the owner account writes everything; a sub writes only its own rows.
create or replace function public.bingo_can_write(row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner() or row_owner = auth.uid();
$$;

-- ── 1. Drop every existing policy on the tables being hardened ──
-- Legacy root-level supabase-migration-*.sql files created permissive
-- policies under varying names; dropping from pg_policies catches them all.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'bingo_sections', 'bingo_tasks',
        'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
        'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
        'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
        'bingo_settings',
        'tasks', 'task_pages', 'task_photos', 'task_links',
        'teams', 'team_members', 'team_scans',
        'settings'
      )
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Make sure RLS is on everywhere we are about to define policies.
do $$
declare t text;
begin
  foreach t in array array[
    'bingo_sections', 'bingo_tasks',
    'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
    'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
    'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
    'bingo_settings',
    'tasks', 'task_pages', 'task_photos', 'task_links',
    'teams', 'team_members', 'team_scans',
    'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── 2. Class 1 — bingo config roots (have owner_id) ─────────
-- Subs cannot edit/delete house cards -> copy-on-use enforced at DB level.
create policy "read open" on public.bingo_sections for select using (true);
create policy "tenant insert" on public.bingo_sections for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_sections for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_sections for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

create policy "read open" on public.bingo_tasks for select using (true);
create policy "tenant insert" on public.bingo_tasks for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_tasks for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_tasks for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

-- ── 3. Class 2 — bingo child config (ownership via parent) ──
-- bingo_task_pages / bingo_task_photos / bingo_task_links -> bingo_tasks
do $$
declare t text;
begin
  foreach t in array array['bingo_task_pages', 'bingo_task_photos', 'bingo_task_links']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
        with check (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
    $f$, t);
  end loop;
end $$;

-- bingo_board_cards: WITH CHECK deliberately checks only the SECTION's
-- owner — you may place your own copy of any card, but never place
-- anything onto someone else's board.
create policy "read open" on public.bingo_board_cards for select using (true);
create policy "tenant write" on public.bingo_board_cards for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

-- bingo_categories (section_id) / bingo_challenge_sections (game_section_id)
create policy "read open" on public.bingo_categories for select using (true);
create policy "tenant write" on public.bingo_categories for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

create policy "read open" on public.bingo_challenge_sections for select using (true);
create policy "tenant write" on public.bingo_challenge_sections for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)));

-- ── 4. Class 3 — gameplay tables ─────────────────────────────
-- Anonymous players keep full write access (they have no auth.uid()), but
-- the permissive policies are now restricted TO anon. Authenticated
-- sessions only reach their own tenant's rows ("Reset all teams" safety).

-- Bingo Dash gameplay
create policy "read open" on public.bingo_teams for select using (true);
create policy "anon write" on public.bingo_teams for insert to anon with check (true);
create policy "anon update" on public.bingo_teams for update to anon using (true) with check (true);
create policy "anon delete" on public.bingo_teams for delete to anon using (true);
create policy "tenant write" on public.bingo_teams for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

do $$
declare t text;
begin
  foreach t in array array['bingo_members', 'bingo_scans', 'bingo_photo_submissions']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "anon write" on public.%I for insert to anon with check (true)
    $f$, t);
    execute format($f$
      create policy "anon update" on public.%I for update to anon using (true) with check (true)
    $f$, t);
    execute format($f$
      create policy "anon delete" on public.%I for delete to anon using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_teams bt
          join public.bingo_sections s on s.id = bt.section_id
          where bt.id = team_id and public.bingo_can_write(s.owner_id)))
        with check (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_teams bt
          join public.bingo_sections s on s.id = bt.section_id
          where bt.id = team_id and public.bingo_can_write(s.owner_id)))
    $f$, t);
  end loop;
end $$;

-- Flag Retrieval gameplay (teams has owner_id directly; children via team)
create policy "read open" on public.teams for select using (true);
create policy "anon write" on public.teams for insert to anon with check (true);
create policy "anon update" on public.teams for update to anon using (true) with check (true);
create policy "anon delete" on public.teams for delete to anon using (true);
create policy "tenant write" on public.teams for all to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));

do $$
declare t text;
begin
  foreach t in array array['team_members', 'team_scans']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "anon write" on public.%I for insert to anon with check (true)
    $f$, t);
    execute format($f$
      create policy "anon update" on public.%I for update to anon using (true) with check (true)
    $f$, t);
    execute format($f$
      create policy "anon delete" on public.%I for delete to anon using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('flag') and exists (
          select 1 from public.teams tm
          where tm.id = team_id and public.bingo_can_write(tm.owner_id)))
        with check (public.can_use_game('flag') and exists (
          select 1 from public.teams tm
          where tm.id = team_id and public.bingo_can_write(tm.owner_id)))
    $f$, t);
  end loop;
end $$;

-- ── 5. Class 4 — bingo_settings (global pointer, owner-only writes) ──
-- Subs move their active board via the set_active_board() RPC instead.
create policy "read open" on public.bingo_settings for select using (true);
create policy "owner insert" on public.bingo_settings for insert to authenticated
  with check (public.is_bingo_owner());
create policy "owner update" on public.bingo_settings for update to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── 6. Class 5 — Flag Retrieval config ───────────────────────
create policy "read open" on public.tasks for select using (true);
create policy "tenant insert" on public.tasks for insert to authenticated
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.tasks for update to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.tasks for delete to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id));

do $$
declare t text;
begin
  foreach t in array array['task_pages', 'task_photos', 'task_links']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('flag') and exists (
          select 1 from public.tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
        with check (public.can_use_game('flag') and exists (
          select 1 from public.tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
    $f$, t);
  end loop;
end $$;

-- settings: DEVIATION from the plan's pure Class 5 — anonymous facilitator
-- pages legitimately write here (briefing-slide sync keys from
-- /instructions/:deckId, ranking order from /projector), so anon writes
-- stay open Class-3 style. Tenant isolation still holds for admin
-- sessions: an authenticated account only reaches its own rows.
create policy "read open" on public.settings for select using (true);
create policy "anon write" on public.settings for insert to anon with check (true);
create policy "anon update" on public.settings for update to anon using (true) with check (true);
create policy "anon delete" on public.settings for delete to anon using (true);
create policy "tenant write" on public.settings for all to authenticated
  using (public.bingo_can_write(owner_id))
  with check (public.bingo_can_write(owner_id));

notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK — paste everything below in one go to instantly restore the
-- pre-hardening permissive posture and un-brick a live event.
-- ============================================================
-- do $$
-- declare p record; t text;
-- begin
--   -- drop all policies created above
--   for p in
--     select policyname, tablename from pg_policies
--     where schemaname = 'public'
--       and tablename in (
--         'bingo_sections', 'bingo_tasks',
--         'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
--         'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
--         'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
--         'bingo_settings',
--         'tasks', 'task_pages', 'task_photos', 'task_links',
--         'teams', 'team_members', 'team_scans',
--         'settings')
--   loop
--     execute format('drop policy %I on public.%I', p.policyname, p.tablename);
--   end loop;
--   -- recreate the legacy fully-permissive posture (open read + open write)
--   foreach t in array array[
--     'bingo_sections', 'bingo_tasks',
--     'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
--     'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
--     'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
--     'bingo_settings',
--     'tasks', 'task_pages', 'task_photos', 'task_links',
--     'teams', 'team_members', 'team_scans',
--     'settings']
--   loop
--     execute format('create policy "rollback read %s" on public.%I for select using (true)', t, t);
--     execute format('create policy "rollback write %s" on public.%I for all using (true) with check (true)', t, t);
--   end loop;
-- end $$;
-- notify pgrst, 'reload schema';
