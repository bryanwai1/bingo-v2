-- Lock "manage accounts" and the shared card library to the owner, in the DATABASE.
--
-- WHY: the live database carries a policy named "app_all" (USING true / CHECK
-- true, roles anon + authenticated) on these tables. It was never in this repo.
-- Postgres ORs permissive policies together, so "app_all" overrides every
-- owner-only rule below it: anyone holding the public anon key could read all
-- account rows (emails) and change accounts, shared cards and settings. The UI
-- hid those controls from tenants, but the UI is not a security boundary.
--
-- WHAT THIS DOES (idempotent; run in the SQL editor):
--   1. remove_crew_member(): the tenant host's "remove one crew member" button
--      used a direct UPDATE on bingo_accounts, which only worked because of
--      app_all. It becomes a checked RPC (owner, or the crew member's host).
--   2. bingo_accounts      read: own row, own host, own crew, or owner; write: owner only
--   3. bingo_settings      read: everyone; write: owner only
--   4. bingo_tasks         read: everyone; write: tenant-own rows / owner (shared cards
--      are owner_id NULL, so only the owner can create, edit or delete them)
--      bingo_task_pages / _photos / _links  read: everyone; write: existing rule
--   5. Owner-only functions stop being callable by anon. They already refuse
--      non-owners inside, this just closes the door earlier.
--
-- NOT TOUCHED here: board tables (see 20261121_lock_board_tables.sql), player
-- tables (teams, members, scans, submissions), events, settings (per-tenant keys).

-- ── 1. checked replacement for the direct UPDATE on bingo_accounts ─────────
create or replace function public.remove_crew_member(p_account uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from bingo_accounts where id = p_account;
  if not found then raise exception 'account not found'; end if;
  if not coalesce(public.is_bingo_owner() or a.facilitator_host = auth.uid(), false) then
    raise exception 'not your crew member';
  end if;
  update bingo_accounts set access_expires_at = now() where id = p_account;
end; $$;

-- ── 2. bingo_accounts ───────────────────────────────────────────────────────
drop policy if exists "app_all" on public.bingo_accounts;
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, crew, or owner-all" on public.bingo_accounts;
create policy "read own, host, crew, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
    or facilitator_host = auth.uid()
  );
-- "owner can update accounts" already exists live; recreate so a fresh install matches.
drop policy if exists "owner can update accounts" on public.bingo_accounts;
create policy "owner can update accounts" on public.bingo_accounts
  for update using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── 3. bingo_settings (global row 'main': live-board pointer, template board) ─
drop policy if exists "app_all" on public.bingo_settings;
drop policy if exists "read open" on public.bingo_settings;
drop policy if exists "owner insert" on public.bingo_settings;
drop policy if exists "owner update" on public.bingo_settings;
create policy "read open" on public.bingo_settings for select using (true);
create policy "owner insert" on public.bingo_settings for insert to authenticated
  with check (public.is_bingo_owner());
create policy "owner update" on public.bingo_settings for update to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── 4. shared card library: bingo_tasks and its child tables ───────────────
drop policy if exists "app_all" on public.bingo_tasks;
drop policy if exists "read open" on public.bingo_tasks;
drop policy if exists "tenant insert" on public.bingo_tasks;
create policy "read open" on public.bingo_tasks for select using (true);
create policy "tenant insert" on public.bingo_tasks for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
-- "tenant update" / "tenant delete" (bingo_can_edit_task) already exist live.

drop policy if exists "app_all" on public.bingo_task_pages;
drop policy if exists "read open" on public.bingo_task_pages;
create policy "read open" on public.bingo_task_pages for select using (true);

drop policy if exists "app_all" on public.bingo_task_photos;
drop policy if exists "read open" on public.bingo_task_photos;
create policy "read open" on public.bingo_task_photos for select using (true);

drop policy if exists "app_all" on public.bingo_task_links;
drop policy if exists "read open" on public.bingo_task_links;
create policy "read open" on public.bingo_task_links for select using (true);

-- ── 5. owner-only functions: not callable while signed out ─────────────────
-- Revoking from PUBLIC also removes authenticated's inherited right, so grant it
-- back explicitly. clone_bingo_board is only called by other functions: no one
-- calls it from the browser, so nobody gets it.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'owner_delete_account', 'owner_enroll_account', 'owner_preview_account_sync',
         'owner_set_account_active_board', 'owner_sync_account_boards', 'owner_undo_board_sync',
         'set_account_plan', 'admin_clone_template_for', 'create_facilitator_session',
         'end_facilitator_session', 'set_active_board', 'remove_crew_member',
         'create_event', 'join_event', 'update_my_profile', 'push_board_copy_to_library')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'clone_bingo_board'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
