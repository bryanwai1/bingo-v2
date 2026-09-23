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

-- Dropped first: the view below depends on these.
drop view if exists public.event_scoreboard;
drop function if exists public.bingo_line_multiplier(int);

-- Per-team board score. Must match scoreWithBingoLines() in
-- src/lib/bingoLines.ts.
--
-- A completed line pays a multiplier on THE BOXES THAT FORM IT: the 1st line
-- a team completes pays x1.2 on the total of its five boxes, the 2nd x1.4,
-- then x1.6, x1.8, x2.0 -- five lines' worth of bonus and no more.
--
--   Line 1 (row 1):  100+100+100+100+100 = 500 x 1.2 = 600
--   Line 2 (col 1):  100+100+100+100+100 = 500 x 1.4 = 700
--   3 boxes in no line:                               300
--                                            TOTAL = 1600
--
--  * A box on a crossing point counts in EVERY line it belongs to (box 1
--    above is paid in both lines).
--  * A box in no paying line is paid once at face value, so a box is never
--    paid its face value AND a line multiple.
--
-- The multiplier a line earns depends on how many lines came before it, so
-- this replays the board in completed_at order to establish that sequence.
--
-- Only cards actually PLACED on the board count -- the same set the
-- TypeScript builds from bingo_board_cards. Completion is matched per BOX
-- (scans.board_card_id), with the pre-20260910 fallback of matching on
-- task_id for legacy scans recorded before that column existed.
create or replace function public.bingo_team_board_score(
  p_team uuid,
  p_section uuid
)
returns table (tile_points numeric, tiles_done int, bingo_lines int, scaled_points numeric)
language plpgsql
stable
parallel safe
as $$
declare
  all_lines int[][] := array[
    array[0,1,2,3,4],      array[5,6,7,8,9],      array[10,11,12,13,14],
    array[15,16,17,18,19], array[20,21,22,23,24],
    array[0,5,10,15,20],   array[1,6,11,16,21],   array[2,7,12,17,22],
    array[3,8,13,18,23],   array[4,9,14,19,24],
    array[0,6,12,18,24],   array[4,8,12,16,20]
  ];
  pts       numeric[] := array_fill(null::numeric, array[25]);  -- slot -> points
  done      int[]   := '{}';
  order_of  int[]   := '{}';   -- line indexes, in the order they completed
  paid      int[]   := '{}';   -- slots already paid through a line
  total     numeric := 0;
  raw       numeric := 0;
  n_done    int     := 0;
  line      int[];
  line_total numeric;
  i         int;
  k         int;
  slot      int;
  rec       record;
begin
  -- 1. Replay in completion order, recording when each line completes.
  for rec in
    select bc.slot as slot,
           coalesce(bt.points, 0)::numeric as points,
           min(coalesce(sc.completed_at, 'epoch'::timestamptz)) as done_at
    from public.bingo_board_cards bc
    join public.bingo_tasks bt on bt.id = bc.task_id
    join public.bingo_scans sc
      on sc.team_id = p_team
     and sc.completed
     and (
       sc.board_card_id = bc.id
       or (sc.board_card_id is null and sc.task_id = bc.task_id)
     )
    where bc.section_id = p_section
      and bc.slot between 0 and 24
    group by bc.id, bc.slot, bt.points
    -- Ties and legacy scans with no completed_at fall back to slot order, so
    -- the result is deterministic either way.
    order by done_at, bc.slot
  loop
    raw    := raw + rec.points;
    n_done := n_done + 1;
    done   := done || rec.slot;
    pts[rec.slot + 1] := rec.points;   -- Postgres arrays are 1-based

    for i in 1..array_length(all_lines, 1) loop
      if i = any(order_of) then continue; end if;
      line := array[all_lines[i][1], all_lines[i][2], all_lines[i][3],
                    all_lines[i][4], all_lines[i][5]];
      if line <@ done then
        order_of := order_of || i;
      end if;
    end loop;
  end loop;

  -- 2. The first five lines each pay their own boxes at their own multiplier.
  for k in 1..least(coalesce(array_length(order_of, 1), 0), 5) loop
    i := order_of[k];
    line := array[all_lines[i][1], all_lines[i][2], all_lines[i][3],
                  all_lines[i][4], all_lines[i][5]];
    line_total := 0;
    foreach slot in array line loop
      line_total := line_total + coalesce(pts[slot + 1], 0);
      if not (slot = any(paid)) then paid := paid || slot; end if;
    end loop;
    total := total + line_total * (1 + 0.2 * k);
  end loop;

  -- 3. Every other completed box is paid once at face value.
  foreach slot in array done loop
    if not (slot = any(paid)) then
      total := total + coalesce(pts[slot + 1], 0);
    end if;
  end loop;

  tile_points   := raw;
  tiles_done    := n_done;
  bingo_lines   := coalesce(array_length(order_of, 1), 0);
  scaled_points := total;
  return next;
end;
$$;

-- Per-team totals across every board pooled into an event, for the combined
-- scoreboard. The duel bonus and the facilitator's manual bonus are added on
-- top of the board score UNSCALED -- neither is board progress, so a line
-- must not inflate them.
--
-- Recreated rather than replaced (dropped above): total_points changes from
-- int to numeric once a fractional multiplier is involved, which
-- create or replace forbids.
create view public.event_scoreboard as
select
  eb.event_id,
  t.id            as team_id,
  t.name          as team_name,
  s.id            as section_id,
  s.name          as section_name,
  s.owner_id      as tenant_id,
  round(board.tile_points, 2)                    as tile_points,
  board.bingo_lines                              as bingo_lines,
  -- What the lines added on their own, so a combined scoreboard can say where
  -- the jump came from instead of the total silently growing.
  round(board.scaled_points - board.tile_points, 2) as line_bonus,
  coalesce(duel.bonus, 0)                        as duel_bonus,
  coalesce(t.bonus_points, 0)                    as manual_bonus,
  round(
    board.scaled_points
    + coalesce(duel.bonus, 0)
    + coalesce(t.bonus_points, 0)
  , 2)                                           as total_points,
  board.tiles_done                               as tiles_done
from public.bingo_event_boards eb
join public.bingo_sections s on s.id = eb.section_id
join public.bingo_teams    t on t.section_id = s.id
left join lateral public.bingo_team_board_score(t.id, s.id) board on true
left join lateral (
  select coalesce(sum(d.bonus_points),0) as bonus
  from public.bingo_duels d
  where d.winner_team_id = t.id and d.status = 'done'
) duel on true;

grant select on public.event_scoreboard to authenticated;
grant execute on function public.bingo_team_board_score(uuid, uuid) to authenticated;
