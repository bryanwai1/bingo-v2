-- Icon Matching with two players (PRD-007). Run AFTER 20261103_coop_sessions.sql.
-- Safe to run twice. Do not edit the first migration: this file changes what it made.
--
-- * Icon Matching ('icon-matching') takes 2 players; every other game keeps 1.
--   Each player gets a fixed slot (0 or 1) in coop_session_members, chosen by the
--   server when they join. A unique index on (session, slot) replaces the old
--   "one player per session" index.
-- * Players pick through coop_pick: the server reads the caller's slot from the member
--   row, locks the session row and merges the pick into the state, so two picks at the
--   same moment never clash on a version. coop_move is closed for icon-matching.
-- * coop_hide ends the viewing period after a miss (idempotent, either player may call it).
-- * coop_start needs 2 players for icon-matching.
-- A section's max_team_players defaults to 1: the team needs a section that allows 2.

alter table public.coop_session_members add column if not exists slot smallint;
update public.coop_session_members set slot = 0 where role = 'player' and slot is null;
alter table public.coop_session_members drop constraint if exists coop_session_members_slot_chk;
alter table public.coop_session_members
  add constraint coop_session_members_slot_chk check (slot is null or slot in (0, 1));
drop index if exists public.coop_session_members_one_player;
create unique index if not exists coop_session_members_slot_uq
  on public.coop_session_members(session_id, slot) where slot is not null;

-- Same snapshot, members now carry their slot.
create or replace function public.coop_snapshot(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_id', s.id, 'scan_id', s.scan_id, 'game_key', s.game_key,
    'status', s.status, 'state', s.state, 'version', s.version,
    'completed_at', s.completed_at,
    'members', coalesce((
      select json_agg(json_build_object('member_id', m.id, 'name', m.name, 'role', sm.role, 'slot', sm.slot)
                      order by sm.joined_at)
      from coop_session_members sm join bingo_members m on m.id = sm.member_id
      where sm.session_id = s.id), '[]'::json))
  from coop_sessions s where s.id = p_session;
$$;
revoke all on function public.coop_snapshot(uuid) from public, anon, authenticated;

create or replace function public.coop_open(p_member uuid, p_scan uuid, p_game_key text)
returns json language plpgsql security definer set search_path = public as $$
declare
  m    bingo_members%rowtype;
  sc   bingo_scans%rowtype;
  s    coop_sessions%rowtype;
  cur  uuid;
  n    int;
  maxp int;
  sl   smallint;
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

  if exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
    return public.coop_snapshot(s.id);
  end if;

  if m.role = 'player' then
    maxp := case when s.game_key = 'icon-matching' then 2 else 1 end;
    select count(*) into n from coop_session_members where session_id = s.id and role = 'player';
    if n >= maxp then
      -- full: only a player silent for over 120 s can be replaced; the newcomer takes the slot and the state stays
      select member_id, slot into cur, sl from coop_session_members
       where session_id = s.id and role = 'player' and last_seen <= now() - interval '120 seconds'
       order by last_seen limit 1;
      if cur is null then raise exception 'PLAYER_TAKEN'; end if;
      delete from coop_session_members where session_id = s.id and member_id = cur;
    else
      select min(x)::smallint into sl from generate_series(0, maxp - 1) x
       where not exists (select 1 from coop_session_members where session_id = s.id and slot = x);
    end if;
    insert into coop_session_members (session_id, member_id, role, slot) values (s.id, m.id, 'player', sl);
  else
    select count(*) into n from coop_session_members where session_id = s.id and role = 'observer';
    if n >= 9 then raise exception 'OBSERVERS_FULL'; end if;
    insert into coop_session_members (session_id, member_id, role) values (s.id, m.id, 'observer');
  end if;
  return public.coop_snapshot(s.id);
end $$;

