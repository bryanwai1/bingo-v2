-- APPLIED to the live project on 2026-11-19.
-- Replaces the 10 easy questions on the Grab Game Day "Quiz Solving" card with
-- 10 secondary-school level ones (percentages, ratios, equations, Pythagoras,
-- average speed, volume, sequences, circle area). Every answer is a single
-- number, so the typed answer can be checked exactly. Safe to re-run: it swaps
-- the whole bank each time.

do $$
declare
  v_section uuid;
  v_task    uuid;
  v_slot_id uuid;
begin
  select id into v_section from public.bingo_sections where slug = 'grab-game-day';
  if v_section is null then raise exception 'Board grab-game-day not found.'; end if;

  -- The board can hold more than one Quiz Solving card; every one gets the new bank.
  for v_task in select id from public.bingo_tasks where section_id = v_section and title = 'Quiz Solving' loop
  select id into v_slot_id from public.bingo_draw_slots where task_id = v_task order by position limit 1;
  if v_slot_id is null then
    insert into public.bingo_draw_slots (task_id, position, source, label, deal_count)
    values (v_task, 0, 'card', 'Quiz question', 1) returning id into v_slot_id;
  end if;

  delete from public.bingo_draw_items where slot_id = v_slot_id;

  insert into public.bingo_draw_items (task_id, slot_id, position, label, hint, detail) values
    (v_task, v_slot_id, 0, 'A delivery costs RM4 plus RM1.50 for every km. A trip costs RM13 in total. How many km was the trip?', 'Take away the RM4 first, then divide by the price per km.', '6'),
    (v_task, v_slot_id, 1, 'An order of RM85 gets a 20% discount, then RM5 delivery is added. How much do you pay in RM?', 'Work out 80% of 85, then add the delivery fee.', '73'),
    (v_task, v_slot_id, 2, 'A rider covers 45 km at 30 km/h, then another 45 km at 90 km/h. What is the average speed for the whole trip in km/h?', 'Average speed = total distance divided by total time, not the average of the two speeds.', '45'),
    (v_task, v_slot_id, 3, 'Solve for x: 3x - 7 = 2x + 5', 'Collect the x terms on one side.', '12'),
    (v_task, v_slot_id, 4, 'A rider goes 9 km west, then 12 km north. How many km is the straight line back to the start?', 'Pythagoras: a squared plus b squared equals c squared.', '15'),
    (v_task, v_slot_id, 5, 'Orders from restaurants A, B and C are in the ratio 2 : 3 : 5. There are 120 orders in total. How many come from C?', 'Add the ratio parts first to find the size of one part.', '60'),
    (v_task, v_slot_id, 6, 'A delivery box is 40 cm long, 25 cm wide and 20 cm high. What is its volume in litres? (1 litre = 1000 cubic cm)', 'Multiply the three sides, then divide by 1000.', '20'),
    (v_task, v_slot_id, 7, 'What is the next number in the sequence 2, 6, 18, 54, ...?', 'Look at what each number is multiplied by.', '162'),
    (v_task, v_slot_id, 8, 'A rider earns RM1,200 a month. After a 15% rise, how many RM does the rider earn?', 'Find 15% of 1,200, then add it on.', '1380'),
    (v_task, v_slot_id, 9, 'A delivery zone is a circle with radius 7 km. What is its area in square km? (use pi = 22/7)', 'Area = pi times radius squared.', '154');
  end loop;

  raise notice 'Quiz Solving now has 10 secondary-school level questions.';
end $$;
