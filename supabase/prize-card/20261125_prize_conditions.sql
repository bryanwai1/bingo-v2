-- Prize card unlock conditions. NOT RUN against any database yet.
-- Run after 20261117_prize_card.sql. Safe to re-run.
--
-- A prize card can now require, on top of "complete N cards":
--   * specific cards (prize_required_task_ids) - they count toward the N
--   * a minimum score and/or a minimum number of bingo lines
--   * a claim window (open/close time)
-- and it can have more than one prize: prize_stock total prizes (null =
-- unlimited), prize_per_team how many one team may claim.
--
-- "Only approved cards count" needs no column: a scan is completed = true only
-- after approval, and every count below already uses completed scans.

alter table public.bingo_tasks
  add column if not exists prize_required_task_ids uuid[] not null default '{}',
  add column if not exists prize_stock int,
  add column if not exists prize_per_team int not null default 1,
  add column if not exists prize_min_points numeric,
  add column if not exists prize_min_lines int,
  add column if not exists prize_open_at timestamptz,
  add column if not exists prize_close_at timestamptz;
alter table public.bingo_tasks drop constraint if exists bingo_tasks_prize_stock_check;
alter table public.bingo_tasks add constraint bingo_tasks_prize_stock_check check (prize_stock is null or prize_stock >= 1);
alter table public.bingo_tasks drop constraint if exists bingo_tasks_prize_per_team_check;
alter table public.bingo_tasks add constraint bingo_tasks_prize_per_team_check check (prize_per_team >= 1);

-- A placement may now be claimed more than once (stock > 1): drop the
-- one-winner unique index. claim_prize serialises claims with an advisory lock.
alter table public.bingo_prize_claims drop constraint if exists bingo_prize_claims_board_card_id_key;
create index if not exists bingo_prize_claims_card_idx on public.bingo_prize_claims(board_card_id);

create or replace function public.claim_prize(p_member uuid, p_board_card uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  m  bingo_members%rowtype;
  tm bingo_teams%rowtype;
  bc bingo_board_cards%rowtype;
  t  bingo_tasks%rowtype;
  n  int;
  v_missing int;
  v_total int;
  v_mine int;
  v_score record;
begin
  select * into m  from bingo_members where id = p_member;
  select * into bc from bingo_board_cards where id = p_board_card;
  if m.id is null or bc.id is null then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;
  select * into tm from bingo_teams where id = m.team_id;
  select * into t  from bingo_tasks where id = bc.task_id;
  if tm.id is null or tm.section_id <> bc.section_id or m.role <> 'player' or not coalesce(t.is_prize, false) then
    return json_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  -- Claim window.
  if (t.prize_open_at is not null and now() < t.prize_open_at)
     or (t.prize_close_at is not null and now() > t.prize_close_at) then
    return json_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  -- Completed grid boxes (same predicate as the scoreboard).
  select count(*) into n
    from bingo_board_cards g
   where g.section_id = bc.section_id and g.slot < 200
     and exists (select 1 from bingo_scans sc
                  where sc.team_id = tm.id and sc.completed
                    and (sc.board_card_id = g.id or (sc.board_card_id is null and sc.task_id = g.task_id)));
  if n < t.prize_threshold then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;

  -- Required cards: every one must be on this board and completed. A required id
  -- may name the board copy or the library original it was cloned from.
  if coalesce(array_length(t.prize_required_task_ids, 1), 0) > 0 then
    select count(*) into v_missing
      from unnest(t.prize_required_task_ids) r(task_id)
     where not exists (
       select 1 from bingo_board_cards g
         join bingo_tasks gt on gt.id = g.task_id
        where g.section_id = bc.section_id and g.slot < 200
          and (gt.id = r.task_id or gt.cloned_from = r.task_id)
          and exists (select 1 from bingo_scans sc
                       where sc.team_id = tm.id and sc.completed
                         and (sc.board_card_id = g.id or (sc.board_card_id is null and sc.task_id = g.task_id))));
    if v_missing > 0 then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;
  end if;

  -- Minimum score / bingo lines (the scoreboard's own function).
  if t.prize_min_points is not null or t.prize_min_lines is not null then
    select * into v_score from public.bingo_team_board_score(tm.id, bc.section_id);
    if t.prize_min_points is not null and coalesce(v_score.scaled_points, 0) < t.prize_min_points then
      return json_build_object('ok', false, 'reason', 'not_eligible');
    end if;
    if t.prize_min_lines is not null and coalesce(v_score.bingo_lines, 0) < t.prize_min_lines then
      return json_build_object('ok', false, 'reason', 'not_eligible');
    end if;
  end if;

  -- One claim at a time per placement, so stock and the per-team limit hold.
  perform pg_advisory_xact_lock(hashtext(bc.id::text));
  select count(*) into v_mine  from bingo_prize_claims where board_card_id = bc.id and team_id = tm.id;
  select count(*) into v_total from bingo_prize_claims where board_card_id = bc.id;
  -- already holds its share: not "too late", it has it
  if v_mine >= t.prize_per_team then return json_build_object('ok', true); end if;
  if t.prize_stock is not null and v_total >= t.prize_stock then
    return json_build_object('ok', false, 'reason', 'taken',
      'winner', (select team_name from bingo_prize_claims where board_card_id = bc.id order by claimed_at limit 1));
  end if;

  insert into bingo_prize_claims (section_id, board_card_id, team_id, team_name)
  values (bc.section_id, bc.id, tm.id, tm.name);
  return json_build_object('ok', true);
end $$;

-- get_prize_reveal joined one claim row; with several claims per card it still
-- returns the caller's own team's earliest claim (limit 1).
create or replace function public.get_prize_reveal(p_member uuid, p_board_card uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
           'title', t.title, 'message', k.message, 'marshal_name', k.marshal_name,
           'location_text', k.location_text, 'maps_url', k.maps_url, 'maps_label', k.maps_label,
           'task_id', t.id, 'team_name', c.team_name, 'claimed_at', c.claimed_at)
    from bingo_members m
    join bingo_prize_claims c on c.team_id = m.team_id and c.board_card_id = p_board_card
    join bingo_board_cards bc on bc.id = c.board_card_id
    join bingo_tasks t on t.id = bc.task_id
    left join bingo_prize_secrets k on k.task_id = t.id
   where m.id = p_member
   order by c.claimed_at
   limit 1;
$$;

grant execute on function public.claim_prize(uuid, uuid) to anon, authenticated;
grant execute on function public.get_prize_reveal(uuid, uuid) to anon, authenticated;
