-- Station cards: a card marked is_station keeps its inner (bonus) timer stopped
-- until the station marshal presses Start. Opening the card / pressing Start
-- Challenge no longer starts it.
--   bingo_tasks.is_station       the card is a station game
--   bingo_scans.timer_started_at when the marshal pressed Start (null = not yet).
--                                Non-station cards keep using scanned_at.
-- Additive only. fork_card_for_board copies bingo_tasks by row, so board copies
-- pick is_station up without a change there. RUN THIS BEFORE deploying the app
-- build that reads these columns.
alter table public.bingo_tasks
  add column if not exists is_station boolean not null default false;

alter table public.bingo_scans
  add column if not exists timer_started_at timestamptz;

notify pgrst, 'reload schema';
