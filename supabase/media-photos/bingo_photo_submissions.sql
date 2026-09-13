-- bingo_photo_submissions: team-submitted evidence for photo/video/media/link
-- cards, reviewed (approved/rejected) from the admin Photos tab; approval
-- completes the team's tile. Source: media-photos/20260421_bingo_features.sql,
-- widened by 024_photo_submission_cascade.sql, 034_video_submissions.sql,
-- 039_link_submissions.sql.

-- The three foreign keys below were declared here from the start but were
-- never actually present in the live database; 040_submission_fks.sql adds
-- them for real, after clearing the orphans the gap allowed in.
create table public.bingo_photo_submissions (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.bingo_teams(id) on delete cascade,
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  scan_id     uuid references public.bingo_scans(id) on delete set null,
  -- The uploaded file, or — when media_type is 'link' — the URL the team
  -- submitted. Nothing is stored for a link beyond the address itself.
  photo_url   text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),

  -- (tracked) media-photos/034_video_submissions.sql
  -- What kind of file this holds, so the admin knows to render a player
  -- rather than an <img>. Existing rows before this column are all photos.
  -- (tracked) media-photos/039_link_submissions.sql — 'link' added, for cards
  -- whose deliverable lives somewhere else (a built tool, a shared doc).
  media_type  text not null default 'image'
    constraint bingo_photo_submissions_media_type_check
      -- (tracked) media-photos/043_versus_submissions.sql — 'versus' added.
      -- (tracked) media-photos/045_text_submissions.sql — 'text' added: a
      -- free-text answer, the text itself in photo_url.
      check (media_type in ('image', 'video', 'link', 'versus', 'text')),

  -- (tracked) media-photos/043_versus_submissions.sql
  -- Versus rows only: the team they battled and whether they won.
  opponent_id uuid references public.bingo_teams(id) on delete set null,
  versus_won  boolean,

  -- (tracked) media-photos/044_review_note.sql
  -- The admin's reason when rejecting, shown to the team.
  review_note text,

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
