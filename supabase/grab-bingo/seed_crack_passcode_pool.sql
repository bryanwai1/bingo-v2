-- APPLIED to the live project on 2026-11-19. Run 20261119_card_passcode_pool.sql first.
-- Gives the Grab Game Day "Crack the Passcode" card its five box codes.
-- Safe to re-run: a card that already has real codes (anything other than the
-- one "Code" entry copied over from the old single passcode) is left alone, so
-- it never wipes codes teams are already holding.

do $$
declare
  v_section uuid;
  v_task    uuid;
begin
  select id into v_section from public.bingo_sections where slug = 'grab-game-day';
  if v_section is null then raise exception 'Board grab-game-day not found.'; end if;

  for v_task in
    select id from public.bingo_tasks where section_id = v_section and title ilike '%Crack the Passcode%'
  loop
    continue when exists (select 1 from public.bingo_task_passcodes where task_id = v_task and label <> 'Code');
    delete from public.bingo_task_passcodes where task_id = v_task;
    insert into public.bingo_task_passcodes (task_id, label, passcode, sort_order) values
      (v_task, 'Box 1', '193', 0),
      (v_task, 'Box 2', '355', 1),
      (v_task, 'Box 3', '042', 2),
      (v_task, 'Box 4', '124', 3),
      (v_task, 'Box 5', '480', 4);
  end loop;
end $$;
