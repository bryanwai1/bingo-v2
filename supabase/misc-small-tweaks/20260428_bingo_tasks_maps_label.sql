-- Optional friendly label for the maps button on a task
ALTER TABLE bingo_tasks
  ADD COLUMN IF NOT EXISTS maps_label text;
