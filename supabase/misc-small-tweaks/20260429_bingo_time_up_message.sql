-- Time-up alarm payload, edited by admin and shown to all players when the
-- game timer ends. Defaults give a sensible message in case admin forgets to
-- set them before the timer runs out.
ALTER TABLE bingo_settings
  ADD COLUMN IF NOT EXISTS time_up_message text NOT NULL DEFAULT 'Time''s up! Please return to the meeting point.',
  ADD COLUMN IF NOT EXISTS time_up_label   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_up_maps_url text NOT NULL DEFAULT '';
