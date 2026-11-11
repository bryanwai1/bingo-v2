-- RPC checks for 20261103_coop_sessions.sql. Plain SQL: paste the whole file into the
-- Supabase SQL editor of a SANDBOX project (after running 20261103_coop_sessions.sql and then
-- 20261104_coop_two_players.sql) and press Run. The last part covers PRD-007 (Icon Matching, 2 players).
-- No psql meta-commands, no uuids to fill in.
--
-- What it does: picks one existing bingo_scans row (and its team) that has no co-op session,
-- creates throwaway members (3 players, 10 observers, 1 member of another team if a second
-- team exists), runs the checks, then deletes the members and the sessions it made and puts the
-- scan's completed / completed_at back. If anything unexpected fails, the whole block rolls back.
-- The result is the table at the bottom: every row should start with 'ok'.
--
-- Not covered here (needs a signed-in admin, the SQL editor runs as postgres):
--   coop_reset / coop_reset_team admin check (NOT_ADMIN) and RLS from the anon key.
--   Check those from the app (admin team menu > Reset games) and with the anon key.

drop table if exists pg_temp.res;
create temp table res(n serial, t text, r text);

do $$
declare
  v_scan uuid; v_team uuid; v_done boolean; v_done_at timestamptz;
  v_xteam uuid; v_sec uuid; v_xsec uuid;
  made uuid[] := '{}';
  p1 uuid; p2 uuid; p3 uuid; xm uuid; o uuid;
  init jsonb; st jsonb; k int;
  obs uuid[] := '{}';
  sid uuid; sid2 uuid; snap json; r text; i int; ver int; fc text;
