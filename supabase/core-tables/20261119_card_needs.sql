-- Optional "People & place" component on a card: how many people it needs and
-- where it is played. Both are optional; a card with none set shows nothing.
-- Additive only. fork_card_for_board copies bingo_tasks by row, so board copies
-- pick the new columns up without a change there.
alter table public.bingo_tasks
  add column if not exists players_min        integer,
  add column if not exists players_max        integer,
  add column if not exists players_whole_team boolean not null default false,
  add column if not exists play_location      text;

alter table public.bingo_tasks drop constraint if exists bingo_tasks_players_range;
alter table public.bingo_tasks add constraint bingo_tasks_players_range check (
  (players_min is null or players_min between 1 and 99)
  and (players_max is null or (players_min is not null and players_max >= players_min and players_max <= 99))
);
