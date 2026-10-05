-- Scoring v2: every card earns up to 150% of its base points for finishing fast.
--
-- A board has ONE default window; a card can override either number.
--   full  = finish within this many minutes -> 150% of base points
--   timer = the bonus steps 140/130/120/110% down to base points at this minute
-- NULL on a card means "follow the board default".

alter table bingo_sections
  add column if not exists default_bonus_full_minutes  numeric not null default 10,
  add column if not exists default_bonus_timer_minutes numeric not null default 25;

alter table bingo_tasks
  add column if not exists bonus_full_minutes  numeric,
  add column if not exists bonus_timer_minutes numeric;

-- Whole-number scoring only. decimal_points and teams.tiebreak are no longer
-- read by the app; the columns are left in place and simply ignored.
