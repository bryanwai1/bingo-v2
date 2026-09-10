-- ============================================================
-- Scale: indexes on the columns the live event hits hardest.
-- Every one is CREATE INDEX IF NOT EXISTS — safe to re-run, and
-- safe to run against a live database.
-- ============================================================

-- Scans: read on every board render, written on every completion.
create index if not exists bingo_scans_team_idx        on public.bingo_scans(team_id);
create index if not exists bingo_scans_task_idx        on public.bingo_scans(task_id);
create index if not exists bingo_scans_team_task_idx   on public.bingo_scans(team_id, task_id);
create index if not exists bingo_scans_completed_idx   on public.bingo_scans(completed) where completed;

-- Teams and members: scoreboard + registration lookups.
create index if not exists bingo_teams_section_idx     on public.bingo_teams(section_id);
create index if not exists bingo_members_team_idx      on public.bingo_members(team_id);
create index if not exists bingo_members_section_idx   on public.bingo_members(section_id);

-- Tasks and placements: board render.
create index if not exists bingo_tasks_section_idx     on public.bingo_tasks(section_id);
create index if not exists bingo_board_cards_sec_idx   on public.bingo_board_cards(section_id);
create index if not exists bingo_board_cards_task_idx  on public.bingo_board_cards(task_id);

-- Photo submissions: admin review queue.
create index if not exists bingo_photo_sub_task_idx    on public.bingo_photo_submissions(task_id);

-- Sections by slug: every player join resolves a slug.
create index if not exists bingo_sections_slug_idx     on public.bingo_sections(slug);

analyze public.bingo_scans;
analyze public.bingo_teams;
analyze public.bingo_tasks;
analyze public.bingo_board_cards;
