-- Let a photo card take more than one photo from a team.
--
-- A Photo card accepts a single shot: the moment one is sent the participant
-- view locks to "waiting for marshal review", so a challenge that is really
-- "show us all four colours" or "both clips" has no way to send the rest.
--
-- Each photo is still its own row in bingo_photo_submissions and is still
-- approved or rejected on its own in the admin, so nothing about review
-- changes — a team can simply send several.
--
-- Off by default: every existing card keeps taking exactly one.

alter table bingo_tasks
  add column if not exists photo_multiple boolean not null default false;
