-- Global toggle (in marshal admin) to enable/disable photo submissions
-- across every photo-type card. Default ON so existing behavior is unchanged.
ALTER TABLE bingo_settings
  ADD COLUMN IF NOT EXISTS photo_submissions_enabled boolean NOT NULL DEFAULT true;