create or replace function public.coop_start(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype; n_players int; n_obs int; need int;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_ON_TEAM';
  end if;
  if s.status <> 'lobby' then return public.coop_snapshot(s.id); end if;
  need := case when s.game_key = 'icon-matching' then 2 else 1 end;
  select count(*) filter (where role = 'player'), count(*) filter (where role = 'observer')
    into n_players, n_obs from coop_session_members where session_id = s.id;
  if n_players <> need or n_obs < 1 or n_obs > 9 then raise exception 'LOBBY_INCOMPLETE'; end if;
  update coop_sessions set status = 'playing', started_at = now(), version = version + 1 where id = s.id;
  return public.coop_snapshot(s.id);
end $$;

-- Whole-state write, unchanged except: closed for icon-matching (use coop_pick), so a
-- player cannot write the other player's pick or the board.
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
  if s.game_key = 'icon-matching' then raise exception 'USE_PICK'; end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if p_base_version <> s.version then raise exception 'STALE'; end if;
  if length(p_state::text) > 20000 then raise exception 'STATE_TOO_BIG'; end if;

  if p_solved then
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

-- One player's pick for the turn (Icon Matching). No base version: the session row lock
-- orders simultaneous picks and each one is merged into the current state.
-- p_init is the shuffled board from the client, used only while the session has no state yet.
create or replace function public.coop_pick(p_member uuid, p_session uuid, p_index int, p_init jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  m bingo_members%rowtype; s coop_sessions%rowtype;
  sl smallint; st jsonb; n int; picks jsonb; mine text; other text; a int; b int;
  matched jsonb; solved boolean := false;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  -- the slot comes from the member row, never from the caller
  select slot into sl from coop_session_members
   where session_id = s.id and member_id = m.id and role = 'player';
  if sl is null then raise exception 'NOT_PLAYER'; end if;
  if s.game_key <> 'icon-matching' then raise exception 'NOT_PLAYING'; end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;

  st := s.state;
  if st is null or st = '{}'::jsonb then
    if p_init is null or jsonb_typeof(p_init -> 'cards') <> 'array' or length(p_init::text) > 20000
       or jsonb_array_length(p_init -> 'cards') < 2 or jsonb_array_length(p_init -> 'cards') % 2 <> 0 then
      raise exception 'STATE_TOO_BIG';
    end if;
    st := jsonb_build_object('v', 1, 'cols', p_init -> 'cols', 'cards', p_init -> 'cards',
      'flipped', '[]'::jsonb, 'matched', '[]'::jsonb, 'last', 'null'::jsonb, 'picks', '{}'::jsonb);
  end if;

  n := jsonb_array_length(st -> 'cards');
  if p_index is null or p_index < 0 or p_index >= n then raise exception 'PICK_LOCKED'; end if;
  if jsonb_array_length(st -> 'flipped') >= 2 or (st -> 'matched') @> to_jsonb(p_index) then
    raise exception 'PICK_LOCKED';
  end if;
  picks := coalesce(st -> 'picks', '{}'::jsonb);
  mine := sl::text; other := (1 - sl)::text;
  if picks ? mine then raise exception 'PICK_LOCKED'; end if;
  if picks ? other and (picks ->> other)::int = p_index then raise exception 'PICK_TAKEN'; end if;
  picks := picks || jsonb_build_object(mine, p_index);

  if picks ? '0' and picks ? '1' then
    a := (picks ->> '0')::int; b := (picks ->> '1')::int;
    if (st -> 'cards' -> a) = (st -> 'cards' -> b) then
      matched := (st -> 'matched') || jsonb_build_array(a, b);
      st := st || jsonb_build_object('matched', matched, 'flipped', '[]'::jsonb, 'picks', '{}'::jsonb, 'last', 'match');
      solved := jsonb_array_length(matched) = n;
    else
      st := st || jsonb_build_object('flipped', jsonb_build_array(a, b), 'picks', '{}'::jsonb, 'last', 'miss');
    end if;
  else
    st := st || jsonb_build_object('picks', picks, 'last', 'null'::jsonb);
  end if;

  if solved then
    -- same transaction: the session and the card complete together, once
    update coop_sessions set state = st, version = version + 1,
      status = 'completed', completed_at = now() where id = s.id;
    update bingo_scans set completed = true, completed_at = now()
     where id = s.scan_id and not completed;
  else
    update coop_sessions set state = st, version = version + 1 where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', solved);
end $$;

-- End of the viewing period after a miss. Either player may call it; with nothing to hide it changes nothing.
create or replace function public.coop_hide(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members
                  where session_id = s.id and member_id = m.id and role = 'player') then
    raise exception 'NOT_PLAYER';
  end if;
  if s.game_key = 'icon-matching' and s.status = 'playing' and s.state ? 'flipped'
     and jsonb_array_length(s.state -> 'flipped') = 2 then
    update coop_sessions set version = version + 1,
      state = s.state || jsonb_build_object('flipped', '[]'::jsonb, 'picks', '{}'::jsonb, 'last', 'null'::jsonb)
     where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', false);
end $$;

grant execute on function public.coop_open(uuid, uuid, text)                to anon, authenticated;
grant execute on function public.coop_start(uuid, uuid)                     to anon, authenticated;
grant execute on function public.coop_move(uuid, uuid, int, jsonb, boolean) to anon, authenticated;
grant execute on function public.coop_pick(uuid, uuid, int, jsonb)          to anon, authenticated;
grant execute on function public.coop_hide(uuid, uuid)                      to anon, authenticated;
