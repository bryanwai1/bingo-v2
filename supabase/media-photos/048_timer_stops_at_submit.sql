-- The bonus timer stops when the team SUBMITS, not when a marshal approves.
--
-- Before: bingo_complete_on_approval stamped completed_at = now() at the moment
-- of approval, so every minute a submission sat waiting for a marshal came off
-- the team's time bonus.
--
-- Now: completed_at is the time the approved submission was SENT (its
-- created_at), never later than now() and never earlier than the card was
-- opened. A resubmission after a rejection counts from the resubmission, since
-- the rejected one never completed anything. The phone freezes its timer at the
-- same moment (see submittedAt() in src/lib/completionInputs.ts).
--
-- Only fires on NEW approvals, like 047: cards already completed keep their
-- completed_at, so running this changes no team's current points.
-- Run this in the Supabase SQL editor of the project the app uses.

create or replace function public.bingo_complete_on_approval()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved'
     and new.scan_id is not null
     and new.puzzle_id is null  -- Breakout Hunt photos have their own flow
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    update bingo_scans s
       set completed = true,
           completed_at = greatest(
             s.scanned_at,
             least(now(), coalesce((
               select max(p.created_at) from bingo_photo_submissions p
               where p.team_id = new.team_id and p.task_id = new.task_id and p.status = 'approved'
             ), now()))
           )
     where s.id = new.scan_id
       and not s.completed
       and bingo_scan_inputs_done(s.id, s.answer_ok);
  end if;
  return null;
end $$;
