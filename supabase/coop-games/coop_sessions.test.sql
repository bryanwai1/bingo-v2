-- RPC checks for 20261103_coop_sessions.sql. Plain SQL: paste the whole file into the
-- Supabase SQL editor of a SANDBOX project (after running the migration) and press Run.
-- No psql meta-commands, no uuids to fill in.
--
-- What it does: picks one existing bingo_scans row (and its team) that has no co-op session,
-- creates throwaway members (2 players, 10 observers, 1 member of another team if a second
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
  p1 uuid; p2 uuid; xm uuid; o uuid;
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
  made := made || p1 || p2;
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

  -- Clean up: sessions, throwaway members, and the scan as it was.
  delete from coop_sessions where scan_id = v_scan;
  delete from bingo_members where id = any(made);
  update bingo_scans set completed = v_done, completed_at = v_done_at where id = v_scan;
  insert into res(t, r) values ('cleanup', 'ok: test members and sessions removed, scan restored');
exception when others then
  insert into res(t, r) values ('ABORTED (everything rolled back)', sqlerrm);
end $$;

select n, t, r from res order by n;
