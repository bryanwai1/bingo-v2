-- Scoring v2 for the combined event scoreboard (event_scoreboard view).
--
-- Must match src/lib/bingoLines.ts (scoreWithBingoLines) and
-- src/lib/timeBonus.ts (bonusPoints). Replaces the old x1.2...x2.0 line
-- multiplier. Run once in the Supabase SQL editor; the view itself is unchanged
-- (the function keeps its signature and result columns).
--
--  * Every finished box pays its base points x the time bonus: 150% when the
--    team finished (completed_at - scanned_at) inside the full window, a
--    straight slide down to 100% at the timer, 100% after. To 2 decimals.
--    The window is the card's own bonus_*_minutes, else the board's
--    default_bonus_*_minutes, else 10 / 25.
--  * Completed lines add a flat bonus on top: the 1st +100, 2nd +200 ... 5th
--    +500. The 6th onward pays nothing. Lines are ordered by when they were
--    completed.

create or replace function public.bingo_time_bonus_points(
  base      numeric,
  opened    timestamptz,
  finished  timestamptz,
  full_min  numeric,
  timer_min numeric
)
returns numeric
language plpgsql
immutable
parallel safe
as $$
declare
  b    numeric := coalesce(base, 0);
  f    numeric := case when coalesce(full_min, 0)  > 0 then full_min  else 10 end;
  t    numeric := case when coalesce(timer_min, 0) > 0 then timer_min else 25 end;
  mins numeric;
  pct  numeric;
begin
  -- Without both timestamps (old data) a team simply gets base points.
  if opened is null or finished is null then return round(b, 2); end if;
  if t < f then t := f; end if;
  mins := extract(epoch from (finished - opened)) / 60;
  if mins < 0 then
    pct := 100;
  elsif mins <= f then
    pct := 150;
  elsif mins >= t then
    pct := 100;
  else
    pct := 100 + 50 * (t - mins) / (t - f);
  end if;
  return round(b * pct / 100, 2);
end;
$$;

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
  done       int[]   := '{}';
  order_of   int[]   := '{}';   -- line indexes, in the order they completed
  raw        numeric := 0;      -- box points, time bonus included
  line_bonus numeric := 0;
  n_done     int     := 0;
  line       int[];
  i          int;
  k          int;
  rec        record;
begin
  -- Replay in completion order, recording when each line completes. One scan
  -- per box: this box's own, else (legacy) any completed scan of the same card.
  for rec in
    select x.slot, x.points
    from (
      select distinct on (bc.id)
             bc.slot as slot,
             coalesce(sc.completed_at, 'epoch'::timestamptz) as done_at,
             public.bingo_time_bonus_points(
               bt.points, sc.scanned_at, sc.completed_at,
               coalesce(bt.bonus_full_minutes,  s.default_bonus_full_minutes),
               coalesce(bt.bonus_timer_minutes, s.default_bonus_timer_minutes)
             ) as points
      from public.bingo_board_cards bc
      join public.bingo_tasks    bt on bt.id = bc.task_id
      join public.bingo_sections s  on s.id  = bc.section_id
      join public.bingo_scans    sc
        on sc.team_id = p_team
       and sc.completed
       and (
         sc.board_card_id = bc.id
         or (sc.board_card_id is null and sc.task_id = bc.task_id)
       )
      where bc.section_id = p_section
        and bc.slot between 0 and 24
      order by bc.id, (sc.board_card_id is null), sc.completed_at
    ) x
    -- Ties and legacy scans with no completed_at fall back to slot order, so
    -- the result is deterministic either way.
    order by x.done_at, x.slot
  loop
    raw    := raw + rec.points;
    n_done := n_done + 1;
    done   := done || rec.slot;

    for i in 1..array_length(all_lines, 1) loop
      if i = any(order_of) then continue; end if;
      line := array[all_lines[i][1], all_lines[i][2], all_lines[i][3],
                    all_lines[i][4], all_lines[i][5]];
      if line <@ done then
        order_of := order_of || i;
      end if;
    end loop;
  end loop;

  -- The first five lines pay a flat +100, +200, +300, +400, +500.
  for k in 1..least(coalesce(array_length(order_of, 1), 0), 5) loop
    line_bonus := line_bonus + 100 * k;
  end loop;

  tile_points   := round(raw, 2);
  tiles_done    := n_done;
  bingo_lines   := coalesce(array_length(order_of, 1), 0);
  scaled_points := round(raw + line_bonus, 2);
  return next;
end;
$$;

grant execute on function public.bingo_time_bonus_points(numeric, timestamptz, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.bingo_team_board_score(uuid, uuid) to authenticated;
