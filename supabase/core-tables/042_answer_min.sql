-- Number answers with a floor (Walkathon: "over 18,000 steps"). When
-- answer_min is set, the card's answer input is a single number and the
-- check is "value >= answer_min" rather than the letter-by-letter match
-- against answer_text. Null on every existing card, so nothing changes for
-- the exact-answer cards.
alter table public.bingo_tasks
  add column if not exists answer_min integer;

-- Check a team's number against the card's floor and record the result on
-- their scan row. SECURITY DEFINER so the pass/fail decision is made here,
-- not in the browser; the function only ever flips answer_ok to true, and
-- only on a scan that belongs to the card being checked.
create or replace function public.check_answer_min(p_scan uuid, p_value numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_min integer;
begin
  select t.answer_min into v_min
    from public.bingo_scans s join public.bingo_tasks t on t.id = s.task_id
   where s.id = p_scan;
  if v_min is null or p_value is null or p_value < v_min then
    return false;
  end if;
  update public.bingo_scans set answer_ok = true where id = p_scan;
  return true;
end $$;

grant execute on function public.check_answer_min(uuid, numeric) to anon, authenticated;
