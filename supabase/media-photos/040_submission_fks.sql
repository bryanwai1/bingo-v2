-- Enforce the parent links on bingo_photo_submissions.
--
-- The table was declared with references to bingo_teams, bingo_tasks and
-- bingo_scans, but the live database never had them: a row could be inserted
-- naming a team and a task that do not exist, and one already had — a photo
-- submission whose team was deleted months ago, still holding a file in the
-- media bucket that nothing pointed at.
--
-- Nothing in the app relied on the gap. The admin already sweeps a team's
-- photos from storage before deleting the team, so the cascade added here only
-- removes rows that sweep leaves behind; it does not change what a deletion
-- means. Storage files still have to be removed by the app first — Postgres
-- cannot reach into the bucket.
--
-- scan_id is `set null` rather than cascade, matching the column's intent: a
-- submission outlives the scan it was made during, and the admin re-points it
-- when duplicate scans are merged.

-- Orphans first, or the constraints cannot be added.
delete from public.bingo_photo_submissions s
where not exists (select 1 from public.bingo_teams t where t.id = s.team_id)
   or not exists (select 1 from public.bingo_tasks k where k.id = s.task_id);

update public.bingo_photo_submissions s
set scan_id = null
where s.scan_id is not null
  and not exists (select 1 from public.bingo_scans c where c.id = s.scan_id);

alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_team_id_fkey;
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_team_id_fkey
  foreign key (team_id) references public.bingo_teams(id) on delete cascade;

alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_task_id_fkey;
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_task_id_fkey
  foreign key (task_id) references public.bingo_tasks(id) on delete cascade;

alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_scan_id_fkey;
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_scan_id_fkey
  foreign key (scan_id) references public.bingo_scans(id) on delete set null;
