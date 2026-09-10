-- bingo_sign_splice_letters: one row per letter position, created when a
-- team's title (bingo_sign_splice_titles) is locked.
-- Source: sign-splice/019_sign_splice.sql, widened in the same file's
-- "Screen 4" section (shop_lot).

create table public.bingo_sign_splice_letters (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.bingo_teams(id) on delete cascade,
  task_id         uuid not null references public.bingo_tasks(id) on delete cascade,
  position        int  not null,
  letter          text not null,
  status          text not null default 'pending',  -- pending | collected | review
  shop_name       text,
  photo_url       text,
  crop_url        text,
  ocr_text        text,
  ocr_confidence  real,
  captured_at     timestamptz,
  created_at      timestamptz not null default now(),

  -- (tracked) sign-splice/019_sign_splice.sql "Screen 4" section
  -- What the participant typed, kept alongside the collected letter.
  shop_lot        text,

  unique (team_id, task_id, position)
);

create index idx_ss_letters_team_task on public.bingo_sign_splice_letters (team_id, task_id, position);

alter table public.bingo_sign_splice_letters enable row level security;
create policy ss_letters_all on public.bingo_sign_splice_letters for all using (true) with check (true);
