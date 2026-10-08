-- Loads the reviewed Grab Game Day cards into the "Grab Game Day" board.
-- Run in the Supabase SQL editor AFTER these, in any order:
--   core-tables/20261006_player_theme.sql   (board theme)
--   core-tables/20261006_tile_icon.sql      (card icons)
--   core-tables/20261006_card_passcode.sql  (Crack the Passcode box code, default 1234)
--
-- What it does, to the board with slug 'grab-game-day':
--   1. removes the 25 placeholder cards from seed_grab_game_day_board.sql
--      (only ones with no instruction page and no icon, so cards you added or
--      already loaded are never touched);
--   2. adds the reviewed cards, one instruction page each, in a mixed layout;
--   3. leaves the free boxes empty so you can place your existing cards;
--   4. switches the board to icon tiles.
-- A card already in a preferred box is never overwritten: the card goes to the
-- next free box instead. Safe to re-run: cards that are already loaded (same
-- title with an icon) are skipped.

do $$
declare
  v_section uuid;
  v_owner   uuid;
  v_task    uuid;
  v_slot_id uuid;
  v_slot    int;
  v_old     uuid[];
  r         record;
begin
  select id, owner_id into v_section, v_owner from public.bingo_sections where slug = 'grab-game-day';
  if v_section is null then
    raise exception 'Board grab-game-day not found. Run seed_grab_game_day_board.sql first.';
  end if;

  -- 1. placeholders from the first seed
  select array_agg(t.id) into v_old from public.bingo_tasks t
   where t.section_id = v_section
     and t.cloned_from is null
     and t.tile_icon is null
     and not exists (select 1 from public.bingo_task_pages p where p.task_id = t.id)
     and t.title in ('Rubik''s Cube', 'Puzzle Challenge', 'Math Challenge', 'Memory & Spot the Difference', 'Giant Wall Matching', 'Bean Separation', 'Tic Tac Toes', 'Giant Jingga', 'Capture the Flag', 'Musical Chair', 'Water Bottle Matching', 'Bottle Toss', 'Parcel Delivery Mission', 'Ouch! Food Delivery', 'Step Counter Challenge', 'Caterpillar Walk', 'Grab Rider Is OTW', 'Human Knot', 'Trivia: Quiz Solving 1', 'Trivia: Quiz Solving 2', 'Trivia: Quiz Solving 3', 'Trivia: Team Fun Task 1', 'Trivia: Team Fun Task 2', 'Trivia: Crack the Passcode 1', 'Trivia: Crack the Passcode 2');

  -- A box does not always disappear with its card, so remove the placeholders'
  -- boxes explicitly, and any box left pointing at a card that no longer exists.
  delete from public.bingo_board_cards where section_id = v_section and task_id = any(coalesce(v_old, '{}'));
  delete from public.bingo_tasks where id = any(coalesce(v_old, '{}'));
  delete from public.bingo_board_cards bc
   where bc.section_id = v_section
     and not exists (select 1 from public.bingo_tasks t where t.id = bc.task_id);

  -- 2. the reviewed cards
  for r in
    select * from (values
      (0, 'Memory & Spot the Difference', 'Brain Game', 'Green', '#00B14F', 20, 'spot', 'marshal', 'memory-spot-difference', '', '', 'Meet the Marshal at the Memory & Spot the Difference station.', 'Two similar pictures sit side by side.', 'Study them and spot what is not the same.', 'Find all the differences together.', 'Show them to the Marshal within the time limit.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (8, 'Icon Matching', 'Brain Game', 'Green', '#00B14F', 20, 'flip', 'marshal', 'giant-wall-matching', '', '', 'Meet the Marshal at the Icon Matching station.', 'Panels on a big wall hide icons.', 'All team members stand in one line.', 'Each player flips one panel, then goes to the back of the line.', 'The next player flips another panel to look for its match. Matches stay up; non-matches flip back.', 'Keep rotating until all matching pairs are found, within the time limit. Then report to the Marshal and enter the password you get in the app.'),
      (21, 'Bean Separation', 'Brain Game', 'Green', '#00B14F', 20, 'beans', 'marshal', 'bean-separation', '', '', 'Meet the Marshal at the Bean Separation station.', 'A bowl of mixed beans and empty bowls are on the table.', 'Sort the beans into their correct groups.', 'Use the tools provided.', 'Sort every bean correctly as fast as you can, within the time limit.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (1, 'Tic Tac Toes', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'tictactoe', 'marshal', 'tic-tac-toes', '', '', 'Pull another team to come with you, and meet the Marshal together at the Tic Tac Toes station.', 'A giant board is on the ground for the two teams.', 'Take turns placing a marker (X or ring).', 'Be the first team to get three in a row.', 'The Marshal confirms the winner.', 'The winning team gets the password.'),
      (4, 'Giant Jingga', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'jenga', 'marshal', 'giant-jingga', '', '', 'Pull another team to come with you, and meet the Marshal together at the Giant Jingga station.', 'A tall tower of wooden blocks is set up.', 'Take turns pulling out one block at a time.', 'Place each block on top without letting the tower fall.', 'The team that makes the tower fall loses.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (7, 'Capture the Flag', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'flag', 'marshal', 'capture-the-flag', '', '', 'Pull another team to come with you, and meet the Marshal together at the Capture the Flag station.', 'Each team has a base and a flag.', 'Run to the other side and steal the opponent''s flag.', 'Bring it back to your own base to score.', 'The team that scores wins the round.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (10, 'Water Bottle Matching', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'bottle', 'marshal', 'water-bottle-matching', '', '', 'Pull another team to come with you, and meet the Marshal together at the Water Bottle Matching station.', 'Bottles of coloured water are on the table.', 'Guess the colour of each bottle.', 'Arrange the bottles in the correct order on the rack.', 'Get the order right.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (13, 'Bottle Toss', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'ring', 'marshal', 'bottle-toss', '', '', 'Pull another team to come with you, and meet the Marshal together at the Bottle Toss station.', 'Bottles stand on the ground in front of the throwing line.', 'Toss the rings at the bottles.', 'Aim to make a bottle stand upright.', 'Score when the ring lands right.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (17, 'Grab It All', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'hand', 'marshal', 'grab-it-all', '', '', 'Pull another team to come with you, and meet the Marshal together at the Grab It All station.', 'One player from each team stands at the table of items.', 'You have 30 seconds to pick up as many items as you can, using one hand only.', 'No two-handing and no pressing items against your body.', 'When the whistle blows, freeze and hold your hand up for the shake test.', 'The player still holding the most items wins. The winning team gets the password.'),
      (23, 'Where''s My Driver?', 'Opponent Challenge', 'Purple', '#7C3AED', 30, 'cards', 'marshal', 'where-is-my-driver', '', '', 'Pull the other teams to come with you, and meet the Marshal together at the Where''s My Driver? station.', 'One player from each house sits at the table. Each gets a booking slip with the driver''s car colour, plate number, gender, ethnicity and hair length.', 'Memorise your slip in 10 seconds. Then it is taken away.', 'Search the scrambled pile for your matching cards: car colour, plate number and driver profile.', 'The first player to place all the right cards in front of them wins the round and earns points for their house.', 'More rounds can be played, and points add up.'),
      (2, 'Parcel Delivery Mission', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'parcel', 'marshal', 'parcel-delivery', '', '', 'Meet the Marshal at the Parcel Delivery Mission station.', 'Your team is given parcels to carry.', 'Deliver them to the checkpoint.', 'Be fast and be safe.', 'All parcels must arrive within the time limit.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (5, 'Ouch! Food Delivery', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'cup', 'marshal', 'ouch-food-delivery', '', '', 'Meet the Marshal at the Ouch! Food Delivery station.', 'A massage mat lies between the start and the delivery point.', 'Carry the food (cups on trays) in your hands.', 'Walk across the massage mat.', 'Deliver the food without dropping or spilling it.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (12, 'Step Counter Challenge', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'shoe', 'marshal', 'step-counter', '', '', 'Meet the Marshal at the Step Counter Challenge station.', 'Each player wears a step counter.', 'Move around to count your steps.', 'Hit the target number of steps.', 'Do it within the time limit.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (14, 'Caterpillar Walk', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'caterpillar', 'marshal', 'caterpillar-walk', '', '', 'Meet the Marshal at the Caterpillar Walk station.', 'Line up with a big ball held between you.', 'Walk forward together like a caterpillar.', 'Keep the ball steady and do not drop it.', 'Reach the finish line.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (16, 'Human Knot', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'knot', 'marshal', 'human-knot', '', '', 'Meet the Marshal at the Human Knot station.', 'Stand in a tight circle and hold hands with different people across it.', 'You are now tangled in a knot.', 'Untangle the knot as a team.', 'Never let go of anyone''s hands.', 'Report to the Marshal. Enter the password you get in the app to complete the card.'),
      (20, 'GrabCar to the Rescue!', 'Physical Challenge', 'Yellow', '#F59E0B', 35, 'kart', 'marshal', 'grabcar-to-the-rescue', '', '', 'Two teammates from one house, a driver and a passenger, meet the referee at the GrabCar to the Rescue! station.', 'The referee gives your ETA, a fixed time to finish the course.', 'The driver wears a vision-blocking prop and finds the seated passenger. The passenger climbs into the cardboard car, and both buckle the seatbelt (velcro or bungee).', 'Drive over the pool-noodle speed bumps without breaking the car. Stop at a red card, go on green. Waiting eats into your ETA.', 'Reverse the car fully into the marked box. Your time stops once you are parked.', 'Finish within your ETA for full points; go over and you get a time penalty. The fastest house wins.'),
      (6, 'Quiz Solving', 'Trivia', 'Blue', '#2563EB', 15, 'quiz', 'admin', 'quiz-solving', '', 'Type your answer to the quiz question.', 'Find the quiz question at the checkpoint.', 'Read the question and the choices (A to D) together.', 'Agree on your answer and type it in the app.', 'Submit it for admin approval.', 'If it is not accepted, redo it.', 'Once the admin approves, the card is complete.'),
      (18, 'Crack the Passcode', 'Trivia', 'Blue', '#2563EB', 15, 'lock', 'admin', 'crack-the-passcode', 'riddle', '', 'Draw a riddle about Grab. Each team gets one at random.', 'Work out the answer together.', 'Type your answer in the app. It is checked automatically.', 'If it is wrong, try again. Use the hint if you are stuck.', 'If it is correct, the app shows you the box passcode.', 'Use it to open the lock on the box and complete the card.')
    ) as t(pref_slot, title, category, color, hex_code, points, tile_icon, mode, slug, special, answer_question,
           p1, p2, p3, p4, p5, p6)
    order by pref_slot
  loop
    if exists (select 1 from public.bingo_tasks
                where section_id = v_section and title = r.title and tile_icon is not null) then
      continue;
    end if;

    -- preferred box, else the lowest free one
    if exists (select 1 from public.bingo_board_cards where section_id = v_section and slot = r.pref_slot) then
      select min(s) into v_slot from generate_series(0, 24) s
       where not exists (select 1 from public.bingo_board_cards where section_id = v_section and slot = s);
      if v_slot is null then raise exception 'Board is full: no free box for %', r.title; end if;
    else
      v_slot := r.pref_slot;
    end if;

    insert into public.bingo_tasks
      (section_id, owner_id, title, category, color, hex_code, points, sort_order, in_grid,
       task_type, completion_inputs, answer_question, tile_icon, draw_style, draw_spins)
    values
      (v_section, v_owner, r.title, r.category, r.color, r.hex_code, r.points, v_slot, true,
       case when r.mode = 'admin' then 'answer' else 'standard' end,
       case when r.mode = 'admin' then '{"answer":"required"}'::jsonb else '{}'::jsonb end,
       nullif(r.answer_question, ''), r.tile_icon,
       case when r.special = 'riddle' then 'deal' else null end,
       1)
    returning id into v_task;

    insert into public.bingo_board_cards (section_id, task_id, slot) values (v_section, v_task, v_slot);

    insert into public.bingo_task_pages
      (task_id, page_order, pointer_1, pointer_2, pointer_3, pointer_4, pointer_5, pointer_6)
    values
      (v_task, 0, r.p1, r.p2, r.p3, r.p4, r.p5, r.p6);

    -- hero image: the card's photo carousel
    insert into public.bingo_task_photos (task_id, photo_url, photo_order)
    values (v_task, '/grab/heroes/' || r.slug || '.jpg', 0);

    -- Crack the Passcode: a drawn riddle checked against its saved answer, then
    -- the box passcode (default 1234; change it on the card).
    if r.special = 'riddle' then
      insert into public.bingo_draw_slots (task_id, position, source, label, deal_count)
      values (v_task, 0, 'card', 'Riddle', 1)
      returning id into v_slot_id;

      insert into public.bingo_draw_items (task_id, slot_id, position, label, hint, detail) values
        (v_task, v_slot_id, 0, 'I carry hot meals from the kitchen straight to your door. You order me with a few taps. Which Grab service am I?', 'Hungry? Think of dinner arriving at your door.', 'GrabFood'),
        (v_task, v_slot_id, 1, 'You tap, a driver arrives, and I take you where you need to go on four wheels. Which Grab service am I?', 'Think of a ride, not a meal.', 'GrabCar'),
        (v_task, v_slot_id, 2, 'No cash, no card in your hand. Scan my QR code and your bill is settled. What am I?', 'It is how Grab handles payments.', 'GrabPay'),
        (v_task, v_slot_id, 3, 'I bring groceries and daily needs from the shop to your home. I am not a restaurant. Which Grab service am I?', 'Think of a supermarket run you do not have to make.', 'GrabMart'),
        (v_task, v_slot_id, 4, 'I am the colour of Grab''s logo, and the colour of go. What colour am I?', 'Look at the Game Day shirts and ribbons.', 'Green'),
        (v_task, v_slot_id, 5, 'Grab''s 4H values are Heart, Hunger, Humility and one more. What is the missing H?', 'It means pride and doing right.', 'Honour');

      insert into public.bingo_task_secrets (task_id, passcode) values (v_task, '1234');
    end if;
  end loop;

  -- 4. icon tiles
  update public.bingo_sections set tile_display = 'icon' where id = v_section;

  raise notice 'Loaded cards into grab-game-day. Free boxes: %',
    (select 25 - count(*) from public.bingo_board_cards where section_id = v_section);
end $$;
