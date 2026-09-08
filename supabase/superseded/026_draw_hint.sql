-- Split "hint" from "answer" on draw items.
--
-- Both were crammed into `detail`, which meant the participant-facing Reveal
-- button handed Escape the Mall teams the solution to their own riddle. The two
-- are different things and need different audiences:
--
--   hint    shown to the team on demand — a nudge, never the answer
--   detail  the answer, for the facilitator only; never rendered to a team
--
-- Route Master's detail was always a hint rather than an answer, so it moves
-- across; Escape the Mall's stays put as the answer it always was.

alter table bingo_draw_items
  add column if not exists hint text;

-- Route Master: what sat in detail was a hint all along.
update bingo_draw_items i
set hint = i.detail, detail = null
from bingo_tasks t
where t.id = i.task_id
  and t.title = 'Route Master'
  and i.detail is not null
  and i.hint is null;
