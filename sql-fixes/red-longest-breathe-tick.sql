-- Tick "Longest Breathe" for RED (battle result already approved, card never ticked).
-- Targets ONE scan row by its id. No other team, card, or points touched.
-- Finish time = when RED's approved result was submitted (07:40:19 UTC), not now,
-- so RED's time bonus isn't hurt by the delay.

begin;

update bingo_scans s
set completed    = true,
    completed_at = coalesce(
      (select max(ps.created_at) from bingo_photo_submissions ps
        where ps.team_id = s.team_id and ps.task_id = s.task_id
          and ps.status = 'approved'),
      now())
where s.id = '51be8158-f3b3-4274-a115-2e352da72442'
  and s.completed = false
returning s.id, s.completed, s.completed_at;

commit;
