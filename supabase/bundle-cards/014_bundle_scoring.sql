-- ============================================================
-- Bundle activity scoring, ported from the company AITB app.
--
--   +100  check-in
--   +100  per step ticked
--   +200 / 350 / 500  completion, by Easy / Normal / Hard
--   +speed bonus from the activity's tier ladder x difficulty multiplier
--
-- The clock starts at check-in and is per team per activity, so a team that
-- starts later is not punished for it. Steps are stored as an int array
-- rather than a count so a team can tick them out of order and untick a
-- mistake without losing the rest.
-- ============================================================

alter table public.bingo_bundle_progress
  add column if not exists checked_in_at timestamptz,
  add column if not exists steps_done    int[] not null default '{}',
  add column if not exists bonus         int   not null default 0,
  add column if not exists difficulty    text  not null default 'Normal'
    check (difficulty in ('Easy','Normal','Hard'));

comment on column public.bingo_bundle_progress.checked_in_at is
  'Starts this team''s clock for this activity. The speed bonus is measured from here.';

-- ── Check in: starts the clock, awards the flat +100 ────────
create or replace function public.checkin_bundle_activity(
  p_team uuid, p_bundle uuid, p_activity uuid, p_difficulty text default 'Normal'
) returns json language plpgsql security definer set search_path = public as $$
begin
  -- Re-opening an activity must not restart the clock, or a team could reset
  -- their way back to the top speed tier.
  insert into bingo_bundle_progress
    (team_id, bundle_id, activity_id, status, checked_in_at, difficulty)
  values (p_team, p_bundle, p_activity, 'pending', now(), coalesce(p_difficulty,'Normal'))
  on conflict (team_id, activity_id) do update
     set checked_in_at = coalesce(bingo_bundle_progress.checked_in_at, now()),
         difficulty    = coalesce(excluded.difficulty, bingo_bundle_progress.difficulty);
  return json_build_object('ok', true);
end; $$;

-- ── Tick or untick one step ─────────────────────────────────
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

-- ── Total points for one progress row ───────────────────────
create or replace function public.bundle_activity_points(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when p.checked_in_at is null then 0 else 100 end
       + coalesce(array_length(p.steps_done, 1), 0) * 100
       + case p.status when 'approved' then
           case p.difficulty when 'Easy' then 200 when 'Hard' then 500 else 350 end + p.bonus
         else 0 end
  from bingo_bundle_progress p where p.id = p_id;
$$;

-- ── Team total across a bundle ──────────────────────────────
create or replace view public.bundle_team_points as
select p.team_id, p.bundle_id,
       sum(case when p.checked_in_at is null then 0 else 100 end
         + coalesce(array_length(p.steps_done, 1), 0) * 100
         + case p.status when 'approved' then
             case p.difficulty when 'Easy' then 200 when 'Hard' then 500 else 350 end + p.bonus
           else 0 end) as points,
       count(*) filter (where p.status = 'approved') as approved,
       count(*) as started
from bingo_bundle_progress p
group by p.team_id, p.bundle_id;

grant select on public.bundle_team_points to anon, authenticated;
grant execute on function public.checkin_bundle_activity(uuid,uuid,uuid,text) to anon, authenticated;
grant execute on function public.toggle_bundle_step(uuid,uuid,int,boolean)    to anon, authenticated;
grant execute on function public.bundle_activity_points(uuid)                 to anon, authenticated;

notify pgrst, 'reload schema';
