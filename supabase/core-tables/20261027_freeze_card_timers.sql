-- Freeze card timers while the board countdown is paused.
-- freeze_card_timers: when true, pressing Pause on the board timer is logged in
--   card_pauses and that time is taken off every card's elapsed time (live bonus
--   bar AND scoring). New boards get true from the app; existing boards stay false.
-- card_pauses: [{ "start": <epoch ms>, "end": <epoch ms> | null }] — end null = still paused.
-- The log is only ever read for scoring, so points already earned never change.
-- Run once in the Supabase SQL editor BEFORE deploying the matching app code.

alter table public.bingo_sections
  add column if not exists freeze_card_timers boolean not null default false,
  add column if not exists card_pauses jsonb not null default '[]'::jsonb;
