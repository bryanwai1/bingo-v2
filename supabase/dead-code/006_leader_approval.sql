-- ============================================================
-- Team leader approval
--
-- Problem: four members on four phones all submit the same tile, and
-- everything lands on the host. At a 700-person event that is noise the
-- marshal cannot triage.
--
-- Fix: one member per team is the LEADER. Members submit; the leader
-- approves; only approved completions reach the host and the scoreboard.
-- Contest cards are unaffected — those still resolve via the referee code.
-- ============================================================

-- ── 1. Submission trail on the scan row ─────────────────────
alter table public.bingo_scans
  add column if not exists submitted_by  uuid,
  add column if not exists submitted_at  timestamptz,
  add column if not exists approved_by   uuid,
  add column if not exists pending       boolean not null default false;

comment on column public.bingo_scans.pending is
  'True when a member has submitted but the team leader has not approved yet. The tile shows as awaiting-approval and scores nothing.';

create index if not exists bingo_scans_pending_idx
  on public.bingo_scans(team_id, pending) where pending;

-- ── 2. One leader per team ──────────────────────────────────
-- role is free text today ('member' | 'observer'); 'leader' joins it.
create unique index if not exists bingo_members_one_leader_per_team
  on public.bingo_members(team_id) where role = 'leader';

-- ── 3. First joiner becomes the leader ──────────────────────
create or replace function public.claim_team_leader()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member'
     and not exists (select 1 from bingo_members
                     where team_id = new.team_id and role = 'leader')
  then
    new.role := 'leader';
  end if;
  return new;
end; $$;

drop trigger if exists on_member_join_claim_leader on public.bingo_members;
create trigger on_member_join_claim_leader
  before insert on public.bingo_members
  for each row execute function public.claim_team_leader();

-- ── 4. Member submits (pending, scores nothing) ─────────────
create or replace function public.submit_tile(
  p_team uuid, p_task uuid, p_member uuid
) returns json language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  select id into existing from bingo_scans where team_id = p_team and task_id = p_task;
  if existing is not null then
    update bingo_scans
       set pending = true, submitted_by = p_member, submitted_at = now()
     where id = existing and completed = false;
  else
    insert into bingo_scans (team_id, task_id, completed, pending, submitted_by, submitted_at)
    values (p_team, p_task, false, true, p_member, now())
    returning id into existing;
  end if;
  return json_build_object('ok', true, 'scan_id', existing);
end; $$;

-- ── 5. Leader approves or rejects ───────────────────────────
create or replace function public.approve_tile(
  p_scan uuid, p_leader uuid, p_approve boolean default true
) returns json language plpgsql security definer set search_path = public as $$
declare sc record; ldr record;
begin
  select * into sc from bingo_scans where id = p_scan;
  if not found then raise exception 'SCAN_NOT_FOUND'; end if;

  select * into ldr from bingo_members where id = p_leader;
  if not found                    then raise exception 'MEMBER_NOT_FOUND'; end if;
  if ldr.team_id <> sc.team_id    then raise exception 'NOT_YOUR_TEAM';    end if;
  if ldr.role    <> 'leader'      then raise exception 'NOT_THE_LEADER';   end if;

  if p_approve then
    update bingo_scans
       set completed = true, completed_at = now(),
           pending = false, approved_by = p_leader
     where id = p_scan;
  else
    update bingo_scans
       set pending = false, submitted_by = null, submitted_at = null
     where id = p_scan;
  end if;

  return json_build_object('ok', true, 'approved', p_approve);
end; $$;

-- ── 6. Owner/marshal can hand the leader role to someone else ──
create or replace function public.set_team_leader(p_member uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from bingo_members where id = p_member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  update bingo_members set role = 'member' where team_id = m.team_id and role = 'leader';
  update bingo_members set role = 'leader' where id = p_member;
  return json_build_object('ok', true, 'leader', p_member);
end; $$;

grant execute on function public.submit_tile(uuid, uuid, uuid)        to anon, authenticated;
grant execute on function public.approve_tile(uuid, uuid, boolean)    to anon, authenticated;
grant execute on function public.set_team_leader(uuid)                to authenticated;

notify pgrst, 'reload schema';
