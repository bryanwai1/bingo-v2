-- bingo_sign_splice_titles: one locked title per (team, card) for the
-- Sign Splice letter-hunt game — locked once set, admin unlocks.
-- Source: sign-splice/019_sign_splice.sql.
--
-- Ported from the mall-hunt prototype's SQLite schema (teams/letters/
-- submissions). Teams and tasks already exist in bingo, so only the two
-- game-specific tables (this one + bingo_sign_splice_letters) were new;
-- "submissions" collapsed into the letter row plus bingo_sign_splice_photos,
-- a small hash log used for the duplicate-photo rules.

create table public.bingo_sign_splice_titles (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.bingo_teams(id) on delete cascade,
  task_id      uuid not null references public.bingo_tasks(id) on delete cascade,
  title        text not null,
  locked       boolean not null default true,
  final_url    text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (team_id, task_id)
);

-- Participants play without an account, exactly as they do for photo
-- submissions, so this follows the same open-access pattern as the rest of
-- the participant-facing bingo tables.
alter table public.bingo_sign_splice_titles enable row level security;
create policy ss_titles_all on public.bingo_sign_splice_titles for all using (true) with check (true);
