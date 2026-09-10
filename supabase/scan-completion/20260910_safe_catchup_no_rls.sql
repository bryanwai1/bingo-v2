-- ============================================================================
-- SAFE SUBSET of 20260909_combined_catchup.sql — sections 1, 2, 3, 5, 6 only.
--
-- Section 4 (20260703_multitenant_rls — the RLS hardening pass) is
-- deliberately EXCLUDED from this file. Its own header says not to run it on
-- an event day: it drops and recreates every policy on the bingo tables and
-- starts rejecting writes that succeed today, including anonymous
-- /snake-ladder/admin card inserts. Run it separately, in a quiet window.
--
-- Section 5 IS included here even though the original combined file's top
-- comment grouped it with section 4 as "save for later" — its own section
-- header says it's additive and safe ("with no facilitator rows, every
-- rewritten function behaves exactly as before"), and section 6's
-- set_active_board() reads acct.facilitator_host, a column only section 5
-- adds. Skipping section 5 would let section 6 create successfully (acct is
-- an untyped record, so Postgres won't catch the missing field until the
-- function actually runs) and then fail at runtime on first use.
--
-- Fixes the live error: "Could not find the function
-- public.set_active_board(p_section) in the schema cache" — the function
-- (and several others below it) simply doesn't exist yet on this database.
--
-- ⚠ Two statements that need elevated privileges (the auth.users signup
--   trigger and the realtime publication) are wrapped so a privilege error
--   reports a NOTICE instead of rolling back the whole script. If you see
--   "SKIPPED ..." in the output, everything else still applied.
--
-- ⚠ The Supabase SQL editor runs a paste as ONE transaction: any error rolls
--   the whole thing back, so a partial apply is not a risk here.
--
-- IDEMPOTENCE: every "create policy" below has a matching "drop policy if
--   exists" immediately above it (Postgres has no CREATE POLICY IF NOT
--   EXISTS). Tables, indexes and columns already use IF NOT EXISTS;
--   functions use CREATE OR REPLACE; the pack seed is guarded by NOT
--   EXISTS. Re-running this whole script is safe.
--
-- AFTER RUNNING, verify:
--   select proname from pg_proc
--    where proname in ('is_bingo_owner','can_use_game','bingo_can_write',
--                      'set_active_board','import_library_pack');   -- 5 rows
--   select * from public.bingo_settings;                            -- 1 row, id='main'
--   -- then press "Set live" in the admin and re-check active_section_id
--
-- Deferred for a quiet window: section 4 (20260703_multitenant_rls.sql) from
-- supabase/migrations/20260909_combined_catchup.sql.
-- ============================================================================

-- ============================================================================
-- SECTION 1/6 — 20260619_bingo_accounts.sql
-- Accounts table, owner detection (is_bingo_owner), signup trigger, owner_id columns
-- ============================================================================

-- ============================================================
-- Bingo Dash — Accounts foundation (Stage 1 of multi-tenant accounts)
-- ============================================================
-- Adds authenticated accounts with an owner/sub + approval model, and
-- ownership columns on the shared card library (bingo_tasks) and private
-- boards (bingo_sections). This migration is ADDITIVE ONLY — it does not
-- change any existing RLS policy, so current anonymous admin/participant
-- access keeps working exactly as before. RLS hardening is a later stage.
--
-- Ownership semantics:
--   owner_id IS NULL      → legacy data, treated as belonging to the main
--                           (owner) account. All existing cards/boards are NULL.
--   owner_id = <auth uid> → created by that account.
-- Cards (bingo_tasks) are a SHARED library: everyone can see them; only the
-- owner of a card (or the main account) may edit it. Boards (bingo_sections)
-- are PRIVATE: each account manages only its own.
-- ============================================================

-- 1. Per-user profile, keyed to Supabase Auth users -----------------------
create table if not exists public.bingo_accounts (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'sub'     check (role   in ('owner', 'sub')),
  status      text not null default 'pending'  check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);

alter table public.bingo_accounts enable row level security;

-- Helper predicates (SECURITY DEFINER so they can read bingo_accounts without
-- tripping the table's own RLS — avoids infinite recursion in policies).
create or replace function public.is_bingo_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and role = 'owner' and status = 'approved'
  );
$$;

