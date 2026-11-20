-- Per-board switch: may players see the scoreboard on their phones?
-- Toggled in Admin → Scoreboard Theme ("Show scoreboard to players").
-- The projector the facilitator shows on the big screen is not affected.
-- Run once in the Supabase SQL editor; existing boards stay ON (today's behaviour).

alter table public.bingo_sections
  add column if not exists player_scoreboard_enabled boolean not null default true;

comment on column public.bingo_sections.player_scoreboard_enabled is 'When false, players cannot open the scoreboard from their phone (Scores tab hidden, ?view=player page blocked). The projector is unaffected.';
