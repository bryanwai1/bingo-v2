-- A card can ask for a video instead of a photo.
--
-- Several challenges are motion, not a still — Match Cut's two clips, a dance
-- performance, a route walked. Those cards had to be marshal-completed on the
-- facilitator's word because the app could only take a photo.
--
-- A video rides the same pipeline a photo does: uploaded to the media bucket,
-- one row per file in bingo_photo_submissions, approved or rejected on the
-- admin Photos page, approval completing the team's tile. Only the file type
-- differs, so the review queue stays one queue.

-- The new completion type. CHECK constraints cannot be extended in place, so
-- the list is recreated with every type the app currently uses.
alter table bingo_tasks drop constraint if exists bingo_tasks_task_type_check;
alter table bingo_tasks add constraint bingo_tasks_task_type_check
  check (task_type in ('standard', 'answer', 'photo', 'video', 'sign_splice', 'breakout_hunt'));

-- What kind of file a submission holds, so the admin knows to render a player
-- rather than an <img>. Existing rows are all photos.
alter table bingo_photo_submissions
  add column if not exists media_type text not null default 'image';

alter table bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_media_type_check;
alter table bingo_photo_submissions
  add constraint bingo_photo_submissions_media_type_check
  check (media_type in ('image', 'video'));

-- Video files are far larger than the 20 MB a page video was capped at. 100 MB
-- covers a minute of phone footage; the participant view refuses anything
-- bigger before it starts uploading.
update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 104857600)
where id = 'media';