create or replace function public.is_bingo_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and status = 'approved'
  );
$$;

-- RLS for bingo_accounts: you can read your own row; the owner can read and
-- update every row (to approve / reject / promote). Inserts come from the
-- signup trigger below (SECURITY DEFINER), so no INSERT policy is needed.
drop policy if exists "read own or owner-all" on public.bingo_accounts;
drop policy if exists "read own or owner-all" on public.bingo_accounts;
create policy "read own or owner-all" on public.bingo_accounts
  for select using (id = auth.uid() or public.is_bingo_owner());

drop policy if exists "owner can update accounts" on public.bingo_accounts;
drop policy if exists "owner can update accounts" on public.bingo_accounts;
create policy "owner can update accounts" on public.bingo_accounts
  for update using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- 2. Auto-create a profile when a user signs up --------------------------
-- The designated main account is auto-approved as owner; everyone else lands
-- as a pending sub awaiting the owner's approval. Change the email below (or
-- promote manually with the UPDATE at the bottom) if your main login differs.
create or replace function public.handle_new_bingo_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_email constant text := 'bryanwai.design@gmail.com';
begin
  insert into public.bingo_accounts (id, email, role, status)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(owner_email) then 'owner'    else 'sub'     end,
    case when lower(new.email) = lower(owner_email) then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- WRAPPED for the combined run: creating a trigger on auth.users needs
-- ownership of that table, which the SQL editor's role does not always have.
-- A privilege error here used to roll back the ENTIRE script, so it is now
-- caught and reported. Consequence if it is skipped: new signups do not get a
-- bingo_accounts row automatically (existing accounts, including the owner,
-- are unaffected) — create those rows by hand, or run just this block as a
-- Supabase admin later.
do $trg$
begin
  drop trigger if exists on_auth_user_created_bingo on auth.users;
  create trigger on_auth_user_created_bingo
    after insert on auth.users
    for each row execute function public.handle_new_bingo_user();
  raise notice 'auth.users signup trigger installed';
exception
  when insufficient_privilege or undefined_table then
    raise notice 'SKIPPED auth.users trigger (%): new signups will need a manual bingo_accounts row', sqlerrm;
end
$trg$;

-- 3. Ownership columns ---------------------------------------------------
-- Nullable; NULL = main/owner (all existing rows). New rows get the creator's
-- uid (set by the app, and defended by RLS in a later stage).
alter table public.bingo_tasks    add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.bingo_sections add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists bingo_tasks_owner_idx    on public.bingo_tasks(owner_id);
create index if not exists bingo_sections_owner_idx on public.bingo_sections(owner_id);

-- 4. Realtime for the accounts table (so the owner's approval panel updates
--    live as people sign up). Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bingo_accounts'
  ) then
    -- WRAPPED: adding to the realtime publication needs elevated rights on
    -- some projects. Only the owner's live approval panel depends on it.
    begin
      execute 'alter publication supabase_realtime add table public.bingo_accounts';
    exception when insufficient_privilege or undefined_object then
      raise notice 'SKIPPED realtime publication for bingo_accounts (%)', sqlerrm;
    end;
  end if;
end $$;

-- ── Manual owner promotion (run once AFTER you have signed up, if your main
--    account email is not the one hard-coded above) ──────────────────────
-- update public.bingo_accounts
--   set role = 'owner', status = 'approved'
--   where lower(email) = lower('your-real-email@example.com');

-- ============================================================================
-- SECTION 2/6 — 20260702_bingo_account_games.sql
-- Per-account game toggles, can_use_game(), set_active_board() v1
-- ============================================================================

-- ============================================================
-- Rental accounts, step 1/3: per-account game toggles + active board
-- Run in the Supabase SQL editor BEFORE 20260702_bingo_template_clone.sql.
-- ADDITIVE ONLY — the deployed app keeps working unchanged until the
-- Phase B build ships. Safe to run any time.
-- ============================================================

-- 1. Game permissions + per-account active board pointer.
--    can_bingo defaults true (matches today's implicit behavior for
--    approved subs); can_flag is opt-in per account.
alter table public.bingo_accounts
  add column if not exists can_bingo boolean not null default true,
  add column if not exists can_flag  boolean not null default false,
  add column if not exists active_section_id uuid references public.bingo_sections(id) on delete set null;

