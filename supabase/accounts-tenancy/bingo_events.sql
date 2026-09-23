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

-- Per-team totals across every board pooled into an event, for the combined
-- scoreboard.
--
-- Scoring must match src/lib/bingoLines.ts and the TypeScript scoreboards:
-- tile points are scaled by the bingo-line multiplier (1 + 0.2 per completed
-- line, so 1 line = x1.2, 2 = x1.4, uncapped at x3.4 for all 12), then the
-- duel bonus and the facilitator's manual bonus are added on top UNSCALED --
-- neither is board progress, so a line must not inflate them.
--
-- Recreated rather than replaced: total_points changes from int to numeric
-- once a fractional multiplier is involved, which create or replace forbids.
drop view if exists public.event_scoreboard;

create view public.event_scoreboard as
select
  eb.event_id,
  t.id            as team_id,
  t.name          as team_name,
  s.id            as section_id,
  s.name          as section_name,
  s.owner_id      as tenant_id,
  coalesce(tile.pts, 0)                          as tile_points,
  coalesce(line.lines, 0)                        as bingo_lines,
  -- The points the lines themselves are worth, surfaced on its own so a
  -- combined scoreboard can say where the jump came from.
  round(coalesce(tile.pts, 0) * 0.2 * coalesce(line.lines, 0), 2)
                                                 as line_bonus,
  coalesce(duel.bonus, 0)                        as duel_bonus,
  coalesce(t.bonus_points, 0)                    as manual_bonus,
  round(
    coalesce(tile.pts, 0) * (1 + 0.2 * coalesce(line.lines, 0))
    + coalesce(duel.bonus, 0)
    + coalesce(t.bonus_points, 0)
  , 2)                                           as total_points,
  coalesce(tile.done, 0)                         as tiles_done
from public.bingo_event_boards eb
join public.bingo_sections s on s.id = eb.section_id
join public.bingo_teams    t on t.section_id = s.id
-- Tile points and tiles done, counted over the cards actually PLACED on this
-- team's board -- the same set the TypeScript scoreboards build from
-- bingo_board_cards. Driving this from bingo_scans alone (as it did before)
-- also counted completed scans for cards no longer in the grid, e.g. a card
-- the facilitator removed mid-event: the scan row outlives the board edit, so
-- the app stopped counting it while this view kept doing so. The same per-box
-- / legacy-task_id matching as the line lateral below.
left join lateral (
  select count(*) as done, coalesce(sum(bt.points),0) as pts
  from public.bingo_board_cards bc
  join public.bingo_tasks bt on bt.id = bc.task_id
  join public.bingo_scans sc
    on sc.team_id = t.id
   and sc.completed
   and (
     sc.board_card_id = bc.id
     or (sc.board_card_id is null and sc.task_id = bc.task_id)
   )
  where bc.section_id = s.id
) tile on true
left join lateral (
  select coalesce(sum(d.bonus_points),0) as bonus
  from public.bingo_duels d
  where d.winner_team_id = t.id and d.status = 'done'
) duel on true
-- Completed bingo lines. Mirrors completedBingoLines(): a line counts when
-- every one of its 5 board slots is crossed off. Completion is matched per
-- BOX (scans.board_card_id), with the pre-20260910 fallback of matching on
-- task_id for legacy scans recorded before that column existed -- the same
-- two-tier rule the TypeScript scoreboards apply.
--
-- Note: this reads bingo_board_cards.slot directly and so does not replicate
-- buildBingoSlots()'s repacking of out-of-range or duplicate slots. Boards
-- authored through the admin always use a unique slot 0..24, where the two
-- agree exactly.
left join lateral (
  select count(*) as lines
  from (values
    ('{0,1,2,3,4}'::int[]),    ('{5,6,7,8,9}'::int[]),
    ('{10,11,12,13,14}'::int[]), ('{15,16,17,18,19}'::int[]),
    ('{20,21,22,23,24}'::int[]),
    ('{0,5,10,15,20}'::int[]), ('{1,6,11,16,21}'::int[]),
    ('{2,7,12,17,22}'::int[]), ('{3,8,13,18,23}'::int[]),
    ('{4,9,14,19,24}'::int[]),
    ('{0,6,12,18,24}'::int[]), ('{4,8,12,16,20}'::int[])
  ) as l(line)
  where l.line <@ (
    select coalesce(array_agg(bc.slot), '{}'::int[])
    from public.bingo_board_cards bc
    join public.bingo_scans sc
      on sc.team_id = t.id
     and sc.completed
     and (
       sc.board_card_id = bc.id
       or (sc.board_card_id is null and sc.task_id = bc.task_id)
     )
    where bc.section_id = s.id
  )
) line on true;

grant select on public.event_scoreboard to authenticated;
