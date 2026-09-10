-- Sign Splice Title: the remaining per-card game settings from spec §6.
--
-- Two settings in that list are deliberately absent:
--   "Camera only mode / Gallery upload allowed" — the card now captures from a
--   live getUserMedia stream, so there is no gallery path to allow.
--   "Manual review enabled" — flagged submissions are logged for audit rather
--   than queued, so there is no review gate to switch on.

alter table bingo_tasks
  add column if not exists sign_splice_min_letters integer not null default 4;

alter table bingo_tasks
  add column if not exists sign_splice_max_letters integer not null default 20;

alter table bingo_tasks
  add column if not exists sign_splice_allow_spaces boolean not null default false;

alter table bingo_tasks
  add column if not exists sign_splice_allow_numbers boolean not null default false;

-- 0..1. Below this, the scan still counts but is flagged in the photo log and
-- the team is warned before they accept the letter.
alter table bingo_tasks
  add column if not exists sign_splice_min_confidence real not null default 0.70;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_sign_splice_letters_check;
alter table bingo_tasks
  add constraint bingo_tasks_sign_splice_letters_check
  check (sign_splice_min_letters >= 1
     and sign_splice_max_letters >= sign_splice_min_letters
     and sign_splice_max_letters <= 40);

alter table bingo_tasks
  drop constraint if exists bingo_tasks_sign_splice_confidence_check;
alter table bingo_tasks
  add constraint bingo_tasks_sign_splice_confidence_check
  check (sign_splice_min_confidence >= 0 and sign_splice_min_confidence <= 1);
