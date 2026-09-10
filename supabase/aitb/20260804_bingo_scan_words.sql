-- AI Team Building cards on a Bingo Dash board
--
-- The AITB missions that carry an interactive system (Nerf cups, the jingle
-- roulette, the cinematic card deal, the animal draw) and the Ping Pong 7-word
-- pitch all produce a RESULT the whole team must agree on. On /aitb that result
-- lives in aitb_progress.words; a bingo board has no aitb_progress row, so the
-- equivalent per-team-per-card row is bingo_scans.
--
-- Without this column every phone in a team would spin its own roulette and
-- deal its own cards — two teammates would be working from different prompts.
-- With it, the first draw is written once and every other phone reads it back
-- through the bingo_scans realtime subscription the board already runs.
--
-- Safe to re-run.

alter table public.bingo_scans
  add column if not exists words text[] not null default '{}';

comment on column public.bingo_scans.words is
  'Result slots for AI Team Building cards — the drawn/typed words for this team on this card. Empty for every other card type.';
