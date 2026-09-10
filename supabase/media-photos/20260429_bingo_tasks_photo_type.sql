-- Allow 'photo' as a task_type value. Original 20260415 migration only listed
-- ('standard', 'answer'); the admin Photo button has been writing 'photo' and
-- the CHECK constraint was rejecting saves.
ALTER TABLE bingo_tasks
  DROP CONSTRAINT IF EXISTS bingo_tasks_task_type_check;

ALTER TABLE bingo_tasks
  ADD CONSTRAINT bingo_tasks_task_type_check
  CHECK (task_type IN ('standard', 'answer', 'photo'));
