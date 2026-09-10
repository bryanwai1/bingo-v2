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
create policy "read own or owner-all" on public.bingo_accounts
  for select using (id = auth.uid() or public.is_bingo_owner());

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

drop trigger if exists on_auth_user_created_bingo on auth.users;
create trigger on_auth_user_created_bingo
  after insert on auth.users
  for each row execute function public.handle_new_bingo_user();

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
    execute 'alter publication supabase_realtime add table public.bingo_accounts';
  end if;
end $$;

-- ── Manual owner promotion (run once AFTER you have signed up, if your main
--    account email is not the one hard-coded above) ──────────────────────
-- update public.bingo_accounts
--   set role = 'owner', status = 'approved'
--   where lower(email) = lower('your-real-email@example.com');
