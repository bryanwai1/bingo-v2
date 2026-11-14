-- Tick "Balloon Pair Race" for GREEN on board "resort-hunt".
-- Targets ONE scan row by its id. No other team, card, or points touched.

begin;

update bingo_scans s
set completed    = true,
    completed_at = coalesce(
      (select max(ps.created_at) from bingo_photo_submissions ps
        where ps.team_id = s.team_id and ps.task_id = s.task_id
          and ps.status = 'approved'),
      now())
where s.id = 'be02726f-54f8-4f46-81a8-c85c0d84a3b7'
  and s.completed = false
returning s.id, s.completed, s.completed_at;

commit;
