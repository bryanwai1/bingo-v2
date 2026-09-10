-- Whole-game countdown: admin sets a global end time; mission pages lock and
-- the projector flashes TIME'S UP once it passes. Null = no timer running.
alter table aitb_settings add column if not exists game_ends_at timestamptz;

notify pgrst, 'reload schema';
