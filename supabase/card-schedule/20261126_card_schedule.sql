-- Card schedule: lock / unlock a card by time. NOT RUN against any database yet.
-- Safe to re-run.
--
--  * bingo_tasks.schedule (jsonb, null = no schedule). Shape (see src/lib/cardSchedule.ts):
--      { open:  {type:'after_start', minutes:30} | {type:'at', at:'<iso>'},
--        close: same,
--        lastMinutes: 15,            -- open only in the last N minutes of the board timer
--        label, notifyOpen, notifyCloseMinutes, notifyText,
--        override: 'open' | 'locked' }
--    Whole-row clone/sync copy it with the card, so nothing else needs editing there.
--  * bingo_sections.game_start_at: set the first time the admin presses Start.
--    "N minutes after start" counts play time: card_pauses are skipped.
--  * A trigger on bingo_scans stops a PLAYER from opening a closed or not-yet-open
--    card. A team that already has a scan for the card may keep going ("finish what
--    you started"), and the facilitator's own writes are never blocked.

alter table public.bingo_tasks    add column if not exists schedule jsonb;
alter table public.bingo_sections add column if not exists game_start_at timestamptz;

-- Stamp the first Start press (and nothing else).
create or replace function public.bingo_stamp_game_start()
returns trigger language plpgsql as $$
begin
  if new.game_started and not coalesce(old.game_started, false) and new.game_start_at is null then
    new.game_start_at := now();
  end if;
  return new;
end $$;
drop trigger if exists bingo_stamp_game_start on public.bingo_sections;
create trigger bingo_stamp_game_start before update on public.bingo_sections
  for each row execute function public.bingo_stamp_game_start();

-- Play time between two instants: wall time minus the logged pauses.
create or replace function public.bingo_active_elapsed_ms(p_from timestamptz, p_to timestamptz, p_pauses jsonb)
returns numeric language plpgsql immutable as $$
declare
  f numeric := extract(epoch from p_from) * 1000;
  t numeric := extract(epoch from p_to) * 1000;
  tot numeric := 0; p jsonb; s numeric; e numeric;
begin
  for p in select * from jsonb_array_elements(coalesce(p_pauses, '[]'::jsonb)) loop
    s := greatest((p->>'start')::numeric, f);
    e := least(coalesce((p->>'end')::numeric, t), t);
    if e > s then tot := tot + (e - s); end if;
  end loop;
  return greatest(0, t - f - tot);
end $$;

-- Has this rule been reached? null = no such rule.
create or replace function public.bingo_schedule_rule_reached(p_rule jsonb, p_game_start timestamptz, p_pauses jsonb)
returns boolean language plpgsql stable as $$
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then return null; end if;
  if p_rule->>'type' = 'at' then
    return now() >= (p_rule->>'at')::timestamptz;
  elsif p_rule->>'type' = 'after_start' then
    if p_game_start is null then return false; end if;
    return public.bingo_active_elapsed_ms(p_game_start, now(), p_pauses) >= (p_rule->>'minutes')::numeric * 60000;
  end if;
  return null;
end $$;

-- Can a team open this card right now?
create or replace function public.bingo_card_open_now(p_schedule jsonb, p_section uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  sec bingo_sections%rowtype;
  r boolean;
  last_min numeric;
begin
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then return true; end if;
  if p_schedule->>'override' = 'open' then return true; end if;
  if p_schedule->>'override' = 'locked' then return false; end if;
  select * into sec from bingo_sections where id = p_section;
  if not found then return true; end if;

  r := public.bingo_schedule_rule_reached(p_schedule->'close', sec.game_start_at, sec.card_pauses);
  if r is true then return false; end if;

  r := public.bingo_schedule_rule_reached(p_schedule->'open', sec.game_start_at, sec.card_pauses);
  if r is false then return false; end if;

  last_min := nullif(p_schedule->>'lastMinutes', '')::numeric;
  if last_min is not null and last_min > 0 then
    if sec.timer_end_at is null then return false; end if;
    if extract(epoch from (sec.timer_end_at - now())) * 1000 > last_min * 60000 then return false; end if;
  end if;
  return true;
end $$;

grant execute on function public.bingo_card_open_now(jsonb, uuid) to anon, authenticated;

-- Guard: a player cannot open a card that is closed or not open yet.
create or replace function public.bingo_scan_schedule_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tm bingo_teams%rowtype;
  sec bingo_sections%rowtype;
  sched jsonb;
begin
  select schedule into sched from bingo_tasks where id = new.task_id;
  if sched is null then return new; end if;
  select * into tm from bingo_teams where id = new.team_id;
  if not found then return new; end if;
  select * into sec from bingo_sections where id = tm.section_id;
  -- the facilitator's own writes (marking a card done for a team) are never blocked
  if public.is_bingo_owner() or public.bingo_can_write(sec.owner_id) then return new; end if;
  -- finish what was started: a team that already opened this card keeps access
  if exists (select 1 from bingo_scans s
              where s.team_id = new.team_id and s.task_id = new.task_id
                and s.board_card_id is not distinct from new.board_card_id) then
    return new;
  end if;
  if not public.bingo_card_open_now(sched, tm.section_id) then
    raise exception 'CARD_LOCKED';
  end if;
  return new;
end $$;
drop trigger if exists bingo_scan_schedule_guard on public.bingo_scans;
create trigger bingo_scan_schedule_guard before insert on public.bingo_scans
  for each row execute function public.bingo_scan_schedule_guard();

-- A game that is already running when this is applied counts from now, so its
-- relative rules do not wait forever for a Start press that already happened.
update public.bingo_sections set game_start_at = now() where game_started and game_start_at is null;
