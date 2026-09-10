-- Breakout Hunt — 10 puzzles, each pointing at an object to find in the venue.
--
-- Two halves, and only one of them is machine-checkable:
--   decoding the puzzle  -> compared against the stored answer, so it gates
--   finding the object   -> a photo, kept as evidence, never auto-verified
--
-- Progress therefore unlocks on the answer and the camera opens only once a
-- team has actually solved the puzzle, which also gives a timestamp trail
-- (solved_at before photo taken) worth auditing after the event.

-- The puzzle bank for one card. Editable per venue from the card's edit page.
create table if not exists bingo_breakout_puzzles (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references bingo_tasks(id) on delete cascade,
  position    int  not null,
  -- The puzzle itself: an uploaded image, and/or a short text/emoji rebus.
  image_url   text,
  prompt      text,
  -- What it points to, plus spellings that should also pass.
  answer      text not null,
  aliases     text[] not null default '{}',
  hint        text,
  created_at  timestamptz not null default now(),
  unique (task_id, position)
);

-- One row per team per puzzle, created when they first solve it.
create table if not exists bingo_breakout_progress (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references bingo_teams(id) on delete cascade,
  task_id     uuid not null references bingo_tasks(id) on delete cascade,
  puzzle_id   uuid not null references bingo_breakout_puzzles(id) on delete cascade,
  attempts    int  not null default 0,
  hint_used   boolean not null default false,
  solved_at   timestamptz,
  photo_url   text,
  photo_hash  text,
  photo_at    timestamptz,
  created_at  timestamptz not null default now(),
  unique (team_id, puzzle_id)
);

create index if not exists idx_breakout_puzzles_task
  on bingo_breakout_puzzles (task_id, position);
create index if not exists idx_breakout_progress_team
  on bingo_breakout_progress (team_id, task_id);
-- One photo may not be reused for a second puzzle.
create index if not exists idx_breakout_progress_hash
  on bingo_breakout_progress (team_id, task_id, photo_hash);

-- Admit the new card type.
alter table bingo_tasks drop constraint if exists bingo_tasks_task_type_check;
alter table bingo_tasks add constraint bingo_tasks_task_type_check
  check (task_type in ('standard', 'answer', 'photo', 'sign_splice', 'breakout_hunt'));

-- Participants play without an account, as with every other participant-facing
-- bingo table.
alter table bingo_breakout_puzzles enable row level security;
alter table bingo_breakout_progress enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_breakout_puzzles' and policyname = 'breakout_puzzles_all') then
    create policy breakout_puzzles_all on bingo_breakout_puzzles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_breakout_progress' and policyname = 'breakout_progress_all') then
    create policy breakout_progress_all on bingo_breakout_progress for all using (true) with check (true);
  end if;
end $$;
