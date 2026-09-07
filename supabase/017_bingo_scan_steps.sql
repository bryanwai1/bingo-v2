-- AI Team Building cards played standalone (not inside the bundle tile) get
-- the same tickable step checklist the bundle already has — steps_done here
-- mirrors bingo_bundle_progress.steps_done exactly, just scoped to a plain
-- bingo_scans row instead of a bundle progress row.
alter table public.bingo_scans
  add column if not exists steps_done int[] not null default '{}';

comment on column public.bingo_scans.steps_done is
  'Indexes of ticked steps for a standalone AI Team Building card — same purpose as bingo_bundle_progress.steps_done.';

notify pgrst, 'reload schema';
