-- Who shares live location on a board: everyone, only players, or only observers.
alter table public.bingo_sections
  add column if not exists gps_who text not null default 'both'
  check (gps_who in ('both', 'player', 'observer'));
