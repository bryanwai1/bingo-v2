-- bingo_breakout_progress: one row per (team, puzzle), created when a team
-- first solves that puzzle. Source: breakout-hunt/022_breakout_hunt.sql,
-- widened by breakout-hunt/023_breakout_review.sql.
--
-- Two halves to a puzzle, and only one is machine-checkable: decoding it
-- (compared against the stored answer, so it gates the rest) vs. finding
-- the object (a photo, kept as evidence, never auto-verified). The camera
-- only opens once a team has actually solved the puzzle, which also gives
-- a timestamp trail (solved_at before photo taken) worth auditing later.

create table public.bingo_breakout_progress (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.bingo_teams(id) on delete cascade,
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  puzzle_id   uuid not null references public.bingo_breakout_puzzles(id) on delete cascade,
  attempts    int  not null default 0,
  hint_used   boolean not null default false,
  solved_at   timestamptz,
  photo_url   text,
  photo_hash  text,
  photo_at    timestamptz,
  created_at  timestamptz not null default now(),

  -- (tracked) breakout-hunt/023_breakout_review.sql
  -- Whether a team has sent its set in, and what came back. Kept here (not
  -- re-derived from bingo_photo_submissions every render) so the card can
  -- show "waiting", "retake this one" or "approved" per puzzle directly.
  submitted_at   timestamptz,
  review_status  text not null default 'draft'
    constraint bingo_breakout_progress_review_check
    check (review_status in ('draft', 'pending', 'approved', 'rejected')),

  unique (team_id, puzzle_id)
);

create index idx_breakout_progress_team on public.bingo_breakout_progress (team_id, task_id);
-- One photo may not be reused for a second puzzle.
create index idx_breakout_progress_hash on public.bingo_breakout_progress (team_id, task_id, photo_hash);

alter table public.bingo_breakout_progress enable row level security;
create policy breakout_progress_all on public.bingo_breakout_progress for all using (true) with check (true);
