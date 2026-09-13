-- Versus: a fourth answer input for battle cards. The challenging team picks
-- the team it battled and whether it won, and that lands here as a
-- submission for the admin to approve or reject exactly like a photo or a
-- link — so a card ticked "Photo + Versus" completes only when both are
-- approved. No opponent confirmation, no marshal.
alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_media_type_check;
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_media_type_check
  check (media_type in ('image', 'video', 'link', 'versus'));

-- Who they battled and how it went. Null on every non-versus row.
alter table public.bingo_photo_submissions
  add column if not exists opponent_id uuid references public.bingo_teams(id) on delete set null,
  add column if not exists versus_won  boolean;

create index if not exists bingo_photo_submissions_versus_idx
  on public.bingo_photo_submissions(task_id, team_id, opponent_id)
  where media_type = 'versus';
