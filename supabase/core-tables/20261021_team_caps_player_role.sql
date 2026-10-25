-- Per-board team caps, set in Admin → Teams: how many players (can complete
-- challenges) and observers (view only) each team on the board may hold.
-- Also renames the bingo_members role 'member' → 'player'.
-- Run once in the Supabase SQL editor BEFORE deploying the matching app code.

alter table public.bingo_sections
  add column if not exists max_team_players integer not null default 1
    constraint bingo_sections_max_team_players_check check (max_team_players between 1 and 20),
  add column if not exists max_team_observers integer not null default 9
    constraint bingo_sections_max_team_observers_check check (max_team_observers between 0 and 20);

alter table public.bingo_members drop constraint if exists bingo_members_role_check;
update public.bingo_members set role = 'player' where role = 'member';
alter table public.bingo_members alter column role set default 'player';
alter table public.bingo_members add constraint bingo_members_role_check
  check (role in ('player', 'observer'));
