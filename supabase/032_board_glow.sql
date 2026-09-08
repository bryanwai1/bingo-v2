-- Which tiles are lit on a board, for the demo.
--
-- The presenter lights tiles to point the room at a card while talking through
-- the board. That was kept in the presenter's own browser, so anyone else
-- opening the sample link saw an unlit board — the one thing it needed to do.
-- Storing it on the board row makes it the same for everyone, and lets the
-- change reach open pages over realtime.
--
-- Slot numbers, not task ids: a card can sit in several slots and only the one
-- the presenter pointed at should light up.

alter table bingo_sections
  add column if not exists glow_slots integer[] not null default '{}';
