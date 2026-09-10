-- bingo_breakout_puzzles: the puzzle bank for one Breakout Hunt card —
-- each puzzle points at an object to find in the venue. Editable per venue
-- from the card's edit page. Source: breakout-hunt/022_breakout_hunt.sql.

create table public.bingo_breakout_puzzles (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
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

create index idx_breakout_puzzles_task on public.bingo_breakout_puzzles (task_id, position);

alter table public.bingo_breakout_puzzles enable row level security;
create policy breakout_puzzles_all on public.bingo_breakout_puzzles for all using (true) with check (true);

-- Deferred from media-photos/bingo_photo_submissions.sql: that table's
-- puzzle_id column exists before this table does in a from-scratch run, so
-- the FK is added here instead, once both tables exist.
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_puzzle_id_fkey
  foreign key (puzzle_id) references public.bingo_breakout_puzzles(id) on delete set null;
