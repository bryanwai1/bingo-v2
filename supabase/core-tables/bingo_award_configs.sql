-- bingo_award_configs: one row per board's award-ceremony slide config
-- (podium counts, branding, per-slide point cutoffs). No CREATE TABLE for
-- this table exists in the migration history — columns are inferred from
-- src/types/database.ts (BingoAwardConfig), corroborated by the insert list
-- in clone_bingo_board(). Columns marked (tracked) came from an explicit
-- ALTER TABLE in that history.

create table public.bingo_award_configs (
  id                        uuid primary key default gen_random_uuid(),
  section_id                uuid not null references public.bingo_sections(id) on delete cascade,
  total_points              int,
  image_url                 text,
  consolation_count         int not null default 0,
  third_count               int not null default 1,
  second_count              int not null default 1,
  first_count               int not null default 1,
  slide_order               text[] not null default '{}',
  slide_points               jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),

  -- (tracked) scoreboard/20260427_award_main_and_groups.sql
  consolation_group_count   int not null default 0,
  holding_title             text,
  main_title                text,
  main_subtitle             text,
  main_tagline              text
);

alter table public.bingo_award_configs enable row level security;

-- Deliberately NOT part of the 20260703 multitenant hardening pass (that
-- migration's own comment excludes this table by name) — final state is
-- what accounts-tenancy/008a_drop_dead_tables.sql left behind: it replaced
-- an earlier fully-open "award_configs_all" policy with the tenant-scoped
-- pair below, plus a read-scoped policy layered on top by 008b.
create policy "read open" on public.bingo_award_configs for select using (true);
create policy "read scoped" on public.bingo_award_configs for select
  using (public.can_read_section(section_id));
create policy "tenant write" on public.bingo_award_configs for all to authenticated
  using (exists (select 1 from public.bingo_sections s
                 where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (exists (select 1 from public.bingo_sections s
                      where s.id = section_id and public.bingo_can_write(s.owner_id)));
