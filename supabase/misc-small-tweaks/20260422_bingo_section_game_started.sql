-- Add per-section game_started so multiple games can run independently
alter table bingo_sections add column if not exists game_started boolean not null default false;
