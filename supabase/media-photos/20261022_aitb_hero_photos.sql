-- Give every AI Team Building card a real hero photo row.
--
-- Their art ships with the app in public/aitb, so it was never uploaded and
-- never got a bingo_task_photos row: the card editor's photo section and the
-- player view both showed no hero. The URLs are root-relative so they resolve
-- on whichever host serves the app. Matched by title, the same way
-- aitbHeroUrlByName() does; cards that already have any photo are left alone,
-- so this is safe to run again.

insert into public.bingo_task_photos (task_id, photo_url, photo_order, position_x, position_y)
select t.id, '/aitb/' || v.file, 0, 50, 50
from public.bingo_tasks t
join (values
  ('nerf prompt cups',            'nerth-prompt-cups.jpg'),  -- misspelt on disk
  ('retro game speed build',      'retro-game-speed-build.jpg'),
  ('rubber band castle',          'rubber-band-castle.jpg'),
  ('resort tree app sprint',      'resort-tree-app-sprint.jpg'),
  ('roulette jingle & dance off', 'roulette-jingle-dance-off.jpg'),
  ('random card cinematic',       'random-card-cinematic.jpg'),
  ('ping pong alphabet pitch',    'ping-pong-alphabet-pitch.jpg'),
  ('speed edit showdown',         'speed-edit-showdown.jpg'),
  ('found object animals',        'found-object-animals.jpg'),
  ('resort character journey',    'resort-character-journey.jpg')
) as v(title, file) on lower(trim(t.title)) = v.title
where not exists (select 1 from public.bingo_task_photos p where p.task_id = t.id);