begin
  select s.id, s.team_id, s.completed, s.completed_at into v_scan, v_team, v_done, v_done_at
    from bingo_scans s
   where not exists (select 1 from coop_sessions c where c.scan_id = s.id)
   order by s.scanned_at desc limit 1;
  if v_scan is null then
    raise exception 'Need at least one bingo_scans row without a co-op session in this sandbox (open any card once as a team).';
  end if;
  select section_id into v_sec from bingo_teams where id = v_team;
  select id, section_id into v_xteam, v_xsec from bingo_teams where id <> v_team limit 1;

  insert into bingo_members(team_id, section_id, name, role) values (v_team, v_sec, 'coop-test-P1', 'player') returning id into p1;
  insert into bingo_members(team_id, section_id, name, role) values (v_team, v_sec, 'coop-test-P2', 'player') returning id into p2;
  insert into bingo_members(team_id, section_id, name, role) values (v_team, v_sec, 'coop-test-P3', 'player') returning id into p3;
  made := made || p1 || p2 || p3;
  for i in 1..10 loop
    insert into bingo_members(team_id, section_id, name, role) values (v_team, v_sec, 'coop-test-O' || i, 'observer') returning id into o;
    obs := obs || o; made := made || o;
  end loop;
  if v_xteam is not null then
    insert into bingo_members(team_id, section_id, name, role) values (v_xteam, v_xsec, 'coop-test-X', 'player') returning id into xm;
    made := made || xm;
  end if;

  -- AC-2 one session per scan: P1 opens, O1 joins the same one.
  snap := public.coop_open(p1, v_scan, 'stub'); sid := (snap ->> 'session_id')::uuid;
  insert into res(t, r) select 'AC-2 second member joins same session',
    case when (public.coop_open(obs[1], v_scan, 'stub') ->> 'session_id')::uuid = sid then 'ok' else 'FAIL' end;
  insert into res(t, r) select 'AC-2 exactly one session for the scan',
    case when (select count(*) from coop_sessions where scan_id = v_scan) = 1 then 'ok' else 'FAIL' end;

  -- AC-6 second player refused; observers 2..9 join; the tenth is refused.
  begin perform public.coop_open(p2, v_scan, 'stub'); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%PLAYER_TAKEN%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('AC-6 second player refused (PLAYER_TAKEN)', r);

  begin
    for i in 2..9 loop perform public.coop_open(obs[i], v_scan, 'stub'); end loop;
    r := 'ok';
  exception when others then r := 'FAIL: ' || sqlerrm; end;
  insert into res(t, r) values ('AC-6 observers 2..9 can join (9 total)', r);

  begin perform public.coop_open(obs[10], v_scan, 'stub'); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%OBSERVERS_FULL%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('AC-6 tenth observer refused (OBSERVERS_FULL)', r);

  -- AC-14 a member of another team cannot read or join.
  if xm is not null then
    begin perform public.coop_get(xm, sid); r := 'FAIL: no error';
    exception when others then r := case when sqlerrm like '%NOT_ON_TEAM%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
    insert into res(t, r) values ('AC-14 other team cannot read (NOT_ON_TEAM)', r);
    begin perform public.coop_open(xm, v_scan, 'stub'); r := 'FAIL: no error';
    exception when others then r := case when sqlerrm like '%NOT_ON_TEAM%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
    insert into res(t, r) values ('AC-14 other team cannot join (NOT_ON_TEAM)', r);
    begin perform public.coop_peek(xm, v_scan); r := 'ok (returns null)';
    exception when others then r := 'FAIL: ' || sqlerrm; end;
    insert into res(t, r) values ('AC-14 other team peek does not error', r);
  else
    insert into res(t, r) values ('AC-14 other team checks', 'skipped: only one team in this sandbox');
  end if;

  -- Start, then AC-8 an observer cannot move and the state does not change.
  insert into res(t, r) select 'AC-5 start moves lobby to playing',
    case when public.coop_start(obs[1], sid) ->> 'status' = 'playing' then 'ok' else 'FAIL' end;
  select version into ver from coop_sessions where id = sid;
  begin perform public.coop_move(obs[1], sid, ver, '{"v":1,"taps":1}'::jsonb, false); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%NOT_PLAYER%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('AC-8 observer move refused (NOT_PLAYER)', r);
  insert into res(t, r) select 'AC-8 session version unchanged',
    case when (select version from coop_sessions where id = sid) = ver then 'ok' else 'FAIL' end;

  -- AC-7 the player moves; a stale version is refused.
  fc := public.coop_move(p1, sid, ver, '{"v":1,"taps":1}'::jsonb, false) ->> 'first_completion';
  insert into res(t, r) values ('AC-7 player move accepted, first_completion false', case when fc = 'false' then 'ok' else 'FAIL: ' || coalesce(fc, 'null') end);
  begin perform public.coop_move(p1, sid, ver, '{"v":1,"taps":2}'::jsonb, false); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%STALE%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('AC-7 stale base version refused (STALE)', r);

  -- AC-9 solve completes the session and the scan together, once; AC-11 a second solve is refused.
  select version into ver from coop_sessions where id = sid;
  fc := public.coop_move(p1, sid, ver, '{"v":1,"taps":5}'::jsonb, true) ->> 'first_completion';
  insert into res(t, r) values ('AC-9 solve returns first_completion true', case when fc = 'true' then 'ok' else 'FAIL: ' || coalesce(fc, 'null') end);
  insert into res(t, r) select 'AC-9 scan completed with completed_at set in the same call',
    case when (select completed and completed_at is not null from bingo_scans where id = v_scan) then 'ok' else 'FAIL' end;
  insert into res(t, r) select 'AC-9 session status completed',
    case when (select status from coop_sessions where id = sid) = 'completed' then 'ok' else 'FAIL' end;
  select version into ver from coop_sessions where id = sid;
  begin perform public.coop_move(p1, sid, ver, '{"v":1,"taps":5}'::jsonb, true); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%ALREADY_COMPLETED%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('AC-11 second solve refused (ALREADY_COMPLETED)', r);

  -- AC-13 a member reading the session sees it as completed (resume).
  insert into res(t, r) select 'AC-13 coop_get shows the completed session to a team member',
    case when public.coop_get(obs[2], sid) ->> 'status' = 'completed' then 'ok' else 'FAIL' end;

  -- BUG-004-1 / AC-12: after the session is deleted (what coop_reset does), coop_get returns null, not NOT_ON_TEAM.
  delete from coop_sessions where id = sid;
  insert into res(t, r) select 'BUG-004-1 deleted session reads as null',
    case when public.coop_get(obs[2], sid) is null then 'ok' else 'FAIL' end;
  update bingo_scans set completed = false, completed_at = null where id = v_scan;

  -- State size cap on a fresh playing session.
  snap := public.coop_open(p1, v_scan, 'stub'); sid2 := (snap ->> 'session_id')::uuid;
  perform public.coop_open(obs[1], v_scan, 'stub');
  perform public.coop_start(p1, sid2);
  select version into ver from coop_sessions where id = sid2;
  begin perform public.coop_move(p1, sid2, ver, jsonb_build_object('v', 1, 'pad', repeat('x', 20001)), false); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%STATE_TOO_BIG%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('state over 20000 characters refused (STATE_TOO_BIG)', r);

  -- ===== PRD-007: Icon Matching with two players =====
  delete from coop_sessions where scan_id = v_scan;
  update bingo_scans set completed = false, completed_at = null where id = v_scan;
  init := jsonb_build_object('v', 1, 'cols', 4, 'flipped', '[]'::jsonb, 'matched', '[]'::jsonb, 'last', null,
    'cards', '["a","a","b","b","c","c","d","d","e","e","f","f","g","g","h","h"]'::jsonb);
  snap := public.coop_open(p1, v_scan, 'icon-matching'); sid := (snap ->> 'session_id')::uuid;
  perform public.coop_open(obs[1], v_scan, 'icon-matching');

  -- AC-1 start needs 2 players
  begin perform public.coop_start(p1, sid); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%LOBBY_INCOMPLETE%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-1 start refused with one player (LOBBY_INCOMPLETE)', r);

  -- AC-2 a second player joins, a third is refused, slots are 0 and 1
  perform public.coop_open(p2, v_scan, 'icon-matching');
  begin perform public.coop_open(p3, v_scan, 'icon-matching'); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%PLAYER_TAKEN%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-2 third player refused (PLAYER_TAKEN)', r);
  insert into res(t, r) select 'PRD-007 AC-2 the two players hold slots 0 and 1',
    case when (select array_agg(slot order by slot) from coop_session_members where session_id = sid and role = 'player') = array[0,1]::smallint[] then 'ok' else 'FAIL' end;

  -- a player silent for over 120 s is replaced and the newcomer takes the same slot
  update coop_session_members set last_seen = now() - interval '200 seconds' where session_id = sid and member_id = p2;
  perform public.coop_open(p3, v_scan, 'icon-matching');
  insert into res(t, r) select 'PRD-007 stale second player replaced, slot 1 reused',
    case when (select slot from coop_session_members where session_id = sid and member_id = p3) = 1
          and not exists (select 1 from coop_session_members where session_id = sid and member_id = p2) then 'ok' else 'FAIL' end;
  -- from here p1 (slot 0) and p3 (slot 1) are the players

  insert into res(t, r) select 'PRD-007 AC-1 start with 2 players and 1 observer',
    case when public.coop_start(p1, sid) ->> 'status' = 'playing' then 'ok' else 'FAIL' end;

  -- AC-8 observer, other-team member and a direct coop_move cannot pick
  begin perform public.coop_pick(obs[1], sid, 0, init); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%NOT_PLAYER%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-8 observer pick refused (NOT_PLAYER)', r);
  if xm is not null then
    begin perform public.coop_pick(xm, sid, 0, init); r := 'FAIL: no error';
    exception when others then r := case when sqlerrm like '%NOT_ON_TEAM%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
    insert into res(t, r) values ('PRD-007 AC-8 other team pick refused (NOT_ON_TEAM)', r);
  end if;
  select version into ver from coop_sessions where id = sid;
  begin perform public.coop_move(p1, sid, ver, init, false); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%USE_PICK%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-8 coop_move closed for icon-matching (USE_PICK)', r);
  insert into res(t, r) select 'PRD-007 AC-8 nothing changed by the refused calls',
    case when (select version from coop_sessions where id = sid) = ver and (select state from coop_sessions where id = sid) = '{}'::jsonb then 'ok' else 'FAIL' end;

  -- AC-3 a pick is locked; AC-6 one pick flips nothing; AC-9 the other player reads it
  perform public.coop_pick(p1, sid, 0, init);
  st := public.coop_get(p3, sid) -> 'state';
  insert into res(t, r) select 'PRD-007 AC-3/6/9 first pick stored under slot 0, nothing flipped, readable by the other player',
    case when st -> 'picks' = '{"0":0}'::jsonb and st -> 'flipped' = '[]'::jsonb then 'ok' else 'FAIL: ' || st::text end;
  begin perform public.coop_pick(p1, sid, 5, init); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%PICK_LOCKED%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-3 same player cannot pick twice (PICK_LOCKED)', r);

  -- AC-4 the other player's card is refused
  begin perform public.coop_pick(p3, sid, 0, init); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%PICK_TAKEN%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-4 other player''s card refused (PICK_TAKEN)', r);
  insert into res(t, r) select 'PRD-007 AC-4 no pick recorded for the refused call',
    case when (select state -> 'picks' from coop_sessions where id = sid) = '{"0":0}'::jsonb then 'ok' else 'FAIL' end;

  -- AC-10 the second pick needs no version and loses nothing; AC-7 a miss shows both cards
  perform public.coop_pick(p3, sid, 2, init);
  select state into st from coop_sessions where id = sid;
  insert into res(t, r) select 'PRD-007 AC-10 both picks recorded, evaluated as a miss',
    case when st -> 'flipped' = '[0,2]'::jsonb and st -> 'picks' = '{}'::jsonb and st ->> 'last' = 'miss' then 'ok' else 'FAIL: ' || st::text end;
  begin perform public.coop_pick(p1, sid, 4, init); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%PICK_LOCKED%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-7 no pick during the viewing period (PICK_LOCKED)', r);
  perform public.coop_hide(p1, sid);
  select version into ver from coop_sessions where id = sid;
  perform public.coop_hide(p3, sid);
  insert into res(t, r) select 'PRD-007 AC-7 hide turns a miss face-down once; a second hide changes nothing',
    case when (select state -> 'flipped' from coop_sessions where id = sid) = '[]'::jsonb
          and (select version from coop_sessions where id = sid) = ver then 'ok' else 'FAIL' end;

  -- AC-7 a match stays; the last pair completes session and card once
  perform public.coop_pick(p3, sid, 1, init); perform public.coop_pick(p1, sid, 0, init);
  insert into res(t, r) select 'PRD-007 AC-7 match stays marked, new turn has no picks',
    case when (select state -> 'matched' from coop_sessions where id = sid) = '[0,1]'::jsonb
          and (select state -> 'picks' from coop_sessions where id = sid) = '{}'::jsonb then 'ok' else 'FAIL' end;
  for k in 1..6 loop perform public.coop_pick(p1, sid, 2 * k, init); perform public.coop_pick(p3, sid, 2 * k + 1, init); end loop;
  perform public.coop_pick(p1, sid, 14, init);
  fc := public.coop_pick(p3, sid, 15, init) ->> 'first_completion';
  insert into res(t, r) values ('PRD-007 AC-7 last pair returns first_completion true', case when fc = 'true' then 'ok' else 'FAIL: ' || coalesce(fc, 'null') end);
  insert into res(t, r) select 'PRD-007 AC-7 session and scan completed together',
    case when (select status from coop_sessions where id = sid) = 'completed'
          and (select completed and completed_at is not null from bingo_scans where id = v_scan) then 'ok' else 'FAIL' end;
  begin perform public.coop_pick(p1, sid, 0, init); r := 'FAIL: no error';
  exception when others then r := case when sqlerrm like '%ALREADY_COMPLETED%' then 'ok' else 'FAIL: ' || sqlerrm end; end;
  insert into res(t, r) values ('PRD-007 AC-7 no pick after completion (ALREADY_COMPLETED)', r);
  delete from coop_sessions where id = sid;
  update bingo_scans set completed = false, completed_at = null where id = v_scan;

  -- Clean up: sessions, throwaway members, and the scan as it was.
  delete from coop_sessions where scan_id = v_scan;
  delete from bingo_members where id = any(made);
  update bingo_scans set completed = v_done, completed_at = v_done_at where id = v_scan;
  insert into res(t, r) values ('cleanup', 'ok: test members and sessions removed, scan restored');
exception when others then
  insert into res(t, r) values ('ABORTED (everything rolled back)', sqlerrm);
end $$;

select n, t, r from res order by n;
