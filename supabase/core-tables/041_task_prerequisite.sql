-- Chained cards: a card can name one other card that a team must have
-- completed before this one opens (AI Movie Poster -> Animated Movie Poster
-- -> Caption Card). Null on every existing row, so nothing changes for
-- cards that are not part of a chain.
alter table public.bingo_tasks
  add column if not exists prerequisite_task_id uuid
    references public.bingo_tasks(id) on delete set null;

create index if not exists bingo_tasks_prerequisite_idx
  on public.bingo_tasks(prerequisite_task_id)
  where prerequisite_task_id is not null;

-- completion_warning was documented in bingo_tasks.sql (inferred from the
-- TypeScript type) but never actually created in this project — the admin's
-- "Save Warning" button had been failing against a missing column. It is
-- the lock message shown on a chained card a team has not earned yet, and
-- the marshal-mode notice on a standard card.
alter table public.bingo_tasks
  add column if not exists completion_warning text;
