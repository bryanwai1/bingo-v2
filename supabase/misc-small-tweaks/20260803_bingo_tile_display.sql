-- Per-board tile display mode for the 5×5 bingo board.
--   'icon'  — one crisp category icon per tile (default; nothing to squint at)
--   'words' — the CATEGORY in readable caps plus a shortened title
-- Players complained the full title crammed into a ~70px tile was unreadable,
-- so the facilitator now picks per board in the Bingo Dash admin.
ALTER TABLE bingo_sections
  ADD COLUMN IF NOT EXISTS tile_display text NOT NULL DEFAULT 'icon';

ALTER TABLE bingo_sections
  DROP CONSTRAINT IF EXISTS bingo_sections_tile_display_check;

ALTER TABLE bingo_sections
  ADD CONSTRAINT bingo_sections_tile_display_check
  CHECK (tile_display IN ('icon', 'words'));
