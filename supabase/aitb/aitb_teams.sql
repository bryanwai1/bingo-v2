-- aitb_teams: teams for the standalone AI Team Building marathon app
-- (/aitb). Distinct from bingo_teams — not referenced by any bingo card
-- sub-feature table. Source: aitb/20260723_aitb.sql, widened by
-- aitb/20260723_aitb_adjust.sql.

create table public.aitb_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#fb7185',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- (tracked) aitb/20260723_aitb_adjust.sql
  -- Manual per-team points adjustment, editable in the AITB admin. Positive
  -- or negative; added on top of the computed progress points everywhere
  -- totals show.
  adjust int not null default 0
);

alter table public.aitb_teams enable row level security;
create policy "anon rw aitb_teams" on public.aitb_teams for all using (true) with check (true);

alter publication supabase_realtime add table public.aitb_teams;
