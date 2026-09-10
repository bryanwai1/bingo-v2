-- AI Team Building: 10-activity marathon with QR mission pages, live scoring,
-- admin-password completion. Run in the Supabase SQL editor.

create table if not exists aitb_settings (
  id int primary key default 1 check (id = 1),
  admin_password text not null default '1994',
  updated_at timestamptz not null default now()
);
insert into aitb_settings (id) values (1) on conflict (id) do nothing;

create table if not exists aitb_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#fb7185',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists aitb_progress (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references aitb_teams(id) on delete cascade,
  activity_id int not null check (activity_id between 1 and 10),
  scanned_at timestamptz,
  steps_done int[] not null default '{}',
  completed_at timestamptz,
  bonus int not null default 0,
  created_at timestamptz not null default now(),
  unique (team_id, activity_id)
);
create index if not exists aitb_progress_team_idx on aitb_progress (team_id);

-- Permissive RLS to match the rest of this anon-keyed event app.
alter table aitb_settings enable row level security;
alter table aitb_teams    enable row level security;
alter table aitb_progress enable row level security;

drop policy if exists "anon rw aitb_settings" on aitb_settings;
drop policy if exists "anon rw aitb_teams"    on aitb_teams;
drop policy if exists "anon rw aitb_progress" on aitb_progress;

create policy "anon rw aitb_settings" on aitb_settings for all using (true) with check (true);
create policy "anon rw aitb_teams"    on aitb_teams    for all using (true) with check (true);
create policy "anon rw aitb_progress" on aitb_progress for all using (true) with check (true);

-- Realtime publication membership: subscriptions silently receive nothing
-- unless the table is in the publication (see Bingo Dash debugging history).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aitb_progress'
  ) then
    execute 'alter publication supabase_realtime add table public.aitb_progress';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aitb_teams'
  ) then
    execute 'alter publication supabase_realtime add table public.aitb_teams';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aitb_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.aitb_settings';
  end if;
end $$;

notify pgrst, 'reload schema';
