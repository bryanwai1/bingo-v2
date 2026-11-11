-- Plans (owner CRUD) + enroll-by-email. Safe to run more than once.
-- Run in the Supabase SQL Editor (project tetbxjqhfsoipwdnbetm).

-- ── Plans catalogue ──────────────────────────────────────────────────────
create table if not exists public.bingo_plans (
  key                  text primary key,
  name                 text not null,
  max_boards           int  not null default 3 check (max_boards >= 1),
  max_teams_per_board  int  not null default 20 check (max_teams_per_board >= 1),
  default_days         int  check (default_days is null or default_days > 0), -- null = never expires
  sort_order           int  not null default 0,
  created_at           timestamptz not null default now()
);

alter table public.bingo_plans enable row level security;
drop policy if exists "plans readable" on public.bingo_plans;
create policy "plans readable" on public.bingo_plans for select to authenticated using (true);
drop policy if exists "owner writes plans" on public.bingo_plans;
create policy "owner writes plans" on public.bingo_plans for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

insert into public.bingo_plans (key, name, max_boards, max_teams_per_board, default_days, sort_order) values
  ('trial',    'Trial',    1,  10, 14,   0),
  ('standard', 'Standard', 3,  20, 365,  1),
  ('pro',      'Pro',      10, 50, 365,  2)
on conflict (key) do nothing;

-- ── Pending enrolments (email not signed up yet) ─────────────────────────
create table if not exists public.bingo_account_invites (
  email                text primary key check (email = lower(email)),
  plan                 text not null,
  max_boards           int  not null,
  max_teams_per_board  int  not null,
  expires_at           timestamptz,           -- null = never expires
  created_at           timestamptz not null default now()
);

alter table public.bingo_account_invites enable row level security;
drop policy if exists "owner manages invites" on public.bingo_account_invites;
create policy "owner manages invites" on public.bingo_account_invites for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── Signup: an enrolled email is approved straight away with its plan ─────
create or replace function public.handle_new_bingo_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_email constant text := 'bryanwai.design@gmail.com';
  inv public.bingo_account_invites%rowtype;
begin
  insert into public.bingo_accounts (id, email, role, status)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(owner_email) then 'owner'    else 'sub'     end,
    case when lower(new.email) = lower(owner_email) then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;

  select * into inv from public.bingo_account_invites where email = lower(new.email);
  if found and lower(new.email) <> lower(owner_email) then
    -- An UPDATE (not an approved INSERT) so the approval trigger also gives
    -- them the default template board.
    update public.bingo_accounts set
      status = 'approved',
      plan = inv.plan,
      max_boards = inv.max_boards,
      max_teams_per_board = inv.max_teams_per_board,
      plan_expires_at = inv.expires_at
    where id = new.id;
    delete from public.bingo_account_invites where email = inv.email;
  end if;
  return new;
end;
$$;

-- ── Owner: enrol an email ─────────────────────────────────────────────────
-- Existing account -> approved + plan applied now. Unknown email -> stored as
-- an invite that is applied when they first sign up (email or Google).
drop function if exists public.owner_enroll_account(text, text, int, int, timestamptz);
create or replace function public.owner_enroll_account(
  p_email text, p_plan text, p_max_boards int, p_max_teams int, p_expires timestamptz default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  em text := lower(trim(p_email));
  acct uuid;
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  if em is null or em = '' or position('@' in em) = 0 then raise exception 'INVALID_EMAIL'; end if;
  if not exists (select 1 from bingo_plans where key = p_plan) then raise exception 'UNKNOWN_PLAN'; end if;

  select id into acct from bingo_accounts where lower(email) = em and role = 'sub' limit 1;
  if acct is not null then
    update bingo_accounts set
      status = 'approved',
      plan = p_plan,
      max_boards = greatest(1, p_max_boards),
      max_teams_per_board = greatest(1, p_max_teams),
      plan_expires_at = p_expires
    where id = acct;
    return 'applied';
  end if;

  insert into bingo_account_invites (email, plan, max_boards, max_teams_per_board, expires_at)
  values (em, p_plan, greatest(1, p_max_boards), greatest(1, p_max_teams), p_expires)
  on conflict (email) do update set
    plan = excluded.plan,
    max_boards = excluded.max_boards,
    max_teams_per_board = excluded.max_teams_per_board,
    expires_at = excluded.expires_at;
  return 'invited';
end; $$;

grant execute on function public.owner_enroll_account(text,text,int,int,timestamptz) to authenticated;

notify pgrst, 'reload schema';
