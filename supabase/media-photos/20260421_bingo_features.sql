-- Observer role on members
ALTER TABLE bingo_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'observer'));

-- Google Maps URL on tasks
ALTER TABLE bingo_tasks
  ADD COLUMN IF NOT EXISTS maps_url text;

-- Photo submissions for dual-path task completion
CREATE TABLE IF NOT EXISTS bingo_photo_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES bingo_teams(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL REFERENCES bingo_tasks(id) ON DELETE CASCADE,
  scan_id     uuid REFERENCES bingo_scans(id) ON DELETE SET NULL,
  photo_url   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: public read/insert; admin deletes via service role
ALTER TABLE bingo_photo_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read photo submissions" ON bingo_photo_submissions FOR SELECT USING (true);
CREATE POLICY "public insert photo submissions" ON bingo_photo_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update photo submissions" ON bingo_photo_submissions FOR UPDATE USING (true);
