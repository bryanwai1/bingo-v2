-- An approved result ticks the card, in the database, in the same write.
--
-- Before: a card whose input is 'auto' (versus, link, text...) was saved as
-- approved by the phone, and then the phone sent a SECOND request to mark the
-- scan completed. If that second request never landed (signal drop, page
-- closed), the card said "Result approved" but the board showed no tick and
-- no points, and nothing ever retried. (GREEN / Balloon Pair Race, 14 Nov.)
--
-- Now: whenever a submission becomes 'approved' -- auto on insert, or the
-- admin pressing Approve -- this trigger checks the card's compulsory inputs
-- and ticks the scan itself. Same for a typed answer turning answer_ok on.
-- Mirrors src/lib/completionInputs.ts (effectiveInputs + isComplete).
--
-- Only fires on NEW approvals. Existing rows are not touched, so running this
-- changes no team's current points.

create or replace function public.bingo_scan_inputs_done(p_scan uuid, p_answer_ok boolean)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_team uuid; v_task uuid; v_type text; v_raw jsonb;
  v_inputs jsonb := '{}'::jsonb;
  v_done jsonb;
  k text; v_any boolean := false;
begin
  select s.team_id, s.task_id, t.task_type, t.completion_inputs
    into v_team, v_task, v_type, v_raw
  from bingo_scans s join bingo_tasks t on t.id = s.task_id
  where s.id = p_scan;
  if not found then return false; end if;

  -- effectiveInputs(): the card's own map, else its old exclusive type.
  foreach k in array array['photo', 'video', 'link', 'answer', 'versus'] loop
    if coalesce(v_raw ->> k, '') in ('required', 'optional', 'auto') then
      v_inputs := v_inputs || jsonb_build_object(k, v_raw ->> k);
    end if;
  end loop;
  if v_inputs = '{}'::jsonb then
    v_inputs := case v_type
      when 'photo'  then '{"photo":"required"}'
      when 'video'  then '{"video":"required"}'
      when 'answer' then '{"answer":"required"}'
      when 'media'  then '{"photo":"optional","video":"optional"}'
      else '{}' end::jsonb;
  end if;
  -- A card with no inputs at all: any approval finishes it (admin rule).
  if v_inputs = '{}'::jsonb then return true; end if;

  -- What the team has had approved for this card.
  select jsonb_build_object(
    'photo',  coalesce(bool_or(media_type not in ('video', 'link', 'versus', 'text')), false),
    'video',  coalesce(bool_or(media_type = 'video'), false),
    'link',   coalesce(bool_or(media_type = 'link'), false),
    'versus', coalesce(bool_or(media_type = 'versus'), false),
    'answer', coalesce(p_answer_ok, false) or coalesce(bool_or(media_type = 'text'), false))
  into v_done
  from bingo_photo_submissions
  where team_id = v_team and task_id = v_task and status = 'approved';

  -- isComplete(): every compulsory input done, and at least one input done.
  for k in select jsonb_object_keys(v_inputs) loop
    if (v_inputs ->> k) in ('required', 'auto') and not (v_done ->> k)::boolean then
      return false;
    end if;
    if (v_done ->> k)::boolean then v_any := true; end if;
  end loop;
  return v_any;
end $$;

-- A submission becomes approved -> tick its scan if the card is now complete.
create or replace function public.bingo_complete_on_approval()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.scan_id is not null
     and new.puzzle_id is null  -- Breakout Hunt photos have their own flow
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update bingo_scans
       set completed = true, completed_at = now()
     where id = new.scan_id
       and not completed
       and bingo_scan_inputs_done(id, answer_ok);
  end if;
  return null;
end $$;

drop trigger if exists bingo_complete_on_approval on public.bingo_photo_submissions;
create trigger bingo_complete_on_approval
  after insert or update of status on public.bingo_photo_submissions
  for each row execute function public.bingo_complete_on_approval();

-- A typed answer is accepted -> tick the scan in that same write if complete.
create or replace function public.bingo_complete_on_answer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.answer_ok and not coalesce(old.answer_ok, false) and not new.completed
     and bingo_scan_inputs_done(new.id, true) then
    new.completed := true;
    new.completed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists bingo_complete_on_answer on public.bingo_scans;
create trigger bingo_complete_on_answer
  before update of answer_ok on public.bingo_scans
  for each row execute function public.bingo_complete_on_answer();
