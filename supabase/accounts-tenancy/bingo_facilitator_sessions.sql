-- bingo_facilitator_sessions: one shareable code+PIN event pass per host,
-- letting crew join anonymously as facilitators working on the host's
-- tenant instead of getting their own empty board.
-- Source: accounts-tenancy/20260729_facilitator_sessions.sql.
--
-- Prerequisite: enable Anonymous sign-ins in the Supabase dashboard
-- (Authentication → Sign In / Providers → Anonymous sign-ins → ON) —
-- without it /bingo-dash/join-crew cannot sign anyone in.

create table public.bingo_facilitator_sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  pin         text not null,
  -- Whose tenant the crew works on. Owner host -> house rows (owner_id NULL),
  -- sub host -> that sub's rows. Mirrors bingo_accounts.facilitator_host.
  host_id     uuid not null references public.bingo_accounts(id) on delete cascade,
  label       text not null default 'Event session',
  expires_at  timestamptz not null,
  max_uses    int,                              -- NULL = unlimited seats
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_by  uuid references public.bingo_accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index bingo_fac_sessions_host_idx on public.bingo_facilitator_sessions(host_id);

alter table public.bingo_facilitator_sessions enable row level security;

-- The owner sees every pass; a sub host sees only their own. Players and
-- joining facilitators never read this table directly — they go through the
-- SECURITY DEFINER functions in accounts-tenancy/functions.sql, which never
-- expose the PIN.
create policy "hosts manage own passes" on public.bingo_facilitator_sessions
  for all
  using (public.is_bingo_owner() or host_id = auth.uid())
  with check (public.is_bingo_owner() or host_id = auth.uid());

-- Deferred from accounts-tenancy/bingo_accounts.sql: that table's
-- facilitator_session_id references this one, and this table's host_id
-- references that one — a genuine circular FK, so the second constraint has
-- to be added once both tables exist.
alter table public.bingo_accounts
  add constraint bingo_accounts_facilitator_session_id_fkey
  foreign key (facilitator_session_id) references public.bingo_facilitator_sessions(id) on delete set null;
