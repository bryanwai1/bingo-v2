-- ============================================================
-- Bundle cards: one tile that contains a set of activities.
--
-- The AI Team Building pack is ten activities that belong together. Placing
-- them as ten separate tiles eats most of a 25-slot board and makes the set
-- look like ten unrelated challenges. A bundle is one tile holding the
-- ordered set.
--
-- Scoring (decided with Bryan): points are earned PER ACTIVITY, not for the
-- bundle as a whole — a team that finishes six of ten keeps the six. Each
-- activity is approved individually, either by a marshal on the spot or by
-- the host later in Submissions, so a team is never blocked waiting for one
-- approval before starting the next.
-- ============================================================

alter table public.bingo_tasks
  add column if not exists is_bundle boolean not null default false;

comment on column public.bingo_tasks.is_bundle is
  'One tile holding several activities. Children live in bingo_bundle_items.';

create table if not exists public.bingo_bundle_items (
  id           uuid primary key default gen_random_uuid(),
  bundle_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  activity_id  uuid not null references public.bingo_tasks(id) on delete cascade,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (bundle_id, activity_id)
);

create index if not exists bingo_bundle_items_bundle_idx
  on public.bingo_bundle_items(bundle_id, sort_order);

-- Per-activity progress. Separate from bingo_scans because a scan is one tile
-- per team, and a bundle needs one row per activity per team.
create table if not exists public.bingo_bundle_progress (
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
  unique (team_id, activity_id)
);

create index if not exists bingo_bundle_progress_team_idx
  on public.bingo_bundle_progress(team_id, bundle_id);
create index if not exists bingo_bundle_progress_pending_idx
  on public.bingo_bundle_progress(status) where status = 'submitted';

alter table public.bingo_bundle_items    enable row level security;
alter table public.bingo_bundle_progress enable row level security;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public'
             and tablename in ('bingo_bundle_items','bingo_bundle_progress')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

create policy "read open" on public.bingo_bundle_items for select using (true);
create policy "tenant write" on public.bingo_bundle_items for all to authenticated
  using (exists (select 1 from public.bingo_tasks t
                 where t.id = bundle_id and public.bingo_can_write(t.owner_id)))
  with check (exists (select 1 from public.bingo_tasks t
                 where t.id = bundle_id and public.bingo_can_write(t.owner_id)));

create policy "read open" on public.bingo_bundle_progress for select using (true);
-- Players are anonymous, so they may submit; only the RPC below approves.
create policy "anon submit" on public.bingo_bundle_progress for insert to anon with check (true);
create policy "anon update own" on public.bingo_bundle_progress for update to anon
  using (status in ('pending','submitted'))
  with check (status in ('pending','submitted'));

-- ── Submit one activity ─────────────────────────────────────
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

-- ── Approve or reject one activity ──────────────────────────
-- Marshal code or an authenticated host; never the team itself.
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

grant execute on function public.submit_bundle_activity(uuid,uuid,uuid)   to anon, authenticated;
grant execute on function public.review_bundle_activity(uuid,boolean,text) to anon, authenticated;

-- ── Build the AI Team Building bundle from existing cards ───
do $$
declare sec uuid; b uuid; a record; i int := 0;
begin
  select section_id into sec from bingo_tasks
   where category = 'AI Team Building' limit 1;
  if sec is null then raise notice 'No AI Team Building cards found'; return; end if;

  select id into b from bingo_tasks where title = 'AI Team Building (Full Set)';
  if b is null then
    insert into bingo_tasks (section_id, title, color, hex_code, category, points,
                             sort_order, in_grid, task_type, require_marshal, is_bundle)
    values (sec, 'AI Team Building (Full Set)', 'AI Team Building', '#8b5cf6',
            'AI Team Building', 0, 0, true, 'standard', true, true)
    returning id into b;
  end if;

  for a in select id from bingo_tasks
            where category = 'AI Team Building' and id <> b and not is_bundle
            order by sort_order
  loop
    insert into bingo_bundle_items (bundle_id, activity_id, sort_order)
    values (b, a.id, i) on conflict do nothing;
    i := i + 1;
  end loop;
  raise notice 'Bundle has % activities', i;
end $$;

notify pgrst, 'reload schema';