update public.bingo_accounts set can_bingo = true, can_flag = true where role = 'owner';

-- 2. Per-game access check, used by RLS (Phase C) and mirrored by the UI gate.
create or replace function public.can_use_game(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid()
      and status = 'approved'
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- 3. Per-account active board. A SECURITY DEFINER RPC instead of a
--    self-UPDATE policy on bingo_accounts: WITH CHECK cannot compare old
--    vs new values, so a plain policy would let a sub flip their own
--    status/role while updating active_section_id.
--    The owner's call also updates the global bingo_settings pointer so
--    the anonymous home/registration/projector/sample pages keep working
--    as the owner's front door.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bingo_accounts where id = auth.uid() and status = 'approved'
  ) then
    raise exception 'not an approved account';
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and (s.owner_id = auth.uid() or (s.owner_id is null and public.is_bingo_owner()))
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION 3/6 — 010_shared_library.sql
-- Shared library packs + import_library_pack(), AI Team Building seed
-- ============================================================================

-- ============================================================
-- Shared card library — content packs every renter can pull from.
--
-- AI Team Building used to be a hardcoded array only the house account
-- could import. Now it is owner-authored rows any tenant can browse and
-- copy into their own board. Copy-on-use: the renter gets their own
-- editable card, so their changes never touch the source or each other.
-- ============================================================

create table if not exists public.bingo_library_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  emoji       text not null default '📦',
  is_public   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.bingo_library_cards (
  id            uuid primary key default gen_random_uuid(),
  pack_id       uuid not null references public.bingo_library_packs(id) on delete cascade,
  title         text not null,
  category      text not null default '',
  color         text not null default '',
  hex_code      text not null default '#8b5cf6',
  points        int  not null default 50,
  task_type     text not null default 'standard',
  is_contest    boolean not null default false,
  contest_bonus int not null default 0,
  contest_game  text not null default 'speed-edit',
  body          jsonb not null default '{}'::jsonb,   -- pages, pointers, examples
  sort_order    int not null default 0
);

create index if not exists bingo_library_cards_pack_idx on public.bingo_library_cards(pack_id);

alter table public.bingo_library_packs enable row level security;
alter table public.bingo_library_cards enable row level security;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('bingo_library_packs','bingo_library_cards')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Every approved account may browse public packs; only the owner authors them.
drop policy if exists "read public packs" on public.bingo_library_packs;
create policy "read public packs" on public.bingo_library_packs
  for select using (is_public or public.is_bingo_owner());
drop policy if exists "owner writes packs" on public.bingo_library_packs;
create policy "owner writes packs" on public.bingo_library_packs
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

drop policy if exists "read public cards" on public.bingo_library_cards;
create policy "read public cards" on public.bingo_library_cards
  for select using (exists (select 1 from bingo_library_packs p
                            where p.id = pack_id and (p.is_public or public.is_bingo_owner())));
drop policy if exists "owner writes cards" on public.bingo_library_cards;
create policy "owner writes cards" on public.bingo_library_cards
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── Copy a whole pack into a caller's board ─────────────────
create or replace function public.import_library_pack(p_pack uuid, p_section uuid)
returns json language plpgsql security definer set search_path = public as $$
declare sec record; c record; n int := 0; skipped int := 0;
begin
  select * into sec from bingo_sections where id = p_section;
  if not found then raise exception 'BOARD_NOT_FOUND'; end if;
  if not (public.is_bingo_owner() or public.bingo_can_write(sec.owner_id)) then
    raise exception 'NOT_YOUR_BOARD';
  end if;

  for c in select * from bingo_library_cards where pack_id = p_pack order by sort_order
  loop
    -- Idempotent: pressing Import twice must not double the library.
    if exists (select 1 from bingo_tasks t
               where t.section_id = p_section and lower(t.title) = lower(c.title)) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into bingo_tasks (section_id, owner_id, title, color, hex_code, category,
                             points, sort_order, in_grid, task_type,
                             is_contest, contest_bonus, contest_game)
    values (p_section, sec.owner_id, c.title, c.color, c.hex_code, c.category,
            c.points, c.sort_order, false, c.task_type,
            c.is_contest, c.contest_bonus, c.contest_game);
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'created', n, 'skipped', skipped);
end; $$;

