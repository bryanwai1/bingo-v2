-- Run after 20261104_coop_two_players.sql, before deploying the updated client.
-- Keeps boards, matches and completion intact. Existing second players leave the
-- game session and can return using an observer account. No team membership changes.
begin;
lock table public.coop_sessions in share row exclusive mode;
delete from public.coop_session_members sm using public.coop_sessions s
where sm.session_id = s.id and s.game_key = 'icon-matching' and sm.role = 'player'
  and sm.member_id <> (select sm2.member_id from public.coop_session_members sm2
    where sm2.session_id = s.id and sm2.role = 'player' order by sm2.slot, sm2.joined_at limit 1);
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
    maxp := 1;
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
  need := 1;
  select count(*) filter (where role = 'player'), count(*) filter (where role = 'observer')
    into n_players, n_obs from coop_session_members where session_id = s.id;
  if n_players <> need or n_obs < 1 or n_obs > 9 then raise exception 'LOBBY_INCOMPLETE'; end if;
  update coop_sessions set status = 'playing', started_at = now(), version = version + 1 where id = s.id;
  return public.coop_snapshot(s.id);
end $$;


create or replace function public.coop_pick(p_member uuid, p_session uuid, p_index int, p_init jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  m bingo_members%rowtype; s coop_sessions%rowtype;
  sl smallint; st jsonb; n int; picks jsonb; mine text; a int; b int;
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
  -- Selection order belongs to the same player, including legacy slot 1.
  if picks ? '1' and not (picks ? '0') then
    picks := jsonb_build_object('0', picks -> '1');
  end if;
  if picks ? '0' and (picks ->> '0')::int = p_index then raise exception 'PICK_TAKEN'; end if;
  mine := case when picks ? '0' then '1' else '0' end;
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


-- Update the stored card instructions as well as the client play panel.
update public.bingo_task_pages p set
  pointer_1 = 'Use 1 player and at least 1 observer (up to 9). Join the same team and open Icon Matching.',
  pointer_2 = 'The player taps two different cards, one at a time. The first selection stays hidden until the second tap.',
  pointer_3 = 'All observers see both selected icons and their positions. The player sees positions only.',
  pointer_4 = 'Observers tell the player what they see and help remember which positions form a pair.',
  pointer_5 = 'Matching pairs stay revealed to observers. Non-matching icons hide after 2.5 seconds, then the player selects again.',
  pointer_6 = 'Match all 8 pairs to complete the card. Only the player can tap; observers guide them.',
  example_1 = null, example_2 = null, example_3 = null,
  example_4 = null, example_5 = null, example_6 = null
from public.bingo_tasks t
where p.task_id = t.id and lower(trim(t.title)) = 'icon matching';

insert into public.bingo_task_pages (task_id, page_order, pointer_1, pointer_2, pointer_3, pointer_4, pointer_5, pointer_6)
select t.id, 0,
  'Use 1 player and at least 1 observer (up to 9). Join the same team and open Icon Matching.',
  'The player taps two different cards, one at a time. The first selection stays hidden until the second tap.',
  'All observers see both selected icons and their positions. The player sees positions only.',
  'Observers tell the player what they see and help remember which positions form a pair.',
  'Matching pairs stay revealed to observers. Non-matching icons hide after 2.5 seconds, then the player selects again.',
  'Match all 8 pairs to complete the card. Only the player can tap; observers guide them.'
from public.bingo_tasks t where lower(trim(t.title)) = 'icon matching'
and not exists (select 1 from public.bingo_task_pages p where p.task_id = t.id);

commit;
