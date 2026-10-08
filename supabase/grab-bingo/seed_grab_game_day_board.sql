-- Seed: "Grab Game Day" board — 5x5, built from the four challenge posters.
-- Run in the Supabase SQL editor AFTER core-tables/20261006_player_theme.sql.
--
-- Brain Game 20%, Opponent Challenge 30%, Physical Challenge 35%, Trivia 15%.
-- Each card's points equal its poster's percentage (20 / 30 / 35 / 15), so a
-- harder category pays more. Brain / Opponent / Physical use the six stations
-- on each poster; Trivia has 7 checkpoint cards to fill the 25 boxes. Edit
-- titles, points and instructions afterwards in Admin → Cards.
--
-- owner_id stays NULL (a house board). To put it under a facilitator account,
-- set v_owner to that account's id (bingo_accounts.id) before running.
-- Safe to re-run: does nothing if the slug already exists.

-- Adds the player_theme column if it is missing (same as
-- core-tables/20261006_player_theme.sql), so this file runs on its own.
alter table public.bingo_sections
  add column if not exists player_theme text not null default 'default'
    constraint bingo_sections_player_theme_check
    check (player_theme in ('default', 'grab'));

do $$
declare
  v_owner   uuid := null;
  v_section uuid;
  v_task    uuid;
  r         record;
begin
  if exists (select 1 from public.bingo_sections where slug = 'grab-game-day') then
    raise notice 'Board grab-game-day already exists - nothing done.';
    return;
  end if;

  insert into public.bingo_sections (name, slug, owner_id, player_theme, tile_display)
  values ('Grab Game Day', 'grab-game-day', v_owner, 'grab', 'words')
  returning id into v_section;

  insert into public.bingo_categories (section_id, name, sort_order)
  select v_section, c.name, c.ord
  from (values
    ('Brain Game', 0),
    ('Opponent Challenge', 1),
    ('Physical Challenge', 2),
    ('Trivia', 3)
  ) as c(name, ord);

  for r in
    select * from (values
    (0, 'Parcel Delivery Mission', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (1, 'Rubik''s Cube', 'Brain Game', 'Green', '#00B14F', 20),
    (2, 'Tic Tac Toes', 'Opponent Challenge', 'Purple', '#7C3AED', 30),
    (3, 'Trivia: Quiz Solving 1', 'Trivia', 'Blue', '#2563EB', 15),
    (4, 'Ouch! Food Delivery', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (5, 'Giant Jingga', 'Opponent Challenge', 'Purple', '#7C3AED', 30),
    (6, 'Trivia: Quiz Solving 2', 'Trivia', 'Blue', '#2563EB', 15),
    (7, 'Step Counter Challenge', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (8, 'Puzzle Challenge', 'Brain Game', 'Green', '#00B14F', 20),
    (9, 'Capture the Flag', 'Opponent Challenge', 'Purple', '#7C3AED', 30),
    (10, 'Math Challenge', 'Brain Game', 'Green', '#00B14F', 20),
    (11, 'Caterpillar Walk', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (12, 'Trivia: Quiz Solving 3', 'Trivia', 'Blue', '#2563EB', 15),
    (13, 'Musical Chair', 'Opponent Challenge', 'Purple', '#7C3AED', 30),
    (14, 'Trivia: Team Fun Task 1', 'Trivia', 'Blue', '#2563EB', 15),
    (15, 'Trivia: Team Fun Task 2', 'Trivia', 'Blue', '#2563EB', 15),
    (16, 'Water Bottle Matching', 'Opponent Challenge', 'Purple', '#7C3AED', 30),
    (17, 'Memory & Spot the Difference', 'Brain Game', 'Green', '#00B14F', 20),
    (18, 'Grab Rider Is OTW', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (19, 'Giant Wall Matching', 'Brain Game', 'Green', '#00B14F', 20),
    (20, 'Bean Separation', 'Brain Game', 'Green', '#00B14F', 20),
    (21, 'Trivia: Crack the Passcode 1', 'Trivia', 'Blue', '#2563EB', 15),
    (22, 'Human Knot', 'Physical Challenge', 'Yellow', '#F59E0B', 35),
    (23, 'Trivia: Crack the Passcode 2', 'Trivia', 'Blue', '#2563EB', 15),
    (24, 'Bottle Toss', 'Opponent Challenge', 'Purple', '#7C3AED', 30)
    ) as t(slot, title, category, color, hex_code, points)
    order by slot
  loop
    insert into public.bingo_tasks
      (section_id, owner_id, title, category, color, hex_code, points, sort_order, in_grid, task_type)
    values
      (v_section, v_owner, r.title, r.category, r.color, r.hex_code, r.points, r.slot, true, 'standard')
    returning id into v_task;

    insert into public.bingo_board_cards (section_id, task_id, slot)
    values (v_section, v_task, r.slot);
  end loop;

  raise notice 'Created board grab-game-day (%).', v_section;
end $$;
