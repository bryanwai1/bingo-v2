-- bundle-cards business logic. Run after bingo_bundle_items.sql and
-- bingo_bundle_progress.sql.

-- Submit one activity for review (marshal on the spot, or the host later
-- in Submissions). Snapshots the activity's current points at submit time.
create or replace function public.submit_bundle_activity(
  p_team uuid, p_bundle uuid, p_activity uuid
) returns json language plpgsql security definer set search_path = public as $$
declare pts int;
begin
  select points into pts from bingo_tasks where id = p_activity;
  insert into bingo_bundle_progress (team_id, bundle_id, activity_id, status, points, submitted_at)
  values (p_team, p_bundle, p_activity, 'submitted', coalesce(pts,0), now())
  on conflict (team_id, activity_id) do update
    set status = 'submitted', submitted_at = now()
    where bingo_bundle_progress.status <> 'approved';
  return json_build_object('ok', true);
end; $$;

-- Approve or reject one activity. Marshal code or an authenticated host
-- who owns the board — never the team itself.
create or replace function public.review_bundle_activity(
  p_id uuid, p_approve boolean, p_code text default null
) returns json language plpgsql security definer set search_path = public as $$
declare r record; sec record; ok boolean := false;
begin
  select * into r from bingo_bundle_progress where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Host route: signed in and owns the board.
  select s.* into sec from bingo_teams t join bingo_sections s on s.id = t.section_id
   where t.id = r.team_id;
  if auth.uid() is not null and public.bingo_can_write(sec.owner_id) then ok := true; end if;

  -- Marshal route: the board's marshal password, typed on the spot.
  if not ok and p_code is not null
     and upper(trim(p_code)) = upper(coalesce(sec.marshal_password,'')) then ok := true; end if;

  if not ok then raise exception 'NOT_AUTHORISED'; end if;

  update bingo_bundle_progress
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  return json_build_object('ok', true, 'approved', p_approve);
end; $$;

-- Check in: starts the clock, records difficulty. Re-opening an activity
-- must not restart the clock, or a team could reset their way back to the
-- top speed tier.
create or replace function public.checkin_bundle_activity(
  p_team uuid, p_bundle uuid, p_activity uuid, p_difficulty text default 'Normal'
) returns json language plpgsql security definer set search_path = public as $$
begin
  insert into bingo_bundle_progress
    (team_id, bundle_id, activity_id, status, checked_in_at, difficulty)
  values (p_team, p_bundle, p_activity, 'pending', now(), coalesce(p_difficulty,'Normal'))
  on conflict (team_id, activity_id) do update
     set checked_in_at = coalesce(bingo_bundle_progress.checked_in_at, now()),
         difficulty    = coalesce(excluded.difficulty, bingo_bundle_progress.difficulty);
  return json_build_object('ok', true);
end; $$;

-- Tick or untick one step.
create or replace function public.toggle_bundle_step(
  p_team uuid, p_activity uuid, p_step int, p_on boolean
) returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from bingo_bundle_progress
   where team_id = p_team and activity_id = p_activity;
  if not found then raise exception 'NOT_CHECKED_IN'; end if;
  if r.status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;

  update bingo_bundle_progress
     set steps_done = case
           when p_on then (select array_agg(distinct x order by x)
                             from unnest(steps_done || p_step) as x)
           else array_remove(steps_done, p_step)
         end
   where id = r.id;

  return json_build_object('ok', true);
end; $$;

-- Total points for one progress row: +100 check-in, +100 per step, plus (if
-- approved) a difficulty-based completion bonus + the manually-set bonus.
create or replace function public.bundle_activity_points(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when p.checked_in_at is null then 0 else 100 end
       + coalesce(array_length(p.steps_done, 1), 0) * 100
       + case p.status when 'approved' then
           case p.difficulty when 'Easy' then 200 when 'Hard' then 500 else 350 end + p.bonus
         else 0 end
  from bingo_bundle_progress p where p.id = p_id;
$$;

-- Save the interactive-module result for one activity (cup words, roulette
-- genre/topic, dealt cards, retro game tracker).
create or replace function public.save_bundle_words(
  p_team uuid, p_activity uuid, p_words text[]
) returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from bingo_bundle_progress
   where team_id = p_team and activity_id = p_activity;
  if not found then raise exception 'NOT_CHECKED_IN'; end if;
  if r.status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;

  update bingo_bundle_progress set words = p_words where id = r.id;

  return json_build_object('ok', true);
end; $$;

grant execute on function public.submit_bundle_activity(uuid,uuid,uuid)   to anon, authenticated;
grant execute on function public.review_bundle_activity(uuid,boolean,text) to anon, authenticated;
grant execute on function public.checkin_bundle_activity(uuid,uuid,uuid,text) to anon, authenticated;
grant execute on function public.toggle_bundle_step(uuid,uuid,int,boolean)    to anon, authenticated;
grant execute on function public.bundle_activity_points(uuid)                 to anon, authenticated;
grant execute on function public.save_bundle_words(uuid,uuid,text[]) to anon, authenticated;
