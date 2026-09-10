-- bingo_sign_splice_photos: every photo a team has scanned for Sign
-- Splice, so a duplicate exact re-upload can be rejected and a
-- near-identical retake flagged. Kept separate from letters because a
-- rejected scan never becomes a letter but must still be remembered.
-- Source: sign-splice/019_sign_splice.sql, widened in the same file's
-- "Screen 4" section (audit-trail columns).

create table public.bingo_sign_splice_photos (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.bingo_teams(id) on delete cascade,
  task_id         uuid not null references public.bingo_tasks(id) on delete cascade,
  image_hash      text not null,
  perceptual_hash text,
  target_letter   text,
  detected_text   text,
  ocr_confidence  real,
  outcome         text not null default 'pending',  -- accepted | rejected | pending_review
  created_at      timestamptz not null default now(),

  -- (tracked) sign-splice/019_sign_splice.sql "Screen 4" section — audit
  -- trail for flagged submissions, so a facilitator can pull just the
  -- questionable ones after the event.
  shop_name       text,
  shop_lot        text,
  low_confidence  boolean not null default false,
  similar_flag    boolean not null default false
);

create index idx_ss_photos_team_task on public.bingo_sign_splice_photos (team_id, task_id);
create index idx_ss_photos_hash on public.bingo_sign_splice_photos (team_id, task_id, image_hash);
create index idx_ss_photos_flagged on public.bingo_sign_splice_photos (team_id, task_id)
  where low_confidence or similar_flag;

alter table public.bingo_sign_splice_photos enable row level security;
create policy ss_photos_all on public.bingo_sign_splice_photos for all using (true) with check (true);
