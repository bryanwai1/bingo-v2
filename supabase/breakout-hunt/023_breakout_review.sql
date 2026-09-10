-- Breakout Hunt photos go through the existing admin photo review.
--
-- A team submits all ten at once, so the reviewer sees the whole set together
-- and can judge it as one job. Two columns are needed on the shared photo
-- submissions table:
--
--   label      what the photo is supposed to show ("3. Clock"). Without it the
--              reviewer is looking at ten pictures with no idea which puzzle
--              each one answers.
--   puzzle_id  links the row back to the puzzle, so rejecting one photo can
--              clear exactly that puzzle for the team to retake.

alter table bingo_photo_submissions
  add column if not exists label text;

alter table bingo_photo_submissions
  add column if not exists puzzle_id uuid references bingo_breakout_puzzles(id) on delete set null;

create index if not exists idx_photo_submissions_puzzle
  on bingo_photo_submissions (puzzle_id);

-- Whether a team has sent its set in, and what came back. Kept on the progress
-- row so the card can show "waiting", "retake this one" or "approved" per
-- puzzle without re-deriving it from the submissions table every render.
alter table bingo_breakout_progress
  add column if not exists submitted_at timestamptz;

alter table bingo_breakout_progress
  add column if not exists review_status text not null default 'draft';

alter table bingo_breakout_progress
  drop constraint if exists bingo_breakout_progress_review_check;
alter table bingo_breakout_progress
  add constraint bingo_breakout_progress_review_check
  check (review_status in ('draft', 'pending', 'approved', 'rejected'));
