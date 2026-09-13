-- Free-text answers. A card whose Text input has a question but no saved
-- answer (and no minimum number) takes whatever the team types and sends it
-- to the admin to approve or reject, like a link. The text itself lives in
-- photo_url, as a link's address does.
alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_media_type_check;
alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_media_type_check
  check (media_type in ('image', 'video', 'link', 'versus', 'text'));
