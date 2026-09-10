-- ============================================================
-- Rental accounts: identity, plan limits, self-service.
--
-- Tenancy already works — bingo_can_write(owner_id) isolates every
-- account's boards, teams and scores. What was missing is the product
-- layer around it: who the renter is, what they are allowed, and a way
-- for them to run their own events without going through the owner.
--
-- Owner (Bryan) keeps absolute override everywhere via is_bingo_owner().
-- ============================================================

alter table public.bingo_accounts
  add column if not exists company_name        text,
  add column if not exists contact_name        text,
  add column if not exists phone               text,
  add column if not exists plan                text    not null default 'trial',
  add column if not exists max_boards          int     not null default 3,
  add column if not exists max_teams_per_board int     not null default 20,
  add column if not exists plan_expires_at     timestamptz,
  add column if not exists owner_notes         text;

comment on column public.bingo_accounts.owner_notes is
  'Private notes visible to the owner only — never exposed to the renter.';
comment on column public.bingo_accounts.plan is
  'trial | standard | pro — drives the limits below. Owner is unlimited.';

-- ── Board quota ─────────────────────────────────────────────
-- Enforced in a trigger rather than a policy: RLS cannot count sibling
-- rows cheaply, and a renter hitting the cap should get a clear message,
-- not a silent permission failure mid-event.
create or replace function public.enforce_board_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare acct record; n int;
begin
  if new.owner_id is null then return new; end if;      -- house board
  select * into acct from bingo_accounts where id = new.owner_id;
  if not found or acct.role = 'owner' then return new; end if;

  select count(*) into n from bingo_sections where owner_id = new.owner_id;
  if n >= acct.max_boards then
    raise exception 'BOARD_LIMIT_REACHED: your plan allows % board(s). Contact the organiser to raise it.', acct.max_boards;
  end if;
  return new;
end; $$;

drop trigger if exists on_section_insert_quota on public.bingo_sections;
create trigger on_section_insert_quota
  before insert on public.bingo_sections
  for each row execute function public.enforce_board_quota();

-- ── Team quota ──────────────────────────────────────────────
create or replace function public.enforce_team_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare sec record; acct record; n int;
begin
  select * into sec from bingo_sections where id = new.section_id;
  if not found or sec.owner_id is null then return new; end if;
  select * into acct from bingo_accounts where id = sec.owner_id;
  if not found or acct.role = 'owner' then return new; end if;

  select count(*) into n from bingo_teams where section_id = new.section_id;
  if n >= acct.max_teams_per_board then
    raise exception 'TEAM_LIMIT_REACHED: this board allows % team(s).', acct.max_teams_per_board;
  end if;
  return new;
end; $$;

drop trigger if exists on_team_insert_quota on public.bingo_teams;
create trigger on_team_insert_quota
  before insert on public.bingo_teams
  for each row execute function public.enforce_team_quota();

-- ── Renter self-service profile edit ────────────────────────
-- A SECURITY DEFINER RPC, not a self-UPDATE policy: WITH CHECK cannot
-- compare old vs new, so a policy would let a renter flip their own
-- role, status or limits while "editing their profile".
create or replace function public.update_my_profile(
  p_company text default null,
  p_contact text default null,
  p_phone   text default null,
  p_display text default null
) returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update bingo_accounts set
    company_name = coalesce(nullif(trim(p_company), ''), company_name),
    contact_name = coalesce(nullif(trim(p_contact), ''), contact_name),
    phone        = coalesce(nullif(trim(p_phone),   ''), phone),
    display_name = coalesce(nullif(trim(p_display), ''), display_name)
  where id = auth.uid();
  return json_build_object('ok', true);
end; $$;

-- ── Owner-only: set a renter's plan and limits ──────────────
create or replace function public.set_account_plan(
  p_account uuid, p_plan text, p_max_boards int,
  p_max_teams int, p_expires timestamptz default null
) returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  update bingo_accounts set
    plan = coalesce(p_plan, plan),
    max_boards = greatest(1, coalesce(p_max_boards, max_boards)),
    max_teams_per_board = greatest(1, coalesce(p_max_teams, max_teams_per_board)),
    plan_expires_at = p_expires
  where id = p_account;
  return json_build_object('ok', true);
end; $$;

-- ── What a renter may see about their own account ───────────
create or replace view public.my_account_summary as
select a.id, a.email, a.company_name, a.contact_name, a.phone,
       a.display_name, a.plan, a.max_boards, a.max_teams_per_board,
       a.plan_expires_at, a.status, a.role,
       (select count(*) from bingo_sections s where s.owner_id = a.id) as boards_used,
       (select count(*) from bingo_facilitator_sessions f
         where f.host_id = a.id and not f.revoked and f.expires_at > now()) as active_crew_passes
from bingo_accounts a
where a.id = auth.uid();

grant select on public.my_account_summary to authenticated;
grant execute on function public.update_my_profile(text,text,text,text) to authenticated;
grant execute on function public.set_account_plan(uuid,text,int,int,timestamptz) to authenticated;

notify pgrst, 'reload schema';
