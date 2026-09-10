-- aitb_progress: one row per (team, activity) in the standalone AI Team
-- Building marathon app (/aitb). Source: aitb/20260723_aitb.sql, widened
-- by aitb/20260723_aitb_words.sql.

create table public.aitb_progress (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.aitb_teams(id) on delete cascade,
  activity_id int not null check (activity_id between 1 and 10),
  scanned_at timestamptz,
  steps_done int[] not null default '{}',
  completed_at timestamptz,
  bonus int not null default 0,
  created_at timestamptz not null default now(),

  -- (tracked) aitb/20260723_aitb_words.sql
  -- Word submissions: Nerf Prompt Cups (3 secret words) and Ping Pong
  -- Alphabet Pitch (7 letter words) let teams type their words on the
  -- mission page; they surface live in the admin panel.
  words text[] not null default '{}',

  unique (team_id, activity_id)
);

create index aitb_progress_team_idx on public.aitb_progress (team_id);

alter table public.aitb_progress enable row level security;
create policy "anon rw aitb_progress" on public.aitb_progress for all using (true) with check (true);

alter publication supabase_realtime add table public.aitb_progress;
