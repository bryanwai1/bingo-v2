-- Updates an ALREADY-LOADED "Grab Game Day" board (load_grab_cards.sql has run):
--   Quiz Solving becomes a drawn question (10 delivery questions, one per
--      team at random) checked against its saved answer, like Crack the Passcode.
-- Safe to re-run: the quiz bank is only added when the card has none yet.

do $$
declare
  v_section uuid;
  v_task    uuid;
  v_slot_id uuid;
begin
  select id into v_section from public.bingo_sections where slug = 'grab-game-day';
  if v_section is null then
    raise exception 'Board grab-game-day not found.';
  end if;

  select id into v_task from public.bingo_tasks
   where section_id = v_section and title = 'Quiz Solving';
  if v_task is null then
    raise notice 'Quiz Solving card not found.';
    return;
  end if;

  if exists (select 1 from public.bingo_draw_slots where task_id = v_task) then
    raise notice 'Quiz Solving already has a quiz bank - nothing added.';
    return;
  end if;

  update public.bingo_tasks
     set draw_style = 'deal', draw_spins = 1,
         answer_question = 'Type your answer to the quiz question.'
   where id = v_task;

  update public.bingo_task_pages set
      pointer_1 = 'Draw a delivery quiz question. Each team gets one at random.',
      pointer_2 = 'Read the question and work out the answer together.',
      pointer_3 = 'Agree on your answer as a team.',
      pointer_4 = 'Type the answer in the app; it is checked automatically.',
      pointer_5 = 'Wrong answer? Try again. A hint is available if you are stuck.',
      pointer_6 = 'The card is complete once your answer is correct.'
   where task_id = v_task and page_order = 0;

  insert into public.bingo_draw_slots (task_id, position, source, label, deal_count)
  values (v_task, 0, 'card', 'Quiz question', 1)
  returning id into v_slot_id;

  insert into public.bingo_draw_items (task_id, slot_id, position, label, hint, detail) values
    (v_task, v_slot_id, 0, 'A rider delivers 4 orders every hour. How many orders after 6 hours?', 'Multiply the orders per hour by the hours.', '24'),
    (v_task, v_slot_id, 1, 'A rider rides at 30 km per hour. How many km does the rider cover in 2 hours?', 'Speed times time.', '60'),
    (v_task, v_slot_id, 2, 'Each parcel weighs 2.5 kg and the rider carries 4 parcels. How many kg in total?', 'Add 2.5 four times.', '10'),
    (v_task, v_slot_id, 3, 'Two nasi lemak at RM6 each and one teh at RM3. What is the total in RM?', 'Do the nasi lemak first, then add the teh.', '15'),
    (v_task, v_slot_id, 4, 'A rider has 20 parcels. 8 are delivered in the morning and 7 in the afternoon. How many are left?', 'Subtract both trips from 20.', '5'),
    (v_task, v_slot_id, 5, 'A rider goes 3 km north, then 4 km east. How many km is the shortest straight line back to the start?', 'Think of a right-angled triangle.', '5'),
    (v_task, v_slot_id, 6, 'An order takes 12 minutes to cook and 18 minutes to deliver. How many minutes in total?', 'Add the cooking and delivery time.', '30'),
    (v_task, v_slot_id, 7, 'A rider drops off 1 order every 15 minutes. How many orders in 3 hours?', 'How many 15-minute blocks fit in an hour?', '12'),
    (v_task, v_slot_id, 8, 'Order numbers on the bags are 101, 103, 105, ... What number comes next?', 'Look at the gap between numbers.', '107'),
    (v_task, v_slot_id, 9, 'A delivery fee is RM3 per order. How many RM for 7 orders?', 'Multiply the fee by the orders.', '21');

  raise notice 'Added the quiz bank to Quiz Solving.';
end $$;
