-- Per-card timer control for AI Team Building standalone cards.
--
-- Every AITB card shows a speed-bonus ladder counting up from check-in, using
-- the activity's own bonusTiers. Facilitators need to run the same activity
-- with a shorter or longer window, or with no clock at all, without editing
-- the activity table in code — so the override lives on the card.
--
--   aitb_timer_enabled  false hides the bonus bar entirely (untimed run)
--   aitb_timer_minutes  NULL keeps the activity's own duration; a number
--                       rescales the whole bonus ladder to that window

alter table bingo_tasks
  add column if not exists aitb_timer_enabled boolean not null default true;

alter table bingo_tasks
  add column if not exists aitb_timer_minutes integer;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_aitb_timer_minutes_check;

alter table bingo_tasks
  add constraint bingo_tasks_aitb_timer_minutes_check
  check (aitb_timer_minutes is null or (aitb_timer_minutes >= 1 and aitb_timer_minutes <= 180));
