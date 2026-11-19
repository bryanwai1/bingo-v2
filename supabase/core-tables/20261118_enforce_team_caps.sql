-- APPLIED to the live project on 2026-11-18 (Jiamin approved). Verified on a throwaway
-- board: 2nd player and 3rd observer refused, returning member allowed, 6 simultaneous
-- joins -> exactly 1 seated. Default board data unchanged before/after.
--
-- Why: the per-team player/observer limits (bingo_sections.max_team_players /
-- max_team_observers) were only checked in the browser (BingoDashJoin.tsx joinGroup).
-- Found 2026-11-18 on a throwaway board: the database accepted a second player and
-- an observer over the limit, so two phones joining at the same moment, or a direct
-- API call, could exceed the cap.
--
-- What: refuse an insert, or a move to another team / role change, that would put a
-- team over its board's limit. Members already over a limit are left alone; only the
-- change that would add one more is refused. A member returning to their own team and
-- role is never refused (the join screen re-saves their row on every return).
--
-- Review notes (2026-11-18):
--  * The per-team advisory lock is what closes the race. Without it, two simultaneous
--    inserts both count "1 of 2 used" before either commits and both succeed.
--  * SECURITY DEFINER so the count sees every member of the team whatever the caller's
--    row-level security allows; search_path is pinned.
--  * Creating the trigger takes a short lock on bingo_members. Run it between events,
--    not while a board is mid-game.
--  * The app maps the TEAM_FULL error to "This team is full" (BingoDashJoin.tsx,
--    registerMember.ts) and the admin's move-member now reports it instead of failing
--    silently (BingoDashAdmin.tsx). Those client changes are safe to ship before this.
--
-- Roll back with:
--   drop trigger if exists bingo_members_enforce_team_caps on public.bingo_members;
--   drop function if exists public.bingo_enforce_team_caps();
--
-- Check after running (on a throwaway board only): with max_team_players = 1 and one
-- player on a team, inserting a second player must fail with TEAM_FULL; an observer
-- under the observer limit must still succeed; re-saving the first player must succeed.

create or replace function public.bingo_enforce_team_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  taken integer;
begin
  -- Only when this change adds a member to a team/role (not renames, password edits,
  -- or re-saving a member who stays on the same team and role).
  if tg_op = 'UPDATE' and new.team_id = old.team_id and new.role = old.role then
    return new;
  end if;

  -- One writer at a time per team, held until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended(new.team_id::text, 0));

  select case when new.role = 'observer' then coalesce(max_team_observers, 9)
              else coalesce(max_team_players, 1) end
    into cap
    from bingo_sections
   where id = new.section_id;

  if cap is null then
    return new;
  end if;

  select count(*) into taken
    from bingo_members
   where team_id = new.team_id
     and role = new.role
     and id <> new.id;

  if taken >= cap then
    raise exception 'TEAM_FULL: team % allows % %', new.team_id, cap, new.role using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bingo_members_enforce_team_caps on public.bingo_members;
create trigger bingo_members_enforce_team_caps
  before insert or update of team_id, role on public.bingo_members
  for each row execute function public.bingo_enforce_team_caps();
