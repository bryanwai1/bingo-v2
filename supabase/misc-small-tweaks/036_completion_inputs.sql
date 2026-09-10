-- Let a card ask for a combination of inputs instead of exactly one.
--
-- task_type made photo, video and text mutually exclusive, so a card that
-- wanted "film the run AND tell us the shop name" had to pick one and lose the
-- other. That is why the 'media' type exists at all — it is really just
-- photo + video, spelled as a third type.
--
-- completion_inputs replaces that with a set: which inputs a card collects, and
-- whether each one is compulsory. Shape:
--
--   {"photo": "required", "answer": "optional"}
--
-- Rules the app applies:
--   • every 'required' input must be satisfied before the tile turns green
--   • at least one input must be satisfied, so an all-optional card is not
--     complete the moment it is opened (this is what the old 'media' type
--     meant: a photo or a clip, either will do)
--   • an empty object means the card still uses its task_type as before
--
-- Marshal stays exclusive and out of this: a password is a person vouching for
-- the whole card, not one input among several. sign_splice and breakout_hunt
-- keep their own flows too.

alter table bingo_tasks
  add column if not exists completion_inputs jsonb not null default '{}'::jsonb;

-- Whether the team's typed answer has been accepted. Photo and video
-- satisfaction is read from their submissions; the answer had nowhere to live,
-- because it used to complete the tile outright the moment it was correct.
alter table bingo_scans
  add column if not exists answer_ok boolean not null default false;

-- Carry the existing cards across, so nothing changes shape on deploy.
update bingo_tasks set completion_inputs = '{"photo": "required"}'::jsonb
  where task_type = 'photo' and completion_inputs = '{}'::jsonb;

update bingo_tasks set completion_inputs = '{"video": "required"}'::jsonb
  where task_type = 'video' and completion_inputs = '{}'::jsonb;

update bingo_tasks set completion_inputs = '{"answer": "required"}'::jsonb
  where task_type = 'answer' and completion_inputs = '{}'::jsonb;

-- 'media' was "a photo or a clip": both offered, neither compulsory on its own.
update bingo_tasks set completion_inputs = '{"photo": "optional", "video": "optional"}'::jsonb
  where task_type = 'media' and completion_inputs = '{}'::jsonb;

-- A team that already typed the right answer keeps credit for it.
update bingo_scans set answer_ok = true where completed = true;
