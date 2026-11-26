-- Per-board switch for live location sharing (outdoor events).
-- Players' phones share their position only while this is true; the map
-- sections on the Progress page and the projector appear only when it is on.
-- Positions travel over Realtime Broadcast and are never stored.
alter table public.bingo_sections
  add column if not exists gps_enabled boolean not null default false;
