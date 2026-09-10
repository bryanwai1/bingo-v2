-- bingo_photo_submissions: team-uploaded evidence for photo/video/media
-- cards, reviewed (approved/rejected) from the admin Photos tab; approval
-- completes the team's tile. Source: media-photos/20260421_bingo_features.sql,
-- widened by 024_photo_submission_cascade.sql, 034_video_submissions.sql.

create table public.bingo_photo_submissions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.bingo_teams(id) on delete cascade,
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  scan_id     uuid references public.bingo_scans(id) on delete set null,
  photo_url   text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),

  -- (tracked) media-photos/034_video_submissions.sql
  -- What kind of file this holds, so the admin knows to render a player
  -- rather than an <img>. Existing rows before this column are all photos.
  media_type  text not null default 'image'
    constraint bingo_photo_submissions_media_type_check check (media_type in ('image', 'video')),

  -- (tracked) breakout-hunt/023_breakout_review.sql — see
  -- breakout-hunt/bingo_breakout_puzzles.sql for the FK, added there once
  -- that table exists.
  label       text,
  puzzle_id   uuid
);

create index bingo_photo_sub_task_idx on public.bingo_photo_submissions(task_id);
create index idx_photo_submissions_puzzle on public.bingo_photo_submissions (puzzle_id);

alter table public.bingo_photo_submissions enable row level security;

create policy "read open" on public.bingo_photo_submissions for select using (true);
create policy "anon write" on public.bingo_photo_submissions for insert to anon with check (true);
create policy "anon update" on public.bingo_photo_submissions for update to anon using (true) with check (true);
create policy "anon delete" on public.bingo_photo_submissions for delete to anon using (true);
create policy "tenant write" on public.bingo_photo_submissions for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)));

alter publication supabase_realtime add table public.bingo_photo_submissions;