grant execute on function public.import_library_pack(uuid, uuid) to authenticated;

-- ── Seed the AI Team Building pack ──────────────────────────
insert into public.bingo_library_packs (name, description, emoji, sort_order)
select 'AI Team Building', 'Ten AI-led activities for corporate teams — prompting, generation and judgement under time pressure.', '🤖', 0
where not exists (select 1 from bingo_library_packs where name = 'AI Team Building');

insert into public.bingo_library_cards (pack_id, title, category, color, hex_code, points, is_contest, contest_bonus, sort_order)
select p.id, v.title, 'AI Team Building', 'AI', v.hex, v.pts, v.contest, v.bonus, v.ord
from bingo_library_packs p,
(values
  ('Speed Edit Showdown', '#dc2626', 100, true,  150, 0),
  ('Prompt Relay',        '#7c3aed', 75,  false, 0,   1),
  ('AI Portrait Studio',  '#ec4899', 75,  false, 0,   2),
  ('Caption This',        '#f59e0b', 50,  false, 0,   3),
  ('Style Transfer Race', '#06b6d4', 75,  true,  100, 4),
  ('The Brief Builder',   '#10b981', 100, false, 0,   5),
  ('Hallucination Hunt',  '#ef4444', 75,  false, 0,   6),
  ('One-Word Prompt',     '#8b5cf6', 50,  false, 0,   7),
  ('Team Mascot Design',  '#3b82f6', 75,  false, 0,   8),
  ('Pitch It With AI',    '#f97316', 100, false, 0,   9)
) as v(title, hex, pts, contest, bonus, ord)
where p.name = 'AI Team Building'
  and not exists (select 1 from bingo_library_cards c where c.pack_id = p.id and c.title = v.title);

notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION 5/6 — 20260704_facilitators.sql
-- Facilitator support; redefines can_use_game/bingo_can_write/set_active_board
-- ============================================================================

-- ============================================================
-- Facilitator logins: temporary event helpers working ON a host's data
--
-- A facilitator is a bingo_accounts row with facilitator_host set. They get
-- full admin powers over the HOST's tenant (host = owner -> house data,
-- owner_id NULL; host = sub -> that sub's rows) until access_expires_at.
-- They never own data of their own and never get a template board clone.
--
-- ADDITIVE + safe to run before the app deploy: with no facilitator rows,
-- every rewritten function behaves exactly as before (the extra expiry
-- check is NULL -> passes for all existing accounts).
-- Run in the Supabase SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. Columns ──────────────────────────────────────────────
alter table public.bingo_accounts
  add column if not exists facilitator_host uuid references public.bingo_accounts(id) on delete cascade,
  add column if not exists access_expires_at timestamptz;

