-- Why a submission was rejected. Written by the admin at the moment of
-- rejecting, shown to the team on the card so they know what to redo.
-- Null for approvals and for rejections made before this existed.
alter table public.bingo_photo_submissions
  add column if not exists review_note text;
