-- bingo_events: an opt-in, read-only sharing group across renters — several
-- accounts run the same day and pool their boards onto one combined
-- scoreboard. Source: accounts-tenancy/009_shared_events.sql.

create table public.bingo_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  created_by  uuid references public.bingo_accounts(id) on delete set null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.bingo_events enable row level security;

create policy "members read event" on public.bingo_events for select to authenticated
  using (public.is_bingo_owner() or id in (select public.my_event_ids()) or created_by = auth.uid());
create policy "creator writes event" on public.bingo_events for all to authenticated
  using (public.is_bingo_owner() or created_by = auth.uid())
  with check (public.is_bingo_owner() or created_by = auth.uid());

-- Per-team totals (tile points + duel bonus + manual bonus) across every
-- board pooled into an event, for the combined scoreboard.
create view public.event_scoreboard as
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
from public.bingo_event_boards eb
join public.bingo_sections s on s.id = eb.section_id
join public.bingo_teams    t on t.section_id = s.id
left join lateral (
  select count(*) as done, coalesce(sum(bt.points),0) as pts
  from public.bingo_scans sc
  join public.bingo_tasks bt on bt.id = sc.task_id
  where sc.team_id = t.id and sc.completed
) tile on true
left join lateral (
  select coalesce(sum(d.bonus_points),0) as bonus
  from public.bingo_duels d
  where d.winner_team_id = t.id and d.status = 'done'
) duel on true;

grant select on public.event_scoreboard to authenticated;
