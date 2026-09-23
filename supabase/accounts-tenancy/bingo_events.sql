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

-- Dropped first: the view below depends on these, and bingo_line_multiplier
-- is obsolete. It applied a single closed-form multiplier to the final tile
-- total, which the running-total rule (see below) cannot be expressed as.
drop view if exists public.event_scoreboard;
drop function if exists public.bingo_line_multiplier(int);

-- Per-team board score. Must match scoreWithBingoLines() in
-- src/lib/bingoLines.ts.
--
-- Bingo lines do not apply a single multiplier to the final tile total: each
-- line lifts the team's RUNNING total at the moment it lands (1st line ×1.2,
-- 2nd ×1.4, 3rd ×1.6, +0.2 per line), so points earned before a line are
-- lifted by it and points earned after are not:
--
--   100 pts  -> line 1 -> 100 x 1.2 = 120
--   +50 pts  ->          120 +  50 = 170
--            -> line 2 -> 170 x 1.4 = 238
--
-- That makes scoring order-dependent, so this replays the board in
-- completed_at order rather than computing a closed form.
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
  done      int[]   := '{}';
  total     numeric := 0;
  raw       numeric := 0;
  n_done    int     := 0;
  applied   int     := 0;
  lines_now int;
  rec       record;
begin
  for rec in
    select bc.slot as slot,
           coalesce(bt.points, 0) as points,
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
    group by bc.id, bc.slot, bt.points
    -- Ties and legacy scans with no completed_at fall back to slot order, so
    -- the result is deterministic either way.
    order by done_at, bc.slot
  loop
    total  := total + rec.points;
    raw    := raw + rec.points;
    n_done := n_done + 1;
    done   := done || rec.slot;

    -- How many lines are complete now: the 12 possible lines, each tested for
    -- containment in the set of crossed-off slots. A single box can finish
    -- two at once (a crossing slot), and each is applied in turn.
    select count(*) into lines_now
    from (values
      ('{0,1,2,3,4}'::int[]),      ('{5,6,7,8,9}'::int[]),
      ('{10,11,12,13,14}'::int[]), ('{15,16,17,18,19}'::int[]),
      ('{20,21,22,23,24}'::int[]),
      ('{0,5,10,15,20}'::int[]),   ('{1,6,11,16,21}'::int[]),
      ('{2,7,12,17,22}'::int[]),   ('{3,8,13,18,23}'::int[]),
      ('{4,9,14,19,24}'::int[]),
      ('{0,6,12,18,24}'::int[]),   ('{4,8,12,16,20}'::int[])
    ) as l(line)
    where l.line <@ done;

    while applied < lines_now loop
      applied := applied + 1;
      total := total * (1 + 0.2 * applied);
    end loop;
  end loop;

  tile_points   := raw;
  tiles_done    := n_done;
  bingo_lines   := applied;
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
