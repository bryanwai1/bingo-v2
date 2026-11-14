-- READ-ONLY. Lists any card whose results are all approved but is not ticked.
-- Should always return 0 rows. Safe to run any time, changes nothing.
select sec.slug as board, t.name as team, k.title as card, s.id as scan_id
from bingo_scans s
join bingo_teams    t   on t.id   = s.team_id
join bingo_sections sec on sec.id = t.section_id
join bingo_tasks    k   on k.id   = s.task_id
where not s.completed
  and exists (select 1 from bingo_photo_submissions p
               where p.scan_id = s.id and p.status = 'approved' and p.puzzle_id is null)
  and public.bingo_scan_inputs_done(s.id, s.answer_ok)
order by 1, 2, 3;