-- ── 2. can_use_game: expired accounts lose game access ──────
create or replace function public.can_use_game(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid()
      and status = 'approved'
      and (access_expires_at is null or now() < access_expires_at)
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- ── 3. bingo_can_write: owner passes; else approved + unexpired AND
--       (own rows OR the host tenant's rows when facilitating).
--       The approved/unexpired check matters here (not just in
--       can_use_game) because the `settings` policy uses bingo_can_write
--       alone.
create or replace function public.bingo_can_write(row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner()
    or exists (
      select 1 from public.bingo_accounts a
      where a.id = auth.uid()
        and a.status = 'approved'
        and (a.access_expires_at is null or now() < a.access_expires_at)
        and (
          row_owner = a.id
          or exists (
            select 1 from public.bingo_accounts h
            where h.id = a.facilitator_host
              and ((h.role = 'owner' and row_owner is null)
                or (h.role <> 'owner' and row_owner = h.id))
          )
        )
    );
$$;

-- ── 4. set_active_board: accept facilitators. The board must belong to
--       the caller's WORKING tenant (host tenant when facilitating). Only
--       the caller's own active_section_id moves; the global
--       bingo_settings pointer stays owner-only.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acct record;
  host_role text;
  tenant_owner uuid;  -- effective tenant: NULL = house (owner) data
begin
  select * into acct from bingo_accounts
   where id = auth.uid()
     and status = 'approved'
     and (access_expires_at is null or now() < access_expires_at);
  if not found then
    raise exception 'not an approved account';
  end if;

  if acct.facilitator_host is not null then
    select role into host_role from bingo_accounts where id = acct.facilitator_host;
    if host_role = 'owner' then
      tenant_owner := null;
    else
      tenant_owner := acct.facilitator_host;
    end if;
  elsif acct.role = 'owner' then
    tenant_owner := null;
  else
    tenant_owner := acct.id;
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and ((tenant_owner is null and s.owner_id is null)
        or s.owner_id = tenant_owner)
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

-- ── 5. Approval clone trigger: facilitators never get a template clone —
--       they work on the host's boards, not their own.
create or replace function public.handle_bingo_account_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if new.role = 'sub'
     and new.status = 'approved'
     and new.can_bingo
     and new.facilitator_host is null
     and (old.status is distinct from 'approved' or old.can_bingo is distinct from new.can_bingo)
     and not exists (select 1 from bingo_sections where owner_id = new.id)
  then
    select template_section_id into tmpl from bingo_settings where id = 'main';
    if tmpl is not null then
      new_board := public.clone_bingo_board(tmpl, new.id);
      update bingo_accounts set active_section_id = new_board where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

-- ── 6. Let a facilitator read their host's account row ──────
-- SECURITY DEFINER helper avoids RLS recursion inside the policy.
create or replace function public.my_facilitator_host()
returns uuid language sql stable security definer set search_path = public as $$
  select facilitator_host from public.bingo_accounts where id = auth.uid();
$$;

drop policy if exists "read own or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
create policy "read own, host, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- SECTION 6/6 — 20260909_bingo_settings_main_row.sql
-- Seed the bingo_settings 'main' row; set_active_board() upserts it
-- ============================================================================

-- ============================================================
-- bingo_settings: guarantee the 'main' row exists
--
-- Symptom: every admin / home / projector load logged a 406 from
--   GET /rest/v1/bingo_settings?select=*&id=eq.main
--   {"code":"PGRST116","details":"The result contains 0 rows"}
-- because bingo_settings was empty — the singleton row was never seeded on
-- this database.
--
-- The real damage was quieter than the console noise: set_active_board()
-- moves the owner's global pointer with
--   update bingo_settings set active_section_id = p_section where id = 'main'
-- which matched zero rows, so "Set live" appeared to work while the
-- anonymous front door (/bingo-dash, the projector, the sample board) still
-- had no active board to read.
--
-- Safe to run more than once, and safe on an event day: it adds a row and
-- redefines one function, touching no existing data.
-- ============================================================

-- ── 1. Seed the singleton ───────────────────────────────────
-- Every column carries a default, so the id alone is enough.
insert into public.bingo_settings (id) values ('main')
on conflict (id) do nothing;

-- ── 2. Make the owner pointer write self-healing ────────────
-- Identical to the 20260704_facilitators.sql version except for the final
-- block: an upsert instead of a bare update, so a missing row can never
-- silently swallow the write again.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acct record;
  host_role text;
  tenant_owner uuid;  -- effective tenant: NULL = house (owner) data
begin
  select * into acct from bingo_accounts
   where id = auth.uid()
     and status = 'approved'
     and (access_expires_at is null or now() < access_expires_at);
  if not found then
    raise exception 'not an approved account';
  end if;

  if acct.facilitator_host is not null then
    select role into host_role from bingo_accounts where id = acct.facilitator_host;
    if host_role = 'owner' then
      tenant_owner := null;
    else
      tenant_owner := acct.facilitator_host;
    end if;
  elsif acct.role = 'owner' then
    tenant_owner := null;
  else
    tenant_owner := acct.id;
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and ((tenant_owner is null and s.owner_id is null)
        or s.owner_id = tenant_owner)
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  -- Owner-only: the global pointer the anonymous pages read.
  if public.is_bingo_owner() then
    insert into bingo_settings (id, active_section_id)
      values ('main', p_section)
    on conflict (id) do update set active_section_id = excluded.active_section_id;
  end if;
end;
$$;

-- Verify after running:
--   select * from public.bingo_settings;              -- exactly one 'main' row
--   -- then press "Set live" in the admin and re-check active_section_id

-- ============================================================================
-- End of combined script. PostgREST is told to reload its schema cache by the
-- sections above; if an RPC still 404s from the app, run:
--   notify pgrst, 'reload schema';
-- ============================================================================
