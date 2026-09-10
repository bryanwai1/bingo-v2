-- ============================================================
-- Shared events — two or more renters running one event together.
--
-- Default stays FULL ISOLATION: a renter cannot see another tenant's
-- boards. A shared event is an explicit, mutually-accepted exception
-- that grants READ ONLY across the members' boards, plus a combined
-- scoreboard that totals everyone.
--
-- Nobody can edit, complete or delete anything outside their own tenant.
-- For shared CONTROL, use a crew pass (20260729) — that is a different
-- and deliberately more dangerous thing.
-- ============================================================

-- ── 1. The event ────────────────────────────────────────────
create table if not exists public.bingo_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  created_by  uuid references public.bingo_accounts(id) on delete set null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 2. Who is in it ─────────────────────────────────────────
create table if not exists public.bingo_event_members (
  event_id   uuid not null references public.bingo_events(id) on delete cascade,
  account_id uuid not null references public.bingo_accounts(id) on delete cascade,
  status     text not null default 'invited'
               check (status in ('invited','accepted','declined','removed')),
  joined_at  timestamptz,
  primary key (event_id, account_id)
);

create index if not exists bingo_event_members_acct_idx
  on public.bingo_event_members(account_id, status);

-- ── 3. Which boards each member contributes ─────────────────
create table if not exists public.bingo_event_boards (
  event_id   uuid not null references public.bingo_events(id) on delete cascade,
  section_id uuid not null references public.bingo_sections(id) on delete cascade,
  added_by   uuid references public.bingo_accounts(id) on delete set null,
  primary key (event_id, section_id)
);

-- ── 4. Helper: events this caller has accepted ──────────────
create or replace function public.my_event_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select event_id from bingo_event_members
   where account_id = auth.uid() and status = 'accepted';
$$;

-- Sections visible to me through a shared event (never my own — those are
-- already covered by normal tenancy).
create or replace function public.shared_section_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select eb.section_id from bingo_event_boards eb
   where eb.event_id in (select public.my_event_ids());
$$;

-- ── 5. RLS ──────────────────────────────────────────────────
alter table public.bingo_events        enable row level security;
alter table public.bingo_event_members enable row level security;
alter table public.bingo_event_boards  enable row level security;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public'
             and tablename in ('bingo_events','bingo_event_members','bingo_event_boards')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

create policy "members read event" on public.bingo_events for select to authenticated
  using (public.is_bingo_owner() or id in (select public.my_event_ids()) or created_by = auth.uid());
create policy "creator writes event" on public.bingo_events for all to authenticated
  using (public.is_bingo_owner() or created_by = auth.uid())
  with check (public.is_bingo_owner() or created_by = auth.uid());

create policy "see own membership" on public.bingo_event_members for select to authenticated
  using (public.is_bingo_owner() or account_id = auth.uid()
         or event_id in (select public.my_event_ids()));
-- You may accept/decline your own invite; the creator manages the roster.
create policy "manage membership" on public.bingo_event_members for all to authenticated
  using (public.is_bingo_owner() or account_id = auth.uid()
         or exists (select 1 from bingo_events e where e.id = event_id and e.created_by = auth.uid()))
  with check (public.is_bingo_owner() or account_id = auth.uid()
         or exists (select 1 from bingo_events e where e.id = event_id and e.created_by = auth.uid()));

create policy "members read boards" on public.bingo_event_boards for select to authenticated
  using (public.is_bingo_owner() or event_id in (select public.my_event_ids()));
-- You may only contribute a board you actually own.
create policy "contribute own board" on public.bingo_event_boards for all to authenticated
  using (public.is_bingo_owner() or exists (
    select 1 from bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.is_bingo_owner() or exists (
    select 1 from bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));

-- ── 6. Join an event by code ────────────────────────────────
create or replace function public.join_event(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into e from bingo_events where upper(code) = upper(trim(coalesce(p_code,'')));
  if not found  then raise exception 'INVALID_CODE'; end if;
  if e.archived then raise exception 'EVENT_ARCHIVED'; end if;

  insert into bingo_event_members (event_id, account_id, status, joined_at)
  values (e.id, auth.uid(), 'accepted', now())
  on conflict (event_id, account_id)
    do update set status = 'accepted', joined_at = now();

  return json_build_object('ok', true, 'event', e.id, 'name', e.name);
end; $$;

-- ── 7. Create an event ──────────────────────────────────────
create or replace function public.create_event(p_name text)
returns public.bingo_events language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text; i int; r public.bingo_events;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_events where code = c);
  end loop;

  insert into bingo_events (name, code, created_by)
  values (coalesce(nullif(trim(p_name),''), 'Shared event'), c, auth.uid())
  returning * into r;

  insert into bingo_event_members (event_id, account_id, status, joined_at)
  values (r.id, auth.uid(), 'accepted', now());

  return r;
end; $$;

-- ── 8. The combined scoreboard — the "third board" ──────────
-- Tile points + duel bonuses + manual bonus, every team from every board
-- contributed to the event, in one ranking.
create or replace view public.event_scoreboard as
select
  eb.event_id,
  t.id            as team_id,
  t.name          as team_name,
  s.id            as section_id,
  s.name          as section_name,
  s.owner_id      as tenant_id,
  coalesce(tile.pts, 0)                          as tile_points,
  coalesce(duel.bonus, 0)                        as duel_bonus,
  coalesce(t.bonus_points, 0)                    as manual_bonus,
  coalesce(tile.pts,0) + coalesce(duel.bonus,0)
    + coalesce(t.bonus_points,0)                 as total_points,
  coalesce(tile.done, 0)                         as tiles_done
from bingo_event_boards eb
join bingo_sections s on s.id = eb.section_id
join bingo_teams    t on t.section_id = s.id
left join lateral (
  select count(*) as done, coalesce(sum(bt.points),0) as pts
  from bingo_scans sc
  join bingo_tasks bt on bt.id = sc.task_id
  where sc.team_id = t.id and sc.completed
) tile on true
left join lateral (
  select coalesce(sum(d.bonus_points),0) as bonus
  from bingo_duels d
  where d.winner_team_id = t.id and d.status = 'done'
) duel on true;

grant select on public.event_scoreboard to authenticated;
grant execute on function public.join_event(text)   to authenticated;
grant execute on function public.create_event(text) to authenticated;
grant execute on function public.my_event_ids()     to authenticated;
grant execute on function public.shared_section_ids() to authenticated;

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────
-- drop view if exists public.event_scoreboard;
-- drop function if exists public.join_event(text);
-- drop function if exists public.create_event(text);
-- drop function if exists public.shared_section_ids();
-- drop function if exists public.my_event_ids();
-- drop table if exists public.bingo_event_boards  cascade;
-- drop table if exists public.bingo_event_members cascade;
-- drop table if exists public.bingo_events        cascade;
-- notify pgrst, 'reload schema';
