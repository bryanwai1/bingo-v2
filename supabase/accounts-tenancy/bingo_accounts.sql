-- bingo_accounts: one row per renter/facilitator identity, keyed 1:1 to
-- auth.users. Source: accounts-tenancy/20260619_bingo_accounts.sql,
-- widened by 007_renter_accounts.sql, 20260702_bingo_account_games.sql,
-- 20260704_facilitators.sql, 20260729_facilitator_sessions.sql.

create table public.bingo_accounts (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'sub'     check (role   in ('owner', 'sub')),
  status      text not null default 'pending'  check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),

  -- (tracked) 007_renter_accounts.sql
  company_name          text,
  contact_name          text,
  phone                 text,
  plan                  text not null default 'trial',
  max_boards            int not null default 3,
  max_teams_per_board   int not null default 20,
  plan_expires_at       timestamptz,
  owner_notes           text,

  -- (tracked) 20260702_bingo_account_games.sql
  can_bingo             boolean not null default true,
  can_flag              boolean not null default false,
  active_section_id     uuid references public.bingo_sections(id) on delete set null,

  -- (tracked) 20260704_facilitators.sql
  -- A facilitator acts on facilitator_host's tenant data instead of their own.
  facilitator_host      uuid references public.bingo_accounts(id) on delete cascade,
  access_expires_at     timestamptz,

  -- (tracked) 20260729_facilitator_sessions.sql
  -- References bingo_facilitator_sessions(id) on delete set null — that
  -- table references this one too (host_id), so the FK is added at the
  -- bottom of accounts-tenancy/bingo_facilitator_sessions.sql instead of
  -- inline here, once both tables exist.
  display_name            text,
  facilitator_session_id  uuid
);

create index bingo_accounts_fac_session_idx on public.bingo_accounts(facilitator_session_id);

alter table public.bingo_accounts enable row level security;

create policy "read own, host, crew, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
    or facilitator_host = auth.uid()
  );
create policy "owner can update accounts" on public.bingo_accounts
  for update using (public.is_bingo_owner());

-- Auto-creates this row on signup; auto-approves the hardcoded owner email.
-- Function defined in accounts-tenancy/functions.sql.
create trigger on_auth_user_created_bingo
  after insert on auth.users
  for each row execute function public.handle_new_bingo_user();

-- Auto-provisions a template-board clone the first time a sub is approved
-- with bingo access. Function defined in accounts-tenancy/functions.sql.
create trigger on_bingo_account_approved
  after update on public.bingo_accounts
  for each row execute function public.handle_bingo_account_approved();

alter publication supabase_realtime add table public.bingo_accounts;
