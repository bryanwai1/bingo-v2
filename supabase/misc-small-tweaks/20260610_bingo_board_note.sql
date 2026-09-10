-- Per-board facilitator note shown in a box below the bingo board on the
-- player page (e.g. "Collect an item for the Bonsai Project after every
-- 2 completed boxes"). board_note_every drives a live item counter:
-- players see floor(completed / board_note_every) items to collect.
-- Set board_note_every to 0 to hide the counter; empty note hides the box.
ALTER TABLE bingo_sections
  ADD COLUMN IF NOT EXISTS board_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS board_note_every int NOT NULL DEFAULT 2;
