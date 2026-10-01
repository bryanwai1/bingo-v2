-- Samples can also be a link (any web page, or an uploaded .html file), shown
-- embedded with an "Open" button — the same as Mission Control Budget's tool.
-- For a link, caption is the button label.
alter table public.bingo_task_samples
  drop constraint if exists bingo_task_samples_media_type_check;
alter table public.bingo_task_samples
  add constraint bingo_task_samples_media_type_check
  check (media_type in ('image', 'video', 'link'));
