-- Moves the Grab hero images into each card's photo carousel (bingo_task_photos).
-- For boards loaded before the load script did this. Safe to re-run.
do $$
declare v_section uuid; r record; v_task uuid; n int := 0;
begin
  select id into v_section from public.bingo_sections where slug = 'grab-game-day';
  if v_section is null then raise exception 'Board grab-game-day not found.'; end if;
  for r in select * from (values
    ('Memory & Spot the Difference', 'memory-spot-difference'),
    ('Icon Matching', 'giant-wall-matching'),
    ('Bean Separation', 'bean-separation'),
    ('Tic Tac Toes', 'tic-tac-toes'),
    ('Giant Jingga', 'giant-jingga'),
    ('Capture the Flag', 'capture-the-flag'),
    ('Water Bottle Matching', 'water-bottle-matching'),
    ('Bottle Toss', 'bottle-toss'),
    ('Grab It All', 'grab-it-all'),
    ('Where''s My Driver?', 'where-is-my-driver'),
    ('Parcel Delivery Mission', 'parcel-delivery'),
    ('Ouch! Food Delivery', 'ouch-food-delivery'),
    ('Step Counter Challenge', 'step-counter'),
    ('Caterpillar Walk', 'caterpillar-walk'),
    ('Human Knot', 'human-knot'),
    ('GrabCar to the Rescue!', 'grabcar-to-the-rescue'),
    ('Quiz Solving', 'quiz-solving'),
    ('Crack the Passcode', 'crack-the-passcode')
  ) as t(title, slug) loop
    select id into v_task from public.bingo_tasks
     where section_id = v_section and title = r.title and tile_icon is not null limit 1;
    if v_task is null then continue; end if;
    if not exists (select 1 from public.bingo_task_photos where task_id = v_task) then
      insert into public.bingo_task_photos (task_id, photo_url, photo_order)
      values (v_task, '/grab/heroes/' || r.slug || '.jpg', 0);
      n := n + 1;
    end if;
    -- the same image was on the instruction page before: remove it so it is not shown twice
    update public.bingo_task_pages set media_url = null, media_type = null
     where task_id = v_task and media_url like '/grab/heroes/%';
  end loop;
  raise notice 'Added hero photos to % cards.', n;
end $$;
