-- ============================================================
-- Rental accounts, step 3/3: Flag Retrieval tenant columns
-- Run AFTER 20260702_bingo_account_games.sql.
--
-- TIMING: run this IMMEDIATELY BEFORE deploying the Phase B build, not
-- days earlier. Sections 1-2 are additive, but section 3 changes the
-- `settings` primary key from (key) to (id): until the new build is
-- live, SAVING Flag Retrieval admin settings (marshal password, points
-- toggle) and the briefing-slide sync will error. Reads are unaffected,
-- so participants and projectors keep working. Do not run during a live
-- event.
-- ============================================================

-- 1. Tenant column on FR config/gameplay roots. NULL = owner/house data
--    (same convention as bingo_tasks/bingo_sections). team_members and
--    team_scans inherit tenancy through their team.
alter table public.tasks add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.teams add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists tasks_owner_idx on public.tasks(owner_id);
create index if not exists teams_owner_idx on public.teams(owner_id);

-- 2. Team names unique PER TENANT, not globally. The FR admin auto-seeds
--    "Group 1".."Group 17" on first load; with the old global unique(name)
--    a second tenant's seeding would fail. NULLS NOT DISTINCT so the
--    owner's NULL tenant also gets one namespace (needs PG15+, Supabase
--    default).
alter table public.teams drop constraint if exists teams_name_key;
drop index if exists public.teams_name_key;
create unique index if not exists teams_owner_name_key
  on public.teams (owner_id, name) nulls not distinct;

-- 3. settings: key-value singleton -> per-tenant key-value.
--    Old shape (created ad hoc, DDL not in repo): key text primary key, value text.
--    New shape: surrogate id PK + unique (owner_id, key). The app upserts
--    with onConflict: 'owner_id,key' after Phase B.
create table if not exists public.settings (
  key   text not null,
  value text
);
alter table public.settings add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.settings add column if not exists id uuid not null default gen_random_uuid();

do $$
declare
  pk_name text;
  pk_cols text[];
begin
  select c.conname,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(c.conkey) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
    into pk_name, pk_cols
    from pg_constraint c
   where c.conrelid = 'public.settings'::regclass and c.contype = 'p';

  if pk_name is null then
    execute 'alter table public.settings add primary key (id)';
  elsif pk_cols <> array['id'] then
    execute format('alter table public.settings drop constraint %I', pk_name);
    execute 'alter table public.settings add primary key (id)';
  end if;
end $$;

create unique index if not exists settings_owner_key
  on public.settings (owner_id, key) nulls not distinct;

-- 4. Make sure FR tables are in the realtime publication (some were added
--    by earlier migrations; this is idempotent).
do $$
declare t text;
begin
  foreach t in array array['tasks', 'teams', 'team_scans', 'team_members', 'task_links', 'settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
