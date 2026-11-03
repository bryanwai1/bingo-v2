-- Cooperative game sessions (PRD-004 / ADR-004).
-- Tables have RLS on and NO policies: anon/authenticated cannot read or write
-- them directly. Every access goes through the security definer RPCs below,
-- which take the caller's bingo_members.id and read team and role from that
-- row, never from the client.

create table if not exists public.coop_sessions (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null unique references public.bingo_scans(id) on delete cascade,
  team_id      uuid not null references public.bingo_teams(id) on delete cascade,
  game_key     text not null,
  status       text not null default 'lobby' check (status in ('lobby','playing','completed')),
  state        jsonb not null default '{}'::jsonb,
  version      int  not null default 0,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.coop_session_members (
  session_id uuid not null references public.coop_sessions(id) on delete cascade,
  member_id  uuid not null references public.bingo_members(id) on delete cascade,
  role       text not null check (role in ('player','observer')),
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (session_id, member_id)
);
create unique index if not exists coop_session_members_one_player
  on public.coop_session_members(session_id) where role = 'player';

alter table public.coop_sessions enable row level security;
alter table public.coop_session_members enable row level security;

-- Snapshot returned by every RPC. Internal: callers are checked before it runs.
create or replace function public.coop_snapshot(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_id', s.id, 'scan_id', s.scan_id, 'game_key', s.game_key,
    'status', s.status, 'state', s.state, 'version', s.version,
    'completed_at', s.completed_at,
    'members', coalesce((
      select json_agg(json_build_object('member_id', m.id, 'name', m.name, 'role', sm.role)
                      order by sm.joined_at)
      from coop_session_members sm join bingo_members m on m.id = sm.member_id
      where sm.session_id = s.id), '[]'::json))
  from coop_sessions s where s.id = p_session;
$$;
revoke all on function public.coop_snapshot(uuid) from public, anon, authenticated;

-- Create-or-join. One session per scan (team + card + box) via unique(scan_id).
create or replace function public.coop_open(p_member uuid, p_scan uuid, p_game_key text)
returns json language plpgsql security definer set search_path = public as $$
declare
  m   bingo_members%rowtype;
  sc  bingo_scans%rowtype;
  s   coop_sessions%rowtype;
  cur uuid;
  n   int;
begin
  select * into m  from bingo_members where id = p_member;
  select * into sc from bingo_scans   where id = p_scan;
  if m.id is null or sc.id is null or m.team_id <> sc.team_id then
    raise exception 'NOT_ON_TEAM';
  end if;

  insert into coop_sessions (scan_id, team_id, game_key)
  values (p_scan, sc.team_id, p_game_key)
  on conflict (scan_id) do nothing;

  select * into s from coop_sessions where scan_id = p_scan for update;

  -- Already in: refresh and return (reconnect).
  if exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
    return public.coop_snapshot(s.id);
  end if;

  if m.role = 'player' then
    select member_id into cur from coop_session_members
      where session_id = s.id and role = 'player';
    if cur is not null then
      if exists (select 1 from coop_session_members
                 where session_id = s.id and member_id = cur
                   and last_seen > now() - interval '120 seconds') then
        raise exception 'PLAYER_TAKEN';
      end if;
      -- stale player (over 120 s): the newcomer takes over, state is kept
      delete from coop_session_members where session_id = s.id and member_id = cur;
    end if;
  else
    select count(*) into n from coop_session_members where session_id = s.id and role = 'observer';
    if n >= 9 then raise exception 'OBSERVERS_FULL'; end if;
  end if;

  insert into coop_session_members (session_id, member_id, role) values (s.id, m.id, m.role);
  return public.coop_snapshot(s.id);
end $$;

-- Card page check: does this team already have a session for this scan?
-- Returns the status ('lobby'|'playing'|'completed') or null. Never returns state.
create or replace function public.coop_peek(p_member uuid, p_scan uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.status from coop_sessions s
    join bingo_members m on m.id = p_member and m.team_id = s.team_id
   where s.scan_id = p_scan;
$$;
grant execute on function public.coop_peek(uuid, uuid) to anon, authenticated;

-- The only read path. Touches last_seen.
create or replace function public.coop_get(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session;
  if m.id is null then raise exception 'NOT_ON_TEAM'; end if;
  -- session gone (an admin reset it): null, so open clients drop back to Play
  if s.id is null then return null; end if;
  if m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  -- on the team but no longer in the session (a newer player took the seat)
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_IN_SESSION';
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return public.coop_snapshot(s.id);
end $$;

create or replace function public.coop_start(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype; n_players int; n_obs int;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_ON_TEAM';
  end if;
  -- double tap or two devices: already started, just return it
  if s.status <> 'lobby' then return public.coop_snapshot(s.id); end if;
  select count(*) filter (where role = 'player'), count(*) filter (where role = 'observer')
    into n_players, n_obs from coop_session_members where session_id = s.id;
  if n_players <> 1 or n_obs < 1 or n_obs > 9 then raise exception 'LOBBY_INCOMPLETE'; end if;
  update coop_sessions set status = 'playing', started_at = now(), version = version + 1 where id = s.id;
  return public.coop_snapshot(s.id);
end $$;

-- Player-only write. Role comes from the member row. first_completion is true
-- exactly once. No timeout check: the bonus timer never ends a game.
create or replace function public.coop_move(
  p_member uuid, p_session uuid, p_base_version int, p_state jsonb, p_solved boolean
) returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members
                  where session_id = s.id and member_id = m.id and role = 'player') then
    raise exception 'NOT_PLAYER';
  end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if p_base_version <> s.version then raise exception 'STALE'; end if;
  if length(p_state::text) > 20000 then raise exception 'STATE_TOO_BIG'; end if;

  if p_solved then
    -- same transaction: the session and the card complete together, once
    -- (the row lock above and the status check make this the only solve).
    update coop_sessions set state = p_state, version = version + 1,
      status = 'completed', completed_at = now() where id = s.id;
    update bingo_scans set completed = true, completed_at = now()
     where id = s.scan_id and not completed;
  else
    update coop_sessions set state = p_state, version = version + 1 where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', p_solved);
end $$;

create or replace function public.coop_leave(p_member uuid, p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from coop_session_members sm
   using bingo_members m, coop_sessions s
   where sm.session_id = p_session and sm.member_id = p_member
     and m.id = p_member and s.id = p_session and m.team_id = s.team_id;
end $$;

-- Admin only (signed-in section writer): clears the session and undoes the
-- card completion in one transaction.
create or replace function public.coop_reset(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s coop_sessions%rowtype; own uuid;
begin
  select * into s from coop_sessions where id = p_session for update;
  if s.id is null then return; end if;
  select sec.owner_id into own
    from bingo_teams t join bingo_sections sec on sec.id = t.section_id
   where t.id = s.team_id;
  if not public.bingo_can_write(own) then raise exception 'NOT_ADMIN'; end if;
  update bingo_scans set completed = false, completed_at = null where id = s.scan_id;
  delete from coop_sessions where id = s.id;
end $$;

-- Admin entry point (AC-12): replay every game of one team. Used by the admin
-- team menu ("Reset games"). Each session goes through coop_reset, so the
-- same admin check applies. Returns how many sessions were cleared.
create or replace function public.coop_reset_team(p_team uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r uuid; n int := 0;
begin
  for r in select id from coop_sessions where team_id = p_team loop
    perform public.coop_reset(r); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.coop_reset_team(uuid) from public, anon;
grant execute on function public.coop_reset_team(uuid) to authenticated;

grant execute on function public.coop_open(uuid, uuid, text)                to anon, authenticated;
grant execute on function public.coop_get(uuid, uuid)                       to anon, authenticated;
grant execute on function public.coop_start(uuid, uuid)                     to anon, authenticated;
grant execute on function public.coop_move(uuid, uuid, int, jsonb, boolean) to anon, authenticated;
grant execute on function public.coop_leave(uuid, uuid)                     to anon, authenticated;
revoke all on function public.coop_reset(uuid) from public, anon;
grant execute on function public.coop_reset(uuid) to authenticated;
