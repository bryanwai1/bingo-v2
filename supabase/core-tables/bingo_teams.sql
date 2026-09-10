-- bingo_teams: one row per team/group on a board. Created directly in the
-- Supabase dashboard (predates version control) — base columns below are
-- inferred from src/types/database.ts (BingoTeam) since no CREATE TABLE
-- for this table exists in the migration history, only ALTERs.

create table public.bingo_teams (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid not null references public.bingo_sections(id) on delete cascade,
  name            text not null,
  password        text,
  photo_url       text,
  bonus_points    int not null default 0,
  created_at      timestamptz not null default now(),

  -- (tracked) scoreboard/20260813_bingo_bonus_breakdown.sql
  -- Itemised breakdown of the bonus total: [{label, points, at}, ...].
  bonus_breakdown jsonb not null default '[]'::jsonb
);

comment on column public.bingo_teams.bonus_breakdown is 'Itemised breakdown of the bonus total, so the award ceremony can show WHY a team has extra points, not just the number.';

create index bingo_teams_section_idx on public.bingo_teams(section_id);

alter table public.bingo_teams enable row level security;

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

-- Blocks a new team once a board hits bingo_accounts.max_teams_per_board.
-- Function defined in accounts-tenancy/functions.sql.
create trigger on_team_insert_quota
  before insert on public.bingo_teams
  for each row execute function public.enforce_team_quota();

alter publication supabase_realtime add table public.bingo_teams;
