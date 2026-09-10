-- Deleting a team must take its photo submissions with it.
--
-- bingo_photo_submissions.team_id had no cascading foreign key, so deleting a
-- team left its submissions behind pointing at a team that no longer exists.
-- They then showed on the review page as "Unknown team" and could never be
-- cleared from the UI, because every screen that lists them filters by a team
-- that is gone.
--
-- The admin's "reset progress" and "wipe board" paths already deleted them by
-- hand; only the single-team delete relied on a cascade that was not there.
-- Enforcing it in the database means no future code path can reintroduce this.

-- Any rows already orphaned would block the constraint, so clear them first.
delete from bingo_photo_submissions s
where not exists (select 1 from bingo_teams t where t.id = s.team_id);

alter table bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_team_id_fkey;

alter table bingo_photo_submissions
  add constraint bingo_photo_submissions_team_id_fkey
  foreign key (team_id) references bingo_teams(id) on delete cascade;

-- Same reasoning for the card the submission belongs to: deleting a card should
-- not leave submissions for a challenge nobody can open.
delete from bingo_photo_submissions s
where not exists (select 1 from bingo_tasks t where t.id = s.task_id);

alter table bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_task_id_fkey;

alter table bingo_photo_submissions
  add constraint bingo_photo_submissions_task_id_fkey
  foreign key (task_id) references bingo_tasks(id) on delete cascade;
