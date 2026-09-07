-- Sign Splice Title — per-team state for the letter-hunt card.
--
-- bingo_tasks.task_type carries a CHECK constraint listing the allowed card
-- types, so the new type has to be admitted before any Sign Splice card can
-- be inserted. Recreated rather than altered because a CHECK cannot be
-- extended in place.
alter table bingo_tasks drop constraint if exists bingo_tasks_task_type_check;
alter table bingo_tasks add constraint bingo_tasks_task_type_check
  check (task_type in ('standard', 'answer', 'photo', 'sign_splice'));

-- Ported from the mall-hunt prototype's SQLite schema (teams / letters /
-- submissions). Teams and tasks already exist in bingo, so only the two
-- game-specific tables are new; "submissions" collapses into the letter row
-- plus a small hash log used for the duplicate-photo rules.

-- One locked title per team per card (Rule 1: locked once, admin unlocks).
create table if not exists bingo_sign_splice_titles (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references bingo_teams(id) on delete cascade,
  task_id      uuid not null references bingo_tasks(id) on delete cascade,
  title        text not null,
  locked       boolean not null default true,
  final_url    text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (team_id, task_id)
);

-- One row per letter position, created when the title is locked.
create table if not exists bingo_sign_splice_letters (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references bingo_teams(id) on delete cascade,
  task_id         uuid not null references bingo_tasks(id) on delete cascade,
  position        int  not null,
  letter          text not null,
  -- pending | collected | review
  status          text not null default 'pending',
  shop_name       text,
  photo_url       text,
  crop_url        text,
  ocr_text        text,
  ocr_confidence  real,
  captured_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (team_id, task_id, position)
);

-- Every photo a team has scanned, so Rules 9 and 10 can reject an exact
-- re-upload and flag a near-identical retake. Kept separate from letters
-- because a rejected scan never becomes a letter but must still be remembered.
create table if not exists bingo_sign_splice_photos (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references bingo_teams(id) on delete cascade,
  task_id         uuid not null references bingo_tasks(id) on delete cascade,
  image_hash      text not null,
  perceptual_hash text,
  target_letter   text,
  detected_text   text,
  ocr_confidence  real,
  -- accepted | rejected | pending_review
  outcome         text not null default 'pending',
  created_at      timestamptz not null default now()
);

create index if not exists idx_ss_letters_team_task
  on bingo_sign_splice_letters (team_id, task_id, position);
create index if not exists idx_ss_photos_team_task
  on bingo_sign_splice_photos (team_id, task_id);
create index if not exists idx_ss_photos_hash
  on bingo_sign_splice_photos (team_id, task_id, image_hash);

-- Participants play without an account, exactly as they do for photo
-- submissions, so these follow the same open-access pattern as the rest of
-- the participant-facing bingo tables.
alter table bingo_sign_splice_titles  enable row level security;
alter table bingo_sign_splice_letters enable row level security;
alter table bingo_sign_splice_photos  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_sign_splice_titles' and policyname = 'ss_titles_all') then
    create policy ss_titles_all on bingo_sign_splice_titles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_sign_splice_letters' and policyname = 'ss_letters_all') then
    create policy ss_letters_all on bingo_sign_splice_letters for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_sign_splice_photos' and policyname = 'ss_photos_all') then
    create policy ss_photos_all on bingo_sign_splice_photos for all using (true) with check (true);
  end if;
end $$;
