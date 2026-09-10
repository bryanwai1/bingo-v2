-- A card that wants a photo *and* a clip.
--
-- Six Mall Hunt cards ask for both in the same breath — "upload the map and all
-- 4 clips", "the tool screenshot plus a demo clip", "the villain and the
-- reaction clip". A photo card refuses the clip and a video card refuses the
-- still, so either choice blocks half of what the instructions ask for.
--
-- 'media' is the pair: the same tray, the same one-row-per-file review, with
-- the picker accepting either kind. Each submission already records its own
-- media_type, so the admin renders a player or an image per file as before.

alter table bingo_tasks drop constraint if exists bingo_tasks_task_type_check;
alter table bingo_tasks add constraint bingo_tasks_task_type_check
  check (task_type in ('standard', 'answer', 'photo', 'video', 'media', 'sign_splice', 'breakout_hunt'));
