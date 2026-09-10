-- bingo_bundle_progress: per-activity progress within a bundle tile — one
-- row per (team, activity), separate from bingo_scans because a scan is
-- one tile per team and a bundle needs one row per activity per team.
-- Source: bundle-cards/013_bundle_cards.sql, widened by
-- bundle-cards/014_bundle_scoring.sql, bundle-cards/015_bundle_words.sql.
--
-- Scoring (ported from the standalone AITB app; see functions.sql for the
-- exact math): +100 check-in, +100 per step ticked, +200/350/500 completion
-- by Easy/Normal/Hard, plus a manually-set bonus. The clock starts at
-- check-in and is per team per activity, so a team that starts later isn't
-- punished for it.

create table public.bingo_bundle_progress (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.bingo_teams(id) on delete cascade,
  bundle_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  activity_id  uuid not null references public.bingo_tasks(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','submitted','approved','rejected')),
  points       int not null default 0,
  submitted_at timestamptz,
  approved_at  timestamptz,
  approved_by  uuid,

  -- (tracked) bundle-cards/014_bundle_scoring.sql
  -- Starts this team's clock for this activity. The speed bonus is
  -- measured from here.
  checked_in_at timestamptz,
  -- Stored as an int array rather than a count so a team can tick steps
  -- out of order and untick a mistake without losing the rest.
  steps_done    int[] not null default '{}',
  bonus         int   not null default 0,
  difficulty    text  not null default 'Normal'
    check (difficulty in ('Easy','Normal','Hard')),

  -- (tracked) bundle-cards/015_bundle_words.sql
  -- Result slots for this activity's interactive module (cup words,
  -- roulette genre/topic, dealt cards, retro game tracker) — set once by
  -- whichever phone completes it first, then read by every teammate.
  words         text[] not null default '{}',

  unique (team_id, activity_id)
);

comment on column public.bingo_bundle_progress.checked_in_at is 'Starts this team''s clock for this activity. The speed bonus is measured from here.';
comment on column public.bingo_bundle_progress.words is 'Result slots for this activity''s interactive module (cup words, roulette genre/topic, dealt cards, retro game tracker) — set once by whichever phone completes it first, then read by every teammate.';

create index bingo_bundle_progress_team_idx on public.bingo_bundle_progress(team_id, bundle_id);
create index bingo_bundle_progress_pending_idx on public.bingo_bundle_progress(status) where status = 'submitted';

alter table public.bingo_bundle_progress enable row level security;

create policy "read open" on public.bingo_bundle_progress for select using (true);
-- Players are anonymous, so they may submit; only review_bundle_activity()
-- (functions.sql) approves.
create policy "anon submit" on public.bingo_bundle_progress for insert to anon with check (true);
create policy "anon update own" on public.bingo_bundle_progress for update to anon
  using (status in ('pending','submitted'))
  with check (status in ('pending','submitted'));

-- Team total across a bundle: points, activities approved, activities started.
create view public.bundle_team_points as
select p.team_id, p.bundle_id,
       sum(case when p.checked_in_at is null then 0 else 100 end
         + coalesce(array_length(p.steps_done, 1), 0) * 100
         + case p.status when 'approved' then
             case p.difficulty when 'Easy' then 200 when 'Hard' then 500 else 350 end + p.bonus
           else 0 end) as points,
       count(*) filter (where p.status = 'approved') as approved,
       count(*) as started
from public.bingo_bundle_progress p
group by p.team_id, p.bundle_id;

grant select on public.bundle_team_points to anon, authenticated;
