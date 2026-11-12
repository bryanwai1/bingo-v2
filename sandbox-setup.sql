-- BINGO SANDBOX SETUP  (phase 1 = tables, phase 2 = the rest)
-- TEST project only. Re-runnable.

create extension if not exists pgcrypto;

-- ================= PHASE 1: TABLES =================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  color text not null,
  hex_code text not null,
  title text not null,
  sort_order int not null default 0,
  points int not null default 0,
  created_at timestamptz default now()
);
create table if not exists task_pages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  page_order int not null default 0,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  pointer_1 text,
  pointer_2 text,
  pointer_3 text,
  pointer_4 text,
  pointer_5 text,
  pointer_6 text,
  example_1 text,
  example_2 text,
  example_3 text,
  example_4 text,
  example_5 text,
  example_6 text,
  icon_1 text,
  icon_2 text,
  icon_3 text,
  icon_4 text,
  icon_5 text,
  icon_6 text,
  created_at timestamptz default now()
);
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);
create table if not exists team_scans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  task_id uuid not null,
  scanned_at timestamptz default now(),
  completed boolean not null default false,
  completed_at timestamptz,
  unique(team_id, task_id)
);
create table if not exists task_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  photo_url text not null,
  photo_order int not null default 0,
  position_x float not null default 50,
  position_y float not null default 50,
  caption text,
  created_at timestamptz default now()
);
CREATE TABLE IF NOT EXISTS bingo_award_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL UNIQUE,
  total_points INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  consolation_count INTEGER NOT NULL DEFAULT 3,
  third_count INTEGER NOT NULL DEFAULT 1,
  second_count INTEGER NOT NULL DEFAULT 1,
  first_count INTEGER NOT NULL DEFAULT 1,
  slide_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  slide_points JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
create table if not exists bingo_board_cards (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  task_id uuid not null,
  slot int not null default 0 check (slot >= 0 and slot < 25),
  created_at timestamptz not null default now(),
  unique (section_id, task_id)
);
create table if not exists bingo_categories (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);
CREATE TABLE IF NOT EXISTS bingo_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'Blue',
  hex_code   TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bingo_task_pages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL,
  page_order INTEGER NOT NULL DEFAULT 0,
  media_url  TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  pointer_1  TEXT, pointer_2 TEXT, pointer_3 TEXT,
  pointer_4  TEXT, pointer_5 TEXT, pointer_6 TEXT,
  example_1  TEXT, example_2 TEXT, example_3 TEXT,
  example_4  TEXT, example_5 TEXT, example_6 TEXT,
  icon_1     TEXT, icon_2    TEXT, icon_3    TEXT,
  icon_4     TEXT, icon_5    TEXT, icon_6    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bingo_task_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL,
  photo_url   TEXT NOT NULL,
  photo_order INTEGER NOT NULL DEFAULT 0,
  position_x  NUMERIC NOT NULL DEFAULT 50,
  position_y  NUMERIC NOT NULL DEFAULT 50,
  caption     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bingo_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bingo_scans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL,
  task_id      UUID NOT NULL,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  UNIQUE (team_id, task_id)
);
CREATE TABLE IF NOT EXISTS bingo_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL,
  section_id  UUID NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
create table if not exists bingo_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists bingo_task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  label text not null,
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
CREATE TABLE IF NOT EXISTS bingo_settings (
  id           TEXT PRIMARY KEY DEFAULT 'main',
  timer_seconds INTEGER NOT NULL DEFAULT 0,
  timer_end_at  TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shape_facilitators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name text NOT NULL UNIQUE,
  facilitator_num integer,
  created_at timestamptz DEFAULT now()
);
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  is_creator boolean not null default false,
  joined_at timestamptz default now()
);
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  label text not null,
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
CREATE TABLE IF NOT EXISTS bingo_photo_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL,
  task_id     uuid NOT NULL,
  scan_id     uuid,
  photo_url   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
create table if not exists public.bingo_accounts (
  id          uuid primary key,
  email       text,
  role        text not null default 'sub'     check (role   in ('owner', 'sub')),
  status      text not null default 'pending'  check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);
create table if not exists public.bingo_facilitator_sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  pin         text not null,
  -- Whose tenant the crew works on. Owner host -> house rows (owner_id NULL),
  -- sub host -> that sub's rows. Mirrors bingo_accounts.facilitator_host.
  host_id     uuid not null,
  label       text not null default 'Event session',
  expires_at  timestamptz not null,
  max_uses    int,                              -- NULL = unlimited seats
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS bingo_duels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id         uuid NOT NULL,
  task_id            uuid NOT NULL,
  challenger_team_id uuid NOT NULL,
  defender_team_id   uuid NOT NULL,
  game_key           text NOT NULL DEFAULT 'speed-edit',
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'active', 'done', 'declined', 'cancelled')),
  -- Whatever the game needs both phones to agree on, e.g. the randomly drawn
  -- Speed Edit target image. Written once by the challenger so both sides read
  -- the identical value.
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_team_id     uuid,
  -- Snapshot of the card's contest bonus at resolve time, so later edits to the
  -- card never rewrite history on the scoreboard.
  bonus_points       int  NOT NULL DEFAULT 0,
  -- Human-readable reference so a marshal can match phone to phone out loud.
  code               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  resolved_at        timestamptz,
  CONSTRAINT bingo_duels_distinct_teams CHECK (challenger_team_id <> defender_team_id)
);
create table if not exists public.bingo_challenge_sections (
  id uuid primary key default gen_random_uuid(),
  game_section_id uuid not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id         text primary key default gen_random_uuid()::text,
  key        text unique,
  value      text,
  owner_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- owner_id columns the multitenant RLS expects (flag base tables)
alter table public.tasks       add column if not exists owner_id uuid;
alter table public.task_pages  add column if not exists owner_id uuid;
alter table public.task_photos add column if not exists owner_id uuid;
alter table public.task_links  add column if not exists owner_id uuid;
alter table public.teams       add column if not exists owner_id uuid;
alter table public.team_members add column if not exists owner_id uuid;
alter table public.team_scans  add column if not exists owner_id uuid;
alter table public.settings    add column if not exists owner_id uuid;


-- ================= PHASE 1.5: ALL COLUMNS =================
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS in_grid boolean NOT NULL DEFAULT false;
alter table public.bingo_teams ADD COLUMN IF NOT EXISTS password text NOT NULL DEFAULT '';
alter table public.bingo_award_configs ADD COLUMN IF NOT EXISTS slide_points JSONB NOT NULL DEFAULT '{}'::jsonb;
alter table public.bingo_settings ADD COLUMN IF NOT EXISTS game_started BOOLEAN NOT NULL DEFAULT false;
alter table public.bingo_sections add column if not exists timer_seconds int not null default 0;
alter table public.bingo_sections add column if not exists timer_end_at timestamptz;
alter table public.bingo_sections add column if not exists time_up_message text not null default '';
alter table public.bingo_sections add column if not exists time_up_label text not null default '';
alter table public.bingo_sections add column if not exists time_up_maps_url text not null default '';
alter table public.bingo_sections add column if not exists marshal_password text not null default '1234';
alter table public.bingo_sections add column if not exists photo_submissions_enabled boolean not null default true;
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
alter table public.bingo_tasks add column if not exists section_id uuid;
alter table public.bingo_teams add column if not exists section_id uuid;
alter table public.bingo_settings add column if not exists active_section_id uuid;
alter table public.bingo_teams ADD COLUMN IF NOT EXISTS bonus_points INTEGER NOT NULL DEFAULT 0;
alter table public.bingo_teams ADD COLUMN IF NOT EXISTS photo_url TEXT;
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_1 text;
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_2 text;
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_3 text;
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_4 text;
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_5 text;
alter table public.task_pages ADD COLUMN IF NOT EXISTS icon_6 text;
alter table public.bingo_settings ADD COLUMN IF NOT EXISTS marshal_password TEXT NOT NULL DEFAULT '1234';
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS require_marshal BOOLEAN NOT NULL DEFAULT TRUE;
alter table public.teams ADD COLUMN IF NOT EXISTS password text NOT NULL DEFAULT '';
alter table public.tasks ADD COLUMN IF NOT EXISTS points int NOT NULL DEFAULT 0;
alter table public.tasks add column if not exists is_live boolean not null default true;
alter table public.bingo_tasks add column if not exists task_type  text not null default 'standard'
                                      check (task_type in ('standard', 'answer'));
alter table public.bingo_tasks add column if not exists answer_question  text;
alter table public.bingo_tasks add column if not exists answer_text      text;
alter table public.bingo_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'observer'));
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS maps_url text;
alter table public.bingo_sections add column if not exists game_started boolean not null default false;
alter table public.bingo_award_configs add column if not exists consolation_group_count int not null default 0;
alter table public.bingo_award_configs add column if not exists holding_title text;
alter table public.bingo_award_configs add column if not exists main_title text;
alter table public.bingo_award_configs add column if not exists main_subtitle text;
alter table public.bingo_award_configs add column if not exists main_tagline text;
alter table public.bingo_settings ADD COLUMN IF NOT EXISTS photo_submissions_enabled boolean NOT NULL DEFAULT true;
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS maps_label text;
alter table public.bingo_settings ADD COLUMN IF NOT EXISTS time_up_message text NOT NULL DEFAULT 'Time''s up! Please return to the meeting point.',
  ADD COLUMN IF NOT EXISTS time_up_label   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_up_maps_url text NOT NULL DEFAULT '';
alter table public.bingo_sections ADD COLUMN IF NOT EXISTS board_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS board_note_every int NOT NULL DEFAULT 2;
alter table public.bingo_tasks add column if not exists owner_id uuid;
alter table public.bingo_sections add column if not exists owner_id uuid;
alter table public.bingo_accounts add column if not exists can_bingo boolean not null default true;
alter table public.bingo_accounts add column if not exists can_flag  boolean not null default false;
alter table public.bingo_accounts add column if not exists active_section_id uuid;
alter table public.bingo_settings add column if not exists template_section_id uuid;
alter table public.bingo_tasks add column if not exists cloned_from uuid;
alter table public.bingo_accounts add column if not exists facilitator_host uuid;
alter table public.bingo_accounts add column if not exists access_expires_at timestamptz;
alter table public.bingo_accounts add column if not exists display_name text;
alter table public.bingo_accounts add column if not exists facilitator_session_id uuid;
alter table public.bingo_tasks ADD COLUMN IF NOT EXISTS is_contest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contest_game text NOT NULL DEFAULT 'speed-edit',
  ADD COLUMN IF NOT EXISTS contest_bonus int NOT NULL DEFAULT 100;
alter table public.bingo_sections ADD COLUMN IF NOT EXISTS tile_display text NOT NULL DEFAULT 'icon';
alter table public.bingo_teams add column if not exists bonus_breakdown jsonb not null default '[]'::jsonb;
alter table public.bingo_scans add column if not exists words text[] default '{}';

-- ================= PHASE 2: EVERYTHING ELSE =================

-- ===== archive-sql/supabase-schema.sql =====
-- Flag Retrieval: Supabase Schema
-- Run this in the Supabase SQL Editor

-- Tasks: each colored card
-- [table hoisted: tasks]

-- Task pages: ordered instruction pages per task
-- [table hoisted: task_pages]

-- Teams: self-registered
-- [table hoisted: teams]

-- Team scans: tracks which team scanned which task
-- [table hoisted: team_scans]

-- Task photos: clue photo gallery per task (up to 10)
-- [table hoisted: task_photos]

-- Indexes
create index idx_task_photos_task_id on task_photos(task_id, photo_order);
create index idx_task_pages_task_id on task_pages(task_id, page_order);
create index idx_team_scans_team on team_scans(team_id);
create index idx_team_scans_task on team_scans(task_id);

-- Enable realtime
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table team_scans;
alter publication supabase_realtime add table tasks;


-- ===== archive-sql/supabase-bingo-grid-password.sql =====
-- ── Bingo Dash: grid selection + team password ────────────────────────────────
-- Run this in your Supabase SQL editor.

-- 1. Add in_grid flag to bingo_tasks
--    Controls which tiles appear in the 5×5 player board (max 25).
-- [column hoisted]

-- 2. Add password to bingo_teams
--    Teams are identified by name + password combo.
--    Existing teams get an empty password (they can still re-join with no password).
-- [column hoisted]


-- ===== archive-sql/supabase-migration-bingo-award-config.sql =====
-- ── Bingo Dash: Award slides config (per compartment) ───────────────────────
-- Run once in the Supabase SQL editor.
--
-- Stores the ceremony layout for the Award Slides show:
--   · total_points         — total prize-pool value shown on the holding slide
--   · image_url            — hero image shown on the holding / intro slides
--   · consolation_count    — how many "Honorable Mention" slides to include
--   · third_count          — how many 2nd Runner-Up slides
--   · second_count         — how many 1st Runner-Up slides
--   · first_count          — how many Grand Champion slides
--   · slide_order          — ordered JSON array of slide ids (e.g.
--                            ["intro","holding","consolation:0",...,"first:0"])
--   · slide_points         — per-slide prize points, keyed by slide id
--                            (e.g. {"first:0": 1000, "second:0": 500})

-- [table hoisted: bingo_award_configs]

-- If the table already existed from an earlier run, add the new column.
-- [column hoisted]

ALTER TABLE bingo_award_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "award_configs_all" ON bingo_award_configs;
CREATE POLICY "award_configs_all" ON bingo_award_configs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS bingo_award_configs_section_idx
  ON bingo_award_configs (section_id);

-- Tell PostgREST to reload so the new table is visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-board-cards.sql =====
-- ================================================================
-- Bingo Dash: universal cards across boards
--
-- 1) bingo_board_cards: per-board placements (board <-> card junction).
--    A card can now sit on any number of boards - no more cloning a
--    card just to reuse it on another board.
-- 2) Backfill: every card currently on a grid (in_grid = true) gets a
--    placement row on its home board, keeping its existing slot.
-- 3) Cleanup: delete leftover duplicate cards created by the old
--    copy-per-board flow (same title as an older card, not placed on
--    any board, no scans / photo submissions / snake-tile references).
--
-- Run once in the Supabase SQL editor BEFORE deploying the app update.
-- The legacy bingo_tasks.in_grid / sort_order columns are left in place
-- (the old app version keeps working until the new build is deployed).
-- ================================================================

-- [table hoisted: bingo_board_cards]
create index if not exists bingo_board_cards_section_idx on bingo_board_cards (section_id);
create index if not exists bingo_board_cards_task_idx on bingo_board_cards (task_id);

-- RLS: same permissive pattern as the other bingo_* tables.
alter table bingo_board_cards enable row level security;
drop policy if exists "anon read bingo_board_cards"  on bingo_board_cards;
drop policy if exists "anon write bingo_board_cards" on bingo_board_cards;
create policy "anon read bingo_board_cards"  on bingo_board_cards for select using (true);
create policy "anon write bingo_board_cards" on bingo_board_cards for all    using (true) with check (true);
-- [skipped: deleted game]
-- [skipped: deleted game]

-- Tell PostgREST to reload so the new table becomes visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-cards.sql =====
-- ================================================================
-- Bingo Dash: migrate LibraryCards into flag-retrieval bingo_tasks
-- 43 tasks, 89 instruction pages
-- Run in Supabase SQL editor (flag-retrieval project)
-- ================================================================

-- [seed removed]

-- [seed removed]


-- ===== archive-sql/supabase-migration-bingo-categories.sql =====
-- Bingo Dash: Categories as first-class entities (Compartment → Category → Card)
-- Run in the Supabase SQL editor.

-- 1. Create the table
-- [table hoisted: bingo_categories]

-- 2. Seed from existing task category strings
-- [seed removed]

-- 3. RLS (match the permissive pattern used by other bingo_* tables)
alter table bingo_categories enable row level security;
drop policy if exists "anon read bingo_categories"  on bingo_categories;
drop policy if exists "anon write bingo_categories" on bingo_categories;
create policy "anon read bingo_categories"  on bingo_categories for select using (true);
create policy "anon write bingo_categories" on bingo_categories for all    using (true) with check (true);

-- Tell PostgREST to reload so the new table becomes visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-dash.sql =====
-- ============================================================
-- Bingo Dash — Supabase migration
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Bingo tasks (the challenge cards)
-- [table hoisted: bingo_tasks]

-- 2. Instruction pages with 6 pointers (same shape as task_pages)
-- [table hoisted: bingo_task_pages]

-- 3. Hero photos for each card
-- [table hoisted: bingo_task_photos]

-- 4. Bingo Dash teams (own registration, no tribe system)
-- [table hoisted: bingo_teams]

-- 5. Scan + completion records
-- [table hoisted: bingo_scans]

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE bingo_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_task_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_task_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_scans       ENABLE ROW LEVEL SECURITY;

-- Allow full anon access (same pattern as existing tables)
CREATE POLICY "anon read bingo_tasks"        ON bingo_tasks       FOR SELECT USING (true);
CREATE POLICY "anon write bingo_tasks"       ON bingo_tasks       FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "anon read bingo_task_pages"   ON bingo_task_pages  FOR SELECT USING (true);
CREATE POLICY "anon write bingo_task_pages"  ON bingo_task_pages  FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "anon read bingo_task_photos"  ON bingo_task_photos FOR SELECT USING (true);
CREATE POLICY "anon write bingo_task_photos" ON bingo_task_photos FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "anon read bingo_teams"        ON bingo_teams       FOR SELECT USING (true);
CREATE POLICY "anon write bingo_teams"       ON bingo_teams       FOR ALL    USING (true) WITH CHECK (true);

CREATE POLICY "anon read bingo_scans"        ON bingo_scans       FOR SELECT USING (true);
CREATE POLICY "anon write bingo_scans"       ON bingo_scans       FOR ALL    USING (true) WITH CHECK (true);


-- ===== archive-sql/supabase-migration-bingo-game-lock.sql =====
-- ── Bingo Dash: Game Lock ─────────────────────────────────────────────────────
-- Adds a game_started flag to bingo_settings so admin can control when
-- participants are allowed to access the game board.
-- Run this in the Supabase SQL editor.

-- [column hoisted]


-- ===== archive-sql/supabase-migration-bingo-members-unique.sql =====
-- Bingo Dash: prevent duplicate member sign-ups.
--
-- Problem: bingo_members had NO uniqueness on (section_id, name). The app
-- de-duplicated members purely client-side via ilike(name), which fails when a
-- player re-enters their name slightly differently, when a transient error pushes
-- them back to the join screen, or when two devices race — so the same person ends
-- up with several rows (inflating team rosters and the 4-member cap). Once two
-- duplicates existed, the client lookup (.maybeSingle()) errored on the multi-row
-- result and inserted YET another row, compounding the problem.
--
-- This (1) merges existing duplicates, keeping the most recently created row per
-- person, then (2) adds a case-insensitive unique index on (section_id, lower(name)).
-- App code (BingoDashJoin.joinGroup) now upserts against this and recovers from a
-- unique-violation (23505) by reusing the existing row instead of creating a new one.
--
-- Run once in the Supabase SQL editor.

-- 1. Remove duplicate members, keeping the newest row per (section_id, lower(name)).
--    bingo_scans are keyed by team_id, not member_id, so deleting redundant member
--    rows does NOT affect scoring or completed tiles — only the roster/cap counts.
delete from bingo_members m
using bingo_members keep
where keep.section_id = m.section_id
  and lower(keep.name) = lower(m.name)
  and (
    keep.created_at > m.created_at
    or (keep.created_at = m.created_at and keep.id > m.id)
  );

-- 2. Enforce one member per name per board, case-insensitively.
create unique index if not exists bingo_members_section_lower_name_key
  on bingo_members (section_id, lower(name));

-- Reload PostgREST so the schema change is picked up immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-members.sql =====
-- Bingo members: individual participants who belong to a group (team)
-- [table hoisted: bingo_members]

ALTER TABLE bingo_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read bingo_members"  ON bingo_members FOR SELECT USING (true);
CREATE POLICY "anon write bingo_members" ON bingo_members FOR ALL    USING (true) WITH CHECK (true);


-- ===== archive-sql/supabase-migration-bingo-per-board-settings.sql =====
-- Bingo Dash: per-board timer + settings
-- Each board (bingo_sections row) gets its own timer, time's-up alarm,
-- marshal password and photo-submissions toggle. Only cards stay universal.
-- Run this in the Supabase SQL editor for the "Flag Retrieval" project.

-- [column hoisted]

-- Seed every board from the old global settings so nothing changes at cutover.
-- [skipped backfill: no existing data to migrate]
-- update bingo_sections s set
--   timer_seconds             = coalesce(g.timer_seconds, 0),
--   timer_end_at              = g.timer_end_at,
--   time_up_message           = coalesce(g.time_up_message, ''),
--   time_up_label             = coalesce(g.time_up_label, ''),
--   time_up_maps_url          = coalesce(g.time_up_maps_url, ''),
--   marshal_password          = coalesce(g.marshal_password, '1234'),
--   photo_submissions_enabled = coalesce(g.photo_submissions_enabled, true)
-- from bingo_settings g
-- where g.id = 'main';

-- bingo_sections is already in the supabase_realtime publication (live
-- game_started updates depend on it), so no publication change is needed.


-- ===== archive-sql/supabase-migration-bingo-photo-submissions-delete-rls.sql =====
-- Allow public DELETE on bingo_photo_submissions so the admin UI can remove
-- submission rows (per-submission Del button, bulk delete, and per-team Reset).
-- Existing policies (SELECT/INSERT/UPDATE) are already public; this matches them.

drop policy if exists "public delete photo submissions" on bingo_photo_submissions;
create policy "public delete photo submissions" on bingo_photo_submissions
  for delete using (true);


-- ===== archive-sql/supabase-migration-bingo-points.sql =====
-- ── Bingo Dash: Points per tile ──────────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- Add points column to bingo_tasks (default 0)
-- [column hoisted]


-- ===== archive-sql/supabase-migration-bingo-sections.sql =====
-- Bingo Dash: Sections (each section = one independent game/location)
-- Run once in the Supabase SQL editor.

-- [table hoisted: bingo_sections]

-- Seed a default section and migrate any existing tasks/teams into it.
insert into bingo_sections (name, slug, sort_order)
  values ('Default', 'default', 0)
  on conflict (slug) do nothing;

-- bingo_tasks.section_id
-- [column hoisted]
update bingo_tasks
   set section_id = (select id from bingo_sections where slug = 'default')
 where section_id is null;
alter table bingo_tasks alter column section_id set not null;
create index if not exists bingo_tasks_section_idx on bingo_tasks (section_id);

-- bingo_teams.section_id
-- [column hoisted]
update bingo_teams
   set section_id = (select id from bingo_sections where slug = 'default')
 where section_id is null;
alter table bingo_teams alter column section_id set not null;
create index if not exists bingo_teams_section_idx on bingo_teams (section_id);

-- bingo_settings.active_section_id (which section is live for players)
-- [column hoisted]
update bingo_settings
   set active_section_id = (select id from bingo_sections where slug = 'default')
 where active_section_id is null;

-- RLS: match the permissive pattern used by the other bingo_* tables.
alter table bingo_sections enable row level security;
drop policy if exists "anon read bingo_sections"  on bingo_sections;
drop policy if exists "anon write bingo_sections" on bingo_sections;
create policy "anon read bingo_sections"  on bingo_sections for select using (true);
create policy "anon write bingo_sections" on bingo_sections for all    using (true) with check (true);

-- Tell PostgREST to reload so the new table/columns become visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-task-links.sql =====
-- Bingo Dash: helpful links per task
-- Run this in the Supabase SQL editor for the "Flag Retrieval" project.

-- [table hoisted: bingo_task_links]

create index if not exists idx_bingo_task_links_task_id on bingo_task_links(task_id, sort_order);

alter table bingo_task_links enable row level security;

drop policy if exists "bingo_task_links: public read"   on bingo_task_links;
drop policy if exists "bingo_task_links: public write"  on bingo_task_links;
drop policy if exists "bingo_task_links: public update" on bingo_task_links;
drop policy if exists "bingo_task_links: public delete" on bingo_task_links;

create policy "bingo_task_links: public read"   on bingo_task_links for select using (true);
create policy "bingo_task_links: public write"  on bingo_task_links for insert with check (true);
create policy "bingo_task_links: public update" on bingo_task_links for update using (true) with check (true);
create policy "bingo_task_links: public delete" on bingo_task_links for delete using (true);

alter publication supabase_realtime add table bingo_task_links;


-- ===== archive-sql/supabase-migration-bingo-team-bonus.sql =====
-- ── Bingo Dash: Team bonus points (other-game contributions) ─────────────────
-- Run once in the Supabase SQL editor.

-- [column hoisted]

-- Tell PostgREST to reload so the new column is visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-team-photos.sql =====
-- ── Bingo Dash: Team photo (icon for winner slides) ─────────────────────────
-- Run once in the Supabase SQL editor.

-- [column hoisted]

-- Tell PostgREST to reload so the new column is visible immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-teams-section-unique.sql =====
-- Bingo Dash: make team (group) names unique PER BOARD, not globally.
--
-- The original bingo-dash migration declared `bingo_teams.name TEXT NOT NULL UNIQUE`,
-- a GLOBAL unique constraint. After boards (sections) were added, that constraint
-- meant two different boards could not both have a group with the same name
-- (e.g. both wanting "Group 1") — teams from one board clashed with another.
--
-- This drops the global constraint and replaces it with a per-section one, mirroring
-- the (section_id, name) pattern already used by bingo_categories. App code already
-- checks name uniqueness per section, so this only relaxes the DB to match.
--
-- Run once in the Supabase SQL editor.

-- 1. Drop the legacy global UNIQUE(name) constraint (default name: bingo_teams_name_key).
alter table bingo_teams drop constraint if exists bingo_teams_name_key;

-- 2. Names need only be unique within a single board/section.
alter table bingo_teams drop constraint if exists bingo_teams_section_id_name_key;
alter table bingo_teams add  constraint bingo_teams_section_id_name_key unique (section_id, name);

-- Reload PostgREST so the schema change is picked up immediately.
notify pgrst, 'reload schema';


-- ===== archive-sql/supabase-migration-bingo-timer-categories.sql =====
-- ── Bingo Dash: Timer + Categories ──────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- 1. Add category column to bingo_tasks (default empty string)
-- [column hoisted]

-- 2. Create bingo_settings table (single-row config)
-- [table hoisted: bingo_settings]

-- Insert the default row if it doesn't exist
INSERT INTO bingo_settings (id, timer_seconds, timer_end_at)
VALUES ('main', 0, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. Row-level security
ALTER TABLE bingo_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bingo_settings' AND policyname = 'allow_all_bingo_settings'
  ) THEN
    CREATE POLICY allow_all_bingo_settings ON bingo_settings
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
-- [skipped: deleted game]
-- [skipped: deleted game]


-- ===== archive-sql/supabase-migration-icons.sql =====
-- Migration: Add icon columns to task_pages table
-- Run this in the Supabase SQL Editor

-- [column hoisted]
-- [column hoisted]
-- [column hoisted]
-- [column hoisted]
-- [column hoisted]
-- [column hoisted]


-- ===== archive-sql/supabase-migration-marshal-password.sql =====
-- Global marshal password (shared across all tasks)
-- [column hoisted]

-- Per-task toggle: require marshal password to complete (default ON)
-- [column hoisted]


-- ===== archive-sql/supabase-migration-members.sql =====
-- Migration: Add team_members table
-- Run this in the Supabase SQL Editor

-- [table hoisted: team_members]

create index idx_team_members_team on team_members(team_id);

alter publication supabase_realtime add table team_members;


-- ===== archive-sql/supabase-migration-password.sql =====
-- Add password column to teams table
-- Run this in the Supabase SQL editor for the "Flag Retrieval" project

-- [column hoisted]


-- ===== archive-sql/supabase-migration-points.sql =====
-- Migration: Add points column to tasks table
-- Run this in the Supabase SQL Editor

-- [column hoisted]


-- ===== archive-sql/supabase-migration-task-is-live.sql =====
-- Flag Retrieval: add is_live flag to tasks
-- Cards with is_live = true appear on the Projector view and accept participant scans.
-- Cards with is_live = false stay in the admin library (unused).
-- Defaults to true so existing tasks remain visible until an admin curates them.

-- [column hoisted]

create index if not exists tasks_is_live_idx on tasks(is_live);


-- ===== archive-sql/supabase-migration-task-links-marshal.sql =====
-- Flag Retrieval: task links + marshal password
-- Run this in the Supabase SQL editor for the "Flag Retrieval" project.

-- ── 1. task_links: multiple URL links per task ───────────────────────────
-- [table hoisted: task_links]

create index if not exists idx_task_links_task_id on task_links(task_id, sort_order);

alter table task_links enable row level security;

drop policy if exists "task_links: public read"   on task_links;
drop policy if exists "task_links: public write"  on task_links;
drop policy if exists "task_links: public update" on task_links;
drop policy if exists "task_links: public delete" on task_links;

create policy "task_links: public read"   on task_links for select using (true);
create policy "task_links: public write"  on task_links for insert with check (true);
create policy "task_links: public update" on task_links for update using (true) with check (true);
create policy "task_links: public delete" on task_links for delete using (true);

alter publication supabase_realtime add table task_links;

-- ── 2. Seed default marshal password (4-digit, '1234') ───────────────────
insert into settings (key, value) values ('marshal_password', '1234')
  on conflict (key) do nothing;


-- ===== archive-sql/supabase-migration-tasks-rls-relax.sql =====
-- Relax RLS on tasks and related admin tables to match bingo_tasks pattern.
-- The /admin route has no login gate, so the authenticated-only INSERT/UPDATE/DELETE
-- policies blocked all task creation from the admin dashboard (silent 401).

drop policy if exists "tasks: admin write"  on tasks;
drop policy if exists "tasks: admin update" on tasks;
drop policy if exists "tasks: admin delete" on tasks;

create policy "tasks: public write"  on tasks for insert with check (true);
create policy "tasks: public update" on tasks for update using (true) with check (true);
create policy "tasks: public delete" on tasks for delete using (true);

drop policy if exists "task_pages: admin write"  on task_pages;
drop policy if exists "task_pages: admin update" on task_pages;
drop policy if exists "task_pages: admin delete" on task_pages;

create policy "task_pages: public write"  on task_pages for insert with check (true);
create policy "task_pages: public update" on task_pages for update using (true) with check (true);
create policy "task_pages: public delete" on task_pages for delete using (true);

drop policy if exists "task_photos: admin write"  on task_photos;
drop policy if exists "task_photos: admin update" on task_photos;
drop policy if exists "task_photos: admin delete" on task_photos;

create policy "task_photos: public write"  on task_photos for insert with check (true);
create policy "task_photos: public update" on task_photos for update using (true) with check (true);
create policy "task_photos: public delete" on task_photos for delete using (true);


-- ===== archive-sql/supabase-rls.sql =====
-- =============================================================
-- Flag Retrieval: Row Level Security (RLS) Policies
-- Run this in the Supabase SQL Editor (once only).
--
-- Model:
--   anon key  → participant operations (read tasks, register team, record scan)
--   auth user → all admin operations (create/update/delete anything)
-- =============================================================

-- ── tasks ────────────────────────────────────────────────────
alter table tasks enable row level security;

create policy "tasks: public read"
  on tasks for select using (true);

create policy "tasks: admin write"
  on tasks for insert with check (auth.role() = 'authenticated');

create policy "tasks: admin update"
  on tasks for update using (auth.role() = 'authenticated');

create policy "tasks: admin delete"
  on tasks for delete using (auth.role() = 'authenticated');

-- ── task_pages ───────────────────────────────────────────────
alter table task_pages enable row level security;

create policy "task_pages: public read"
  on task_pages for select using (true);

create policy "task_pages: admin write"
  on task_pages for insert with check (auth.role() = 'authenticated');

create policy "task_pages: admin update"
  on task_pages for update using (auth.role() = 'authenticated');

create policy "task_pages: admin delete"
  on task_pages for delete using (auth.role() = 'authenticated');

-- ── teams ────────────────────────────────────────────────────
alter table teams enable row level security;

create policy "teams: public read"
  on teams for select using (true);

create policy "teams: public register"
  on teams for insert with check (true);

create policy "teams: admin update"
  on teams for update using (auth.role() = 'authenticated');

create policy "teams: admin delete"
  on teams for delete using (auth.role() = 'authenticated');

-- ── team_members ─────────────────────────────────────────────
alter table team_members enable row level security;

create policy "team_members: public read"
  on team_members for select using (true);

create policy "team_members: public join"
  on team_members for insert with check (true);

create policy "team_members: admin update"
  on team_members for update using (auth.role() = 'authenticated');

create policy "team_members: admin delete"
  on team_members for delete using (auth.role() = 'authenticated');

-- ── team_scans ───────────────────────────────────────────────
alter table team_scans enable row level security;

create policy "team_scans: public read"
  on team_scans for select using (true);

create policy "team_scans: participant record"
  on team_scans for insert with check (true);

-- upsert is INSERT + UPDATE; allow public upsert for scan recording
create policy "team_scans: participant upsert update"
  on team_scans for update using (true) with check (
    -- only allow updating scanned_at; completed/completed_at require admin
    auth.role() = 'authenticated'
    or (completed = false and completed_at is null)
  );

create policy "team_scans: admin delete"
  on team_scans for delete using (auth.role() = 'authenticated');
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]

-- ── task_photos ──────────────────────────────────────────────
alter table task_photos enable row level security;

create policy "task_photos: public read"
  on task_photos for select using (true);

create policy "task_photos: admin write"
  on task_photos for insert with check (auth.role() = 'authenticated');

create policy "task_photos: admin update"
  on task_photos for update using (auth.role() = 'authenticated');

create policy "task_photos: admin delete"
  on task_photos for delete using (auth.role() = 'authenticated');
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]
-- [skipped: deleted game]


-- ===== supabase/migrations/20260415_bingo_tasks_answer_type.sql =====
-- Migration: add answer-input card type to bingo_tasks
-- Run this in the Supabase SQL editor or via `supabase db push`.

-- [column hoisted]

comment on column bingo_tasks.task_type is
  '''standard'' = marshal-verified completion; ''answer'' = auto-complete on correct typed answer';
comment on column bingo_tasks.answer_question is
  'Prompt shown to participants above the letter-box rows (answer cards only)';
comment on column bingo_tasks.answer_text is
  'Newline-separated correct answers; each line becomes one row of letter boxes (answer cards only)';


-- ===== supabase/migrations/20260421_bingo_features.sql =====
-- Observer role on members
-- [column hoisted]

-- Google Maps URL on tasks
-- [column hoisted]

-- Photo submissions for dual-path task completion
-- [table hoisted: bingo_photo_submissions]

-- RLS: public read/insert; admin deletes via service role
ALTER TABLE bingo_photo_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read photo submissions" ON bingo_photo_submissions FOR SELECT USING (true);
CREATE POLICY "public insert photo submissions" ON bingo_photo_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update photo submissions" ON bingo_photo_submissions FOR UPDATE USING (true);


-- ===== supabase/migrations/20260422_bingo_section_game_started.sql =====
-- Add per-section game_started so multiple games can run independently
-- [column hoisted]


-- ===== supabase/migrations/20260427_award_main_and_groups.sql =====
-- Award slides: support a "main" branded opener (HSBC-themed) and a
-- "consolation_group" prize kind that reveals 3 ranks per slide.
-- [column hoisted]

-- [column hoisted]

-- [column hoisted]

-- [column hoisted]

-- [column hoisted]


-- ===== supabase/migrations/20260427_bingo_sections_realtime.sql =====
-- Enable realtime broadcasts for bingo_sections so BingoDashJoin's live
-- subscription on game_started fires the moment the admin toggles Set live / Set locked.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_sections'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_sections';
  end if;
end $$;


-- ===== supabase/migrations/20260428_bingo_photo_submissions_toggle.sql =====
-- Global toggle (in marshal admin) to enable/disable photo submissions
-- across every photo-type card. Default ON so existing behavior is unchanged.
-- [column hoisted]


-- ===== supabase/migrations/20260428_bingo_tasks_maps_label.sql =====
-- Optional friendly label for the maps button on a task
-- [column hoisted]


-- ===== supabase/migrations/20260429_bingo_members_realtime.sql =====
-- Enable realtime broadcasts for bingo_members so the public team-members live
-- view (BingoDashTeamMembers) and any future subscribers receive INSERT/UPDATE/
-- DELETE events the moment a participant joins or leaves a group.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_members'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_members';
  end if;
end $$;


-- ===== supabase/migrations/20260429_bingo_photo_submissions_realtime.sql =====
-- Enable realtime broadcasts for bingo_photo_submissions so BingoDashAdmin's live
-- subscription fires the moment a participant uploads a photo. Without this, admins
-- had to refresh the page to see new submissions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_photo_submissions'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_photo_submissions';
  end if;
end $$;


-- ===== supabase/migrations/20260429_bingo_tasks_photo_type.sql =====
-- Allow 'photo' as a task_type value. Original 20260415 migration only listed
-- ('standard', 'answer'); the admin Photo button has been writing 'photo' and
-- the CHECK constraint was rejecting saves.
ALTER TABLE bingo_tasks
  DROP CONSTRAINT IF EXISTS bingo_tasks_task_type_check;

ALTER TABLE bingo_tasks
  ADD CONSTRAINT bingo_tasks_task_type_check
  CHECK (task_type IN ('standard', 'answer', 'photo'));


-- ===== supabase/migrations/20260429_bingo_time_up_message.sql =====
-- Time-up alarm payload, edited by admin and shown to all players when the
-- game timer ends. Defaults give a sensible message in case admin forgets to
-- set them before the timer runs out.
-- [column hoisted]


-- ===== supabase/migrations/20260610_bingo_board_cards.sql =====
-- ================================================================
-- Bingo Dash: universal cards across boards
--
-- 1) bingo_board_cards: per-board placements (board <-> card junction).
--    A card can now sit on any number of boards - no more cloning a
--    card just to reuse it on another board.
-- 2) Backfill: every card currently on a grid (in_grid = true) gets a
--    placement row on its home board, keeping its existing slot.
-- 3) Cleanup: delete leftover duplicate cards created by the old
--    copy-per-board flow (same title as an older card, not placed on
--    any board, no scans / photo submissions / snake-tile references).
--
-- Run once in the Supabase SQL editor BEFORE deploying the app update.
-- The legacy bingo_tasks.in_grid / sort_order columns are left in place
-- (the old app version keeps working until the new build is deployed).
-- ================================================================

-- [table hoisted: bingo_board_cards]
create index if not exists bingo_board_cards_section_idx on bingo_board_cards (section_id);
create index if not exists bingo_board_cards_task_idx on bingo_board_cards (task_id);

-- RLS: same permissive pattern as the other bingo_* tables.
alter table bingo_board_cards enable row level security;
drop policy if exists "anon read bingo_board_cards"  on bingo_board_cards;
drop policy if exists "anon write bingo_board_cards" on bingo_board_cards;
create policy "anon read bingo_board_cards"  on bingo_board_cards for select using (true);
create policy "anon write bingo_board_cards" on bingo_board_cards for all    using (true) with check (true);
-- [skipped: deleted game]
-- [skipped: deleted game]

-- Tell PostgREST to reload so the new table becomes visible immediately.
notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260610_bingo_board_note.sql =====
-- Per-board facilitator note shown in a box below the bingo board on the
-- player page (e.g. "Collect an item for the Bonsai Project after every
-- 2 completed boxes"). board_note_every drives a live item counter:
-- players see floor(completed / board_note_every) items to collect.
-- Set board_note_every to 0 to hide the counter; empty note hides the box.
-- [column hoisted]


-- ===== supabase/migrations/20260616_bingo_scoreboard_realtime.sql =====
-- Enable realtime broadcasts for the tables the Bingo Dash Scoreboard
-- (BingoDashProjector) and admin live-subscribe to. Without this, the
-- projector's postgres_changes listeners never fire, so the scoreboard only
-- updated on a full page reload — teams submitting tiles did not move the board.
--
-- bingo_scans  → the critical one: a row flips completed=true the moment a team
--                completes/submits a tile, which is what drives points/bingos/tasks.
-- bingo_teams  → new team registrations and admin bonus-point changes.
-- bingo_tasks / bingo_board_cards / bingo_settings → task points, grid membership,
--                and the active board — all subscribed to by the projector.
--
-- The original supabase-migration-bingo-dash.sql created these tables but never
-- added them to the publication. Idempotent: safe to re-run.
do $$
declare
  t text;
begin
  foreach t in array array[
    'bingo_scans',
    'bingo_teams',
    'bingo_tasks',
    'bingo_board_cards',
    'bingo_settings'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ===== supabase/migrations/20260619_bingo_accounts.sql =====
-- ============================================================
-- Bingo Dash — Accounts foundation (Stage 1 of multi-tenant accounts)
-- ============================================================
-- Adds authenticated accounts with an owner/sub + approval model, and
-- ownership columns on the shared card library (bingo_tasks) and private
-- boards (bingo_sections). This migration is ADDITIVE ONLY — it does not
-- change any existing RLS policy, so current anonymous admin/participant
-- access keeps working exactly as before. RLS hardening is a later stage.
--
-- Ownership semantics:
--   owner_id IS NULL      → legacy data, treated as belonging to the main
--                           (owner) account. All existing cards/boards are NULL.
--   owner_id = <auth uid> → created by that account.
-- Cards (bingo_tasks) are a SHARED library: everyone can see them; only the
-- owner of a card (or the main account) may edit it. Boards (bingo_sections)
-- are PRIVATE: each account manages only its own.
-- ============================================================

-- 1. Per-user profile, keyed to Supabase Auth users -----------------------
-- [table hoisted: bingo_accounts]

alter table public.bingo_accounts enable row level security;

-- Helper predicates (SECURITY DEFINER so they can read bingo_accounts without
-- tripping the table's own RLS — avoids infinite recursion in policies).
create or replace function public.is_bingo_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and role = 'owner' and status = 'approved'
  );
$$;

create or replace function public.is_bingo_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and status = 'approved'
  );
$$;

-- RLS for bingo_accounts: you can read your own row; the owner can read and
-- update every row (to approve / reject / promote). Inserts come from the
-- signup trigger below (SECURITY DEFINER), so no INSERT policy is needed.
drop policy if exists "read own or owner-all" on public.bingo_accounts;
create policy "read own or owner-all" on public.bingo_accounts
  for select using (id = auth.uid() or public.is_bingo_owner());

drop policy if exists "owner can update accounts" on public.bingo_accounts;
create policy "owner can update accounts" on public.bingo_accounts
  for update using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- 2. Auto-create a profile when a user signs up --------------------------
-- The designated main account is auto-approved as owner; everyone else lands
-- as a pending sub awaiting the owner's approval. Change the email below (or
-- promote manually with the UPDATE at the bottom) if your main login differs.
create or replace function public.handle_new_bingo_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_email constant text := 'bryanwai.design@gmail.com';
begin
  insert into public.bingo_accounts (id, email, role, status)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(owner_email) then 'owner'    else 'sub'     end,
    case when lower(new.email) = lower(owner_email) then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bingo on auth.users;
create trigger on_auth_user_created_bingo
  after insert on auth.users
  for each row execute function public.handle_new_bingo_user();

-- 3. Ownership columns ---------------------------------------------------
-- Nullable; NULL = main/owner (all existing rows). New rows get the creator's
-- uid (set by the app, and defended by RLS in a later stage).
-- [column hoisted]
-- [column hoisted]

create index if not exists bingo_tasks_owner_idx    on public.bingo_tasks(owner_id);
create index if not exists bingo_sections_owner_idx on public.bingo_sections(owner_id);

-- 4. Realtime for the accounts table (so the owner's approval panel updates
--    live as people sign up). Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bingo_accounts'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_accounts';
  end if;
end $$;

-- ── Manual owner promotion (run once AFTER you have signed up, if your main
--    account email is not the one hard-coded above) ──────────────────────
-- update public.bingo_accounts
--   set role = 'owner', status = 'approved'
--   where lower(email) = lower('your-real-email@example.com');


-- ===== supabase/migrations/20260702_bingo_account_games.sql =====
-- ============================================================
-- Rental accounts, step 1/3: per-account game toggles + active board
-- Run in the Supabase SQL editor BEFORE 20260702_bingo_template_clone.sql.
-- ADDITIVE ONLY — the deployed app keeps working unchanged until the
-- Phase B build ships. Safe to run any time.
-- ============================================================

-- 1. Game permissions + per-account active board pointer.
--    can_bingo defaults true (matches today's implicit behavior for
--    approved subs); can_flag is opt-in per account.
-- [column hoisted]

update public.bingo_accounts set can_bingo = true, can_flag = true where role = 'owner';

-- 2. Per-game access check, used by RLS (Phase C) and mirrored by the UI gate.
create or replace function public.can_use_game(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid()
      and status = 'approved'
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- 3. Per-account active board. A SECURITY DEFINER RPC instead of a
--    self-UPDATE policy on bingo_accounts: WITH CHECK cannot compare old
--    vs new values, so a plain policy would let a sub flip their own
--    status/role while updating active_section_id.
--    The owner's call also updates the global bingo_settings pointer so
--    the anonymous home/registration/projector/sample pages keep working
--    as the owner's front door.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bingo_accounts where id = auth.uid() and status = 'approved'
  ) then
    raise exception 'not an approved account';
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and (s.owner_id = auth.uid() or (s.owner_id is null and public.is_bingo_owner()))
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260702_bingo_template_clone.sql =====
-- ============================================================
-- Rental accounts, step 2/3: template board + deep clone on approval
-- Run AFTER 20260702_bingo_account_games.sql.
-- ADDITIVE ONLY — the clone trigger no-ops until the owner designates a
-- template board, so this is safe to run any time.
--
-- Column lists below were written against the app's schema
-- (src/types/database.ts + the supabase-migration-*.sql files). If the
-- live tables have drifted, the CREATE FUNCTION still succeeds but the
-- first clone call will error naming the missing column — fix there.
-- ============================================================

-- 1. Owner-designated template board (cloned for every newly approved account).
-- [column hoisted]

-- 2. Copy lineage for copy-on-use: which task a task was cloned from.
--    Lets the app reuse an existing copy instead of duplicating again.
-- [column hoisted]
create index if not exists bingo_tasks_cloned_from_idx on public.bingo_tasks(cloned_from);

-- 3. Deep clone: board + placed cards (with pages/photos/links) + grid slots
--    + categories/challenge sections + award config. The clone is fully
--    independent — no row references the template afterwards (cloned_from is
--    lineage metadata only, ON DELETE SET NULL).
create or replace function public.clone_bingo_board(p_template uuid, p_target_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_section uuid;
  r record;
  new_task uuid;
begin
  -- Board shell: fresh slug, marshal password reset, game not started,
  -- timer cleared. Everything else copied.
  insert into bingo_sections
        (name, slug, sort_order, owner_id,
         timer_seconds, timer_end_at, time_up_message, time_up_label, time_up_maps_url,
         marshal_password, photo_submissions_enabled, game_started,
         board_note, board_note_every)
  select name,
         slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
         0, p_target_owner,
         timer_seconds, null, time_up_message, time_up_label, time_up_maps_url,
         '1234', photo_submissions_enabled, false,
         board_note, board_note_every
    from bingo_sections
   where id = p_template
  returning id into new_section;

  if new_section is null then
    raise exception 'template board % not found', p_template;
  end if;

  -- Challenge sections + categories (library grouping), with id remapping.
  create temp table _cs_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from bingo_challenge_sections where game_section_id = p_template
  loop
    with ins as (
      insert into bingo_challenge_sections (game_section_id, name, sort_order)
      values (new_section, r.name, r.sort_order)
      returning id
    )
    insert into _cs_map select r.id, id from ins;
  end loop;

  -- [seed removed]

  -- Cards placed on the template grid: deep copy each task + children,
  -- then place the copy on the same slot.
  for r in
    select bc.slot, t.*
      from bingo_board_cards bc
      join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_template
  loop
    -- [seed removed]

    -- [seed removed]

    -- [seed removed]

    -- [seed removed]

    -- [seed removed]
  end loop;

  -- Award slides config (one row per board, if the template has one).
  insert into bingo_award_configs
        (section_id, total_points, image_url,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline)
  select new_section, total_points, image_url,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline
    from bingo_award_configs
   where section_id = p_template;

  drop table if exists _cs_map;
  return new_section;
end;
$$;

-- 4. Auto-provision on approval: the first time a sub account becomes
--    approved with bingo access and owns no boards yet, clone the template
--    and point their active board at it. No template designated -> no-op.
create or replace function public.handle_bingo_account_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if new.role = 'sub'
     and new.status = 'approved'
     and new.can_bingo
     and (old.status is distinct from 'approved' or old.can_bingo is distinct from new.can_bingo)
     and not exists (select 1 from bingo_sections where owner_id = new.id)
  then
    select template_section_id into tmpl from bingo_settings where id = 'main';
    if tmpl is not null then
      new_board := public.clone_bingo_board(tmpl, new.id);
      update bingo_accounts set active_section_id = new_board where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bingo_account_approved on public.bingo_accounts;
create trigger on_bingo_account_approved
  after update on public.bingo_accounts
  for each row execute function public.handle_bingo_account_approved();

-- 5. Owner-callable manual provisioning (accounts panel button), for
--    accounts approved before a template existed, or to hand out a fresh
--    copy later.
-- p_template is optional: omit it to use the designated default template.
drop function if exists public.admin_clone_template_for(uuid);
create or replace function public.admin_clone_template_for(p_target uuid, p_template uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if not public.is_bingo_owner() then
    raise exception 'owner only';
  end if;
  tmpl := p_template;
  if tmpl is null then
    select template_section_id into tmpl from bingo_settings where id = 'main';
  end if;
  if tmpl is null then
    raise exception 'no template board designated';
  end if;
  new_board := public.clone_bingo_board(tmpl, p_target);
  update bingo_accounts
     set active_section_id = coalesce(active_section_id, new_board)
   where id = p_target;
  return new_board;
end;
$$;

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260703_bingo_settings_authenticated.sql =====
-- ── bingo_settings: authenticated access (pre-C1 interim) ────────────────────
-- The legacy policy allow_all_bingo_settings (supabase-migration-bingo-timer-
-- categories.sql) is TO anon only. Since the admin became login-gated, owner
-- sessions run as `authenticated` and silently match 0 rows on this table —
-- the Accounts page could neither read nor save the template board pointer.
--
-- Additive + safe anytime: authenticated read for everyone, writes only for
-- the owner (is_bingo_owner() from 20260619_bingo_accounts.sql). Anonymous
-- pages keep working through the untouched anon policy. C1
-- (20260703_multitenant_rls.sql) drops all policies on this table dynamically
-- and recreates its final set, so this interim policy disappears with it.

create policy bingo_settings_auth_read on public.bingo_settings
  for select to authenticated using (true);

create policy bingo_settings_owner_write on public.bingo_settings
  for all to authenticated
  using (public.is_bingo_owner())
  with check (public.is_bingo_owner());

notify pgrst, 'reload schema';
-- [skipped: deleted game]
--   \d public.settings   \d public.bingo_challenge_sections
-- ============================================================

-- ── 0. Helper ───────────────────────────────────────────────
-- True when the current session may write a row owned by row_owner:
-- the owner account writes everything; a sub writes only its own rows.
create or replace function public.bingo_can_write(row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner() or row_owner = auth.uid();
$$;

-- ── 1. Drop every existing policy on the tables being hardened ──
-- Legacy root-level supabase-migration-*.sql files created permissive
-- policies under varying names; dropping from pg_policies catches them all.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'bingo_sections', 'bingo_tasks',
        'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
        'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
        'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
        'bingo_settings',
        'tasks', 'task_pages', 'task_photos', 'task_links',
        'teams', 'team_members', 'team_scans',
        'settings'
      )
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Make sure RLS is on everywhere we are about to define policies.
do $$
declare t text;
begin
  foreach t in array array[
    'bingo_sections', 'bingo_tasks',
    'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
    'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
    'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
    'bingo_settings',
    'tasks', 'task_pages', 'task_photos', 'task_links',
    'teams', 'team_members', 'team_scans',
    'settings']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── 2. Class 1 — bingo config roots (have owner_id) ─────────
-- Subs cannot edit/delete house cards -> copy-on-use enforced at DB level.
create policy "read open" on public.bingo_sections for select using (true);
create policy "tenant insert" on public.bingo_sections for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_sections for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_sections for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

create policy "read open" on public.bingo_tasks for select using (true);
create policy "tenant insert" on public.bingo_tasks for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_tasks for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_tasks for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

-- ── 3. Class 2 — bingo child config (ownership via parent) ──
-- bingo_task_pages / bingo_task_photos / bingo_task_links -> bingo_tasks
do $$
declare t text;
begin
  foreach t in array array['bingo_task_pages', 'bingo_task_photos', 'bingo_task_links']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
        with check (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
    $f$, t);
  end loop;
end $$;

-- bingo_board_cards: WITH CHECK deliberately checks only the SECTION's
-- owner — you may place your own copy of any card, but never place
-- anything onto someone else's board.
create policy "read open" on public.bingo_board_cards for select using (true);
create policy "tenant write" on public.bingo_board_cards for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

-- bingo_categories (section_id) / bingo_challenge_sections (game_section_id)
create policy "read open" on public.bingo_categories for select using (true);
create policy "tenant write" on public.bingo_categories for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

create policy "read open" on public.bingo_challenge_sections for select using (true);
create policy "tenant write" on public.bingo_challenge_sections for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)));

-- ── 4. Class 3 — gameplay tables ─────────────────────────────
-- Anonymous players keep full write access (they have no auth.uid()), but
-- the permissive policies are now restricted TO anon. Authenticated
-- sessions only reach their own tenant's rows ("Reset all teams" safety).

-- Bingo Dash gameplay
create policy "read open" on public.bingo_teams for select using (true);
create policy "anon write" on public.bingo_teams for insert to anon with check (true);
create policy "anon update" on public.bingo_teams for update to anon using (true) with check (true);
create policy "anon delete" on public.bingo_teams for delete to anon using (true);
create policy "tenant write" on public.bingo_teams for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

do $$
declare t text;
begin
  foreach t in array array['bingo_members', 'bingo_scans', 'bingo_photo_submissions']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "anon write" on public.%I for insert to anon with check (true)
    $f$, t);
    execute format($f$
      create policy "anon update" on public.%I for update to anon using (true) with check (true)
    $f$, t);
    execute format($f$
      create policy "anon delete" on public.%I for delete to anon using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_teams bt
          join public.bingo_sections s on s.id = bt.section_id
          where bt.id = team_id and public.bingo_can_write(s.owner_id)))
        with check (public.can_use_game('bingo') and exists (
          select 1 from public.bingo_teams bt
          join public.bingo_sections s on s.id = bt.section_id
          where bt.id = team_id and public.bingo_can_write(s.owner_id)))
    $f$, t);
  end loop;
end $$;

-- Flag Retrieval gameplay (teams has owner_id directly; children via team)
create policy "read open" on public.teams for select using (true);
create policy "anon write" on public.teams for insert to anon with check (true);
create policy "anon update" on public.teams for update to anon using (true) with check (true);
create policy "anon delete" on public.teams for delete to anon using (true);
create policy "tenant write" on public.teams for all to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));

do $$
declare t text;
begin
  foreach t in array array['team_members', 'team_scans']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "anon write" on public.%I for insert to anon with check (true)
    $f$, t);
    execute format($f$
      create policy "anon update" on public.%I for update to anon using (true) with check (true)
    $f$, t);
    execute format($f$
      create policy "anon delete" on public.%I for delete to anon using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('flag') and exists (
          select 1 from public.teams tm
          where tm.id = team_id and public.bingo_can_write(tm.owner_id)))
        with check (public.can_use_game('flag') and exists (
          select 1 from public.teams tm
          where tm.id = team_id and public.bingo_can_write(tm.owner_id)))
    $f$, t);
  end loop;
end $$;

-- ── 5. Class 4 — bingo_settings (global pointer, owner-only writes) ──
-- Subs move their active board via the set_active_board() RPC instead.
create policy "read open" on public.bingo_settings for select using (true);
create policy "owner insert" on public.bingo_settings for insert to authenticated
  with check (public.is_bingo_owner());
create policy "owner update" on public.bingo_settings for update to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── 6. Class 5 — Flag Retrieval config ───────────────────────
create policy "read open" on public.tasks for select using (true);
create policy "tenant insert" on public.tasks for insert to authenticated
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.tasks for update to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('flag') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.tasks for delete to authenticated
  using (public.can_use_game('flag') and public.bingo_can_write(owner_id));

do $$
declare t text;
begin
  foreach t in array array['task_pages', 'task_photos', 'task_links']
  loop
    execute format($f$
      create policy "read open" on public.%I for select using (true)
    $f$, t);
    execute format($f$
      create policy "tenant write" on public.%I for all to authenticated
        using (public.can_use_game('flag') and exists (
          select 1 from public.tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
        with check (public.can_use_game('flag') and exists (
          select 1 from public.tasks pt
          where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
    $f$, t);
  end loop;
end $$;

-- settings: DEVIATION from the plan's pure Class 5 — anonymous facilitator
-- pages legitimately write here (briefing-slide sync keys from
-- /instructions/:deckId, ranking order from /projector), so anon writes
-- stay open Class-3 style. Tenant isolation still holds for admin
-- sessions: an authenticated account only reaches its own rows.
create policy "read open" on public.settings for select using (true);
create policy "anon write" on public.settings for insert to anon with check (true);
create policy "anon update" on public.settings for update to anon using (true) with check (true);
create policy "anon delete" on public.settings for delete to anon using (true);
create policy "tenant write" on public.settings for all to authenticated
  using (public.bingo_can_write(owner_id))
  with check (public.bingo_can_write(owner_id));

notify pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK — paste everything below in one go to instantly restore the
-- pre-hardening permissive posture and un-brick a live event.
-- ============================================================
-- do $$
-- declare p record; t text;
-- begin
--   -- drop all policies created above
--   for p in
--     select policyname, tablename from pg_policies
--     where schemaname = 'public'
--       and tablename in (
--         'bingo_sections', 'bingo_tasks',
--         'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
--         'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
--         'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
--         'bingo_settings',
--         'tasks', 'task_pages', 'task_photos', 'task_links',
--         'teams', 'team_members', 'team_scans',
--         'settings')
--   loop
--     execute format('drop policy %I on public.%I', p.policyname, p.tablename);
--   end loop;
--   -- recreate the legacy fully-permissive posture (open read + open write)
--   foreach t in array array[
--     'bingo_sections', 'bingo_tasks',
--     'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links',
--     'bingo_board_cards', 'bingo_categories', 'bingo_challenge_sections',
--     'bingo_teams', 'bingo_members', 'bingo_scans', 'bingo_photo_submissions',
--     'bingo_settings',
--     'tasks', 'task_pages', 'task_photos', 'task_links',
--     'teams', 'team_members', 'team_scans',
--     'settings']
--   loop
--     execute format('create policy "rollback read %s" on public.%I for select using (true)', t, t);
--     execute format('create policy "rollback write %s" on public.%I for all using (true) with check (true)', t, t);
--   end loop;
-- end $$;
-- notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260704_facilitators.sql =====
-- ============================================================
-- Facilitator logins: temporary event helpers working ON a host's data
--
-- A facilitator is a bingo_accounts row with facilitator_host set. They get
-- full admin powers over the HOST's tenant (host = owner -> house data,
-- owner_id NULL; host = sub -> that sub's rows) until access_expires_at.
-- They never own data of their own and never get a template board clone.
--
-- ADDITIVE + safe to run before the app deploy: with no facilitator rows,
-- every rewritten function behaves exactly as before (the extra expiry
-- check is NULL -> passes for all existing accounts).
-- Run in the Supabase SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. Columns ──────────────────────────────────────────────
-- [column hoisted]

-- ── 2. can_use_game: expired accounts lose game access ──────
create or replace function public.can_use_game(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid()
      and status = 'approved'
      and (access_expires_at is null or now() < access_expires_at)
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- ── 3. bingo_can_write: owner passes; else approved + unexpired AND
--       (own rows OR the host tenant's rows when facilitating).
--       The approved/unexpired check matters here (not just in
--       can_use_game) because the `settings` policy uses bingo_can_write
--       alone.
create or replace function public.bingo_can_write(row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner()
    or exists (
      select 1 from public.bingo_accounts a
      where a.id = auth.uid()
        and a.status = 'approved'
        and (a.access_expires_at is null or now() < a.access_expires_at)
        and (
          row_owner = a.id
          or exists (
            select 1 from public.bingo_accounts h
            where h.id = a.facilitator_host
              and ((h.role = 'owner' and row_owner is null)
                or (h.role <> 'owner' and row_owner = h.id))
          )
        )
    );
$$;

-- ── 4. set_active_board: accept facilitators. The board must belong to
--       the caller's WORKING tenant (host tenant when facilitating). Only
--       the caller's own active_section_id moves; the global
--       bingo_settings pointer stays owner-only.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acct record;
  host_role text;
  tenant_owner uuid;  -- effective tenant: NULL = house (owner) data
begin
  select * into acct from bingo_accounts
   where id = auth.uid()
     and status = 'approved'
     and (access_expires_at is null or now() < access_expires_at);
  if not found then
    raise exception 'not an approved account';
  end if;

  if acct.facilitator_host is not null then
    select role into host_role from bingo_accounts where id = acct.facilitator_host;
    if host_role = 'owner' then
      tenant_owner := null;
    else
      tenant_owner := acct.facilitator_host;
    end if;
  elsif acct.role = 'owner' then
    tenant_owner := null;
  else
    tenant_owner := acct.id;
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and ((tenant_owner is null and s.owner_id is null)
        or s.owner_id = tenant_owner)
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

-- ── 5. Approval clone trigger: facilitators never get a template clone —
--       they work on the host's boards, not their own.
create or replace function public.handle_bingo_account_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if new.role = 'sub'
     and new.status = 'approved'
     and new.can_bingo
     and new.facilitator_host is null
     and (old.status is distinct from 'approved' or old.can_bingo is distinct from new.can_bingo)
     and not exists (select 1 from bingo_sections where owner_id = new.id)
  then
    select template_section_id into tmpl from bingo_settings where id = 'main';
    if tmpl is not null then
      new_board := public.clone_bingo_board(tmpl, new.id);
      update bingo_accounts set active_section_id = new_board where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

-- ── 6. Let a facilitator read their host's account row ──────
-- SECURITY DEFINER helper avoids RLS recursion inside the policy.
create or replace function public.my_facilitator_host()
returns uuid language sql stable security definer set search_path = public as $$
  select facilitator_host from public.bingo_accounts where id = auth.uid();
$$;

drop policy if exists "read own or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
create policy "read own, host, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
  );

notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260729_facilitator_sessions.sql =====
-- ============================================================
-- Facilitator SESSIONS — one shareable link + PIN per event
--
-- Problem this solves: a helper who signs up at /bingo-dash/login lands as a
-- pending SUB with their own tenant. Approving them clones the template into
-- THEIR account, so they see an empty board — no teams, no scans, no
-- scoreboard. The only correct path was the easy-to-miss "Make facilitator"
-- button, which also needed the helper to sign up first and the owner to be
-- at a laptop mid-event.
--
-- A facilitator session is a disposable event pass: the host creates one,
-- shares `/bingo-dash/join-crew/<code>` + a 4-digit PIN with the crew, and
-- each helper joins anonymously (no email, no sign-up, no approval) as a
-- facilitator ON THE HOST'S tenant until the pass expires.
--
-- Builds on 20260704_facilitators.sql: this only sets `facilitator_host` /
-- `access_expires_at`, so every RLS rule, expiry check and the no-clone guard
-- written there applies unchanged.
--
-- ADDITIVE: creates one new table, two columns and four functions. No
-- existing policy, function or trigger is modified.
--
-- ⚠️ PREREQUISITE — enable Anonymous sign-ins in the Supabase dashboard:
--    Authentication → Sign In / Providers → Anonymous sign-ins → ON.
--    Without it, /bingo-dash/join-crew returns "Anonymous sign-ins are
--    disabled" and no one can join.
--
-- Run in the SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. The pass ─────────────────────────────────────────────
-- [table hoisted: bingo_facilitator_sessions]

create index if not exists bingo_fac_sessions_host_idx on public.bingo_facilitator_sessions(host_id);

alter table public.bingo_facilitator_sessions enable row level security;

-- The owner sees every pass; a sub host sees only their own. Players and
-- joining facilitators never read this table directly — they go through the
-- SECURITY DEFINER functions below, which never expose the PIN.
drop policy if exists "hosts manage own passes" on public.bingo_facilitator_sessions;
create policy "hosts manage own passes" on public.bingo_facilitator_sessions
  for all
  using (public.is_bingo_owner() or host_id = auth.uid())
  with check (public.is_bingo_owner() or host_id = auth.uid());

-- ── 2. Roster columns on the account ────────────────────────
-- [column hoisted]

create index if not exists bingo_accounts_fac_session_idx
  on public.bingo_accounts(facilitator_session_id);

-- ── 3. Create a pass (server-generated code + PIN) ──────────
create or replace function public.create_facilitator_session(
  p_label    text,
  p_host     uuid,
  p_hours    int default 12,
  p_max_uses int default null
)
returns public.bingo_facilitator_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  -- No 0/O/1/I — these get read aloud and typed on phones.
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  new_code text;
  host_row record;
  result   public.bingo_facilitator_sessions;
  i        int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- Only the owner may issue passes for someone else's tenant.
  if p_host <> auth.uid() and not public.is_bingo_owner() then
    raise exception 'not allowed to create a pass for that host';
  end if;

  select * into host_row from bingo_accounts where id = p_host;
  if not found then
    raise exception 'host account not found';
  end if;
  -- A facilitator has no tenant of its own, so it cannot host a crew.
  if host_row.facilitator_host is not null then
    raise exception 'facilitators cannot host a session';
  end if;

  -- Collision is ~1 in a billion; loop anyway so a clash can never surface
  -- as a unique-violation on event day.
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_facilitator_sessions where code = new_code);
  end loop;

  insert into bingo_facilitator_sessions (code, pin, host_id, label, expires_at, max_uses, created_by)
  values (
    new_code,
    lpad(floor(random() * 10000)::int::text, 4, '0'),
    p_host,
    coalesce(nullif(trim(p_label), ''), 'Event session'),
    now() + make_interval(hours => greatest(1, coalesce(p_hours, 12))),
    case when p_max_uses is null or p_max_uses < 1 then null else p_max_uses end,
    auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

-- ── 4. Public lookup for the join page (never returns the PIN) ──
create or replace function public.facilitator_session_info(p_code text)
returns table (label text, host_label text, expires_at timestamptz, state text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s    record;
  host record;
begin
  select * into s from bingo_facilitator_sessions
   where upper(code) = upper(trim(coalesce(p_code, '')));

  if not found then
    return query select null::text, null::text, null::timestamptz, 'not_found'::text;
    return;
  end if;

  select * into host from bingo_accounts where id = s.host_id;

  return query select
    s.label,
    coalesce(host.display_name, host.email, 'the organiser'),
    s.expires_at,
    case
      when s.revoked                                        then 'revoked'
      when now() >= s.expires_at                            then 'expired'
      when s.max_uses is not null and s.uses >= s.max_uses  then 'full'
      else 'ok'
    end;
end;
$$;

-- ── 5. Redeem: attach the caller as a facilitator on the host ───
create or replace function public.redeem_facilitator_session(
  p_code text,
  p_pin  text,
  p_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  me       record;
  host     record;
  board    uuid;
  is_rejoin boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  select * into s from bingo_facilitator_sessions
   where upper(code) = upper(trim(coalesce(p_code, '')));
  if not found              then raise exception 'INVALID_CODE'; end if;
  if s.revoked              then raise exception 'REVOKED';      end if;
  if now() >= s.expires_at  then raise exception 'EXPIRED';      end if;
  if s.pin <> trim(coalesce(p_pin, '')) then raise exception 'BAD_PIN'; end if;

  select * into me from bingo_accounts where id = auth.uid();
  if not found then raise exception 'NO_ACCOUNT'; end if;

  -- Guard rails: joining a crew must never cost someone their own data.
  -- The owner would lose house access; an approved renter would have their
  -- tenant pointed at someone else's boards.
  if me.role = 'owner' then
    raise exception 'OWNER_CANNOT_JOIN';
  end if;
  if me.facilitator_host is null and me.status = 'approved' then
    raise exception 'ALREADY_TENANT';
  end if;

  -- Re-opening the link on the same device must not burn a second seat.
  is_rejoin := me.facilitator_session_id is not distinct from s.id;
  if s.max_uses is not null and not is_rejoin and s.uses >= s.max_uses then
    raise exception 'FULL';
  end if;

  -- Land the helper on whatever board the host is running right now, so the
  -- first thing they see is the live game rather than an empty picker.
  select * into host from bingo_accounts where id = s.host_id;
  if host.role = 'owner' then
    select active_section_id into board from bingo_settings where id = 'main';
  else
    board := host.active_section_id;
  end if;

  -- Setting facilitator_host in the SAME update keeps the approval trigger's
  -- `new.facilitator_host is null` guard false, so no template board is
  -- cloned for this account. That clone is exactly the bug being fixed.
  update bingo_accounts set
    facilitator_host       = s.host_id,
    facilitator_session_id = s.id,
    access_expires_at      = s.expires_at,
    status                 = 'approved',
    can_bingo              = true,
    can_flag               = true,
    display_name           = coalesce(nullif(trim(p_name), ''), display_name),
    -- Switching to a different host makes any previously selected board
    -- invisible to this account, so reset the pointer rather than leaving
    -- them staring at an empty admin.
    active_section_id      = case
                               when me.facilitator_host is distinct from s.host_id then board
                               else coalesce(active_section_id, board)
                             end
  where id = auth.uid();

  if not is_rejoin then
    update bingo_facilitator_sessions set uses = uses + 1 where id = s.id;
  end if;

  return json_build_object(
    'ok', true,
    'label', s.label,
    'expires_at', s.expires_at,
    'rejoined', is_rejoin
  );
end;
$$;

-- ── 6. End a session: revoke the pass AND cut everyone off now ──
create or replace function public.end_facilitator_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from bingo_facilitator_sessions where id = p_id;
  if not found then raise exception 'session not found'; end if;
  if not (public.is_bingo_owner() or s.host_id = auth.uid()) then
    raise exception 'not your session';
  end if;

  update bingo_facilitator_sessions
     set revoked = true, expires_at = now()
   where id = p_id;

  -- Expire the crew too — revoking the pass alone only stops NEW joins.
  update bingo_accounts
     set access_expires_at = now()
   where facilitator_session_id = p_id;
end;
$$;

-- ── 7. Grants ───────────────────────────────────────────────
-- anon needs the two join-flow functions: the join page reads the session
-- before signing in, and supabase-js may still carry the anon role on the
-- first call after an anonymous sign-in.
grant execute on function public.facilitator_session_info(text)            to anon, authenticated;
grant execute on function public.redeem_facilitator_session(text, text, text) to anon, authenticated;
grant execute on function public.create_facilitator_session(text, uuid, int, int) to authenticated;
grant execute on function public.end_facilitator_session(uuid)             to authenticated;

notify pgrst, 'reload schema';

-- ── Housekeeping (optional, run occasionally) ───────────────
-- Anonymous crew logins accumulate in auth.users. Once a session is long
-- over, its accounts are dead weight — this clears accounts that expired
-- more than 7 days ago. Deleting the auth user cascades to bingo_accounts.
--
-- delete from auth.users u
--  using public.bingo_accounts a
--  where a.id = u.id
--    and a.facilitator_session_id is not null
--    and a.access_expires_at < now() - interval '7 days';

-- ── Rollback ────────────────────────────────────────────────
-- drop function if exists public.end_facilitator_session(uuid);
-- drop function if exists public.redeem_facilitator_session(text, text, text);
-- drop function if exists public.facilitator_session_info(text);
-- drop function if exists public.create_facilitator_session(text, uuid, int, int);
-- alter table public.bingo_accounts drop column if exists facilitator_session_id;
-- alter table public.bingo_accounts drop column if exists display_name;
-- drop table if exists public.bingo_facilitator_sessions;
-- notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260730_trainer_lead_crew_passes.sql =====
-- ============================================================
-- Trainer leads can run their own crew
--
-- 20260729_facilitator_sessions.sql already lets an approved sub host a pass:
-- create_facilitator_session accepts p_host = auth.uid(), the table's RLS is
-- `is_bingo_owner() or host_id = auth.uid()`, and end_facilitator_session
-- accepts the host. What was missing was on the read side — a lead could not
-- see WHO had joined their own pass, because bingo_accounts only ever exposed
-- your own row (plus your host's, for facilitators).
--
-- This migration:
--   1. lets a host read the crew rows attached to them, so /bingo-dash/crew
--      can list the helpers on each pass by name;
--   2. tightens create_facilitator_session to approved accounts only, matching
--      the rule the UI already enforces (a pending signup should not be able
--      to mint passes via the RPC).
--
-- ADDITIVE: one policy replaced with a wider one, one function re-created with
-- a single extra guard. No table, column or trigger changes.
--
-- Run in the SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. A host can read their own crew ───────────────────────
-- `facilitator_host = auth.uid()` reads a column of the candidate row, not a
-- subquery on bingo_accounts, so this adds no RLS recursion.
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, crew, or owner-all" on public.bingo_accounts;
create policy "read own, host, crew, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
    or facilitator_host = auth.uid()
  );

-- ── 2. Only approved accounts may issue passes ──────────────
-- Unchanged from 20260729 apart from the `status = 'approved'` guard.
create or replace function public.create_facilitator_session(
  p_label    text,
  p_host     uuid,
  p_hours    int default 12,
  p_max_uses int default null
)
returns public.bingo_facilitator_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  -- No 0/O/1/I — these get read aloud and typed on phones.
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  new_code text;
  me_row   record;
  host_row record;
  result   public.bingo_facilitator_sessions;
  i        int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- A pending or rejected account has no event to staff. The owner is exempt:
  -- the main account must never be able to lock itself out of its own passes
  -- on the strength of a status column it does not otherwise depend on.
  select * into me_row from bingo_accounts where id = auth.uid();
  if not public.is_bingo_owner() and (not found or me_row.status <> 'approved') then
    raise exception 'account is not approved';
  end if;

  -- Only the owner may issue passes for someone else's tenant.
  if p_host <> auth.uid() and not public.is_bingo_owner() then
    raise exception 'not allowed to create a pass for that host';
  end if;

  select * into host_row from bingo_accounts where id = p_host;
  if not found then
    raise exception 'host account not found';
  end if;
  -- A facilitator has no tenant of its own, so it cannot host a crew.
  if host_row.facilitator_host is not null then
    raise exception 'facilitators cannot host a session';
  end if;

  -- Collision is ~1 in a billion; loop anyway so a clash can never surface
  -- as a unique-violation on event day.
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_facilitator_sessions where code = new_code);
  end loop;

  insert into bingo_facilitator_sessions (code, pin, host_id, label, expires_at, max_uses, created_by)
  values (
    new_code,
    lpad(floor(random() * 10000)::int::text, 4, '0'),
    p_host,
    coalesce(nullif(trim(p_label), ''), 'Event session'),
    now() + make_interval(hours => greatest(1, coalesce(p_hours, 12))),
    case when p_max_uses is null or p_max_uses < 1 then null else p_max_uses end,
    auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.create_facilitator_session(text, uuid, int, int) to authenticated;

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────
-- Re-run section 6 of 20260704_facilitators.sql and section 3 of
-- 20260729_facilitator_sessions.sql to restore the previous policy and
-- function, then:
-- drop policy if exists "read own, host, crew, or owner-all" on public.bingo_accounts;
-- notify pgrst, 'reload schema';


-- ===== supabase/migrations/20260803_bingo_duels.sql =====
-- Contest ("contending") mode for competition cards.
--
-- Two teams meet face to face. The CHALLENGER opens a contest card and scans the
-- DEFENDER's in-app QR code, which pairs them into a duel row. Both phones then
-- unlock the same clue and the same randomised game payload, play it out, and a
-- marshal declares the winner.
--
-- Scoring rules this schema has to support (decided with Bryan):
--   • The cross-off on the board ALWAYS belongs to the challenger — it is their
--     tile and they spent it, win or lose — and it earns the card's normal
--     points exactly like any other tile. Nothing about tile scoring changes.
--   • On top of that, each contest card carries a CONTEST BONUS. Only the winner
--     of the duel banks it. A winning defender therefore scores the bonus
--     without their own board being touched at all.

-- ── 1. Cards can be marked as contest cards ──────────────────────────────────
-- [column hoisted]

COMMENT ON COLUMN bingo_tasks.is_contest IS
  'When true this card is played as a head-to-head duel between two teams instead of a solo task.';
COMMENT ON COLUMN bingo_tasks.contest_game IS
  'Which contest game this card runs. Keys come from src/lib/contestGames.ts.';
COMMENT ON COLUMN bingo_tasks.contest_bonus IS
  'Extra points awarded to the WINNER of the duel, on top of the tile points the challenger gets for crossing off.';

-- ── 2. The duel ledger ───────────────────────────────────────────────────────
-- [table hoisted: bingo_duels]

CREATE INDEX IF NOT EXISTS bingo_duels_defender_idx   ON bingo_duels (defender_team_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_challenger_idx ON bingo_duels (challenger_team_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_section_idx    ON bingo_duels (section_id, status);
CREATE INDEX IF NOT EXISTS bingo_duels_winner_idx     ON bingo_duels (winner_team_id);

-- ── 3. RLS — mirrors the other gameplay tables ───────────────────────────────
-- Players are anonymous and need full write access; authenticated sessions are
-- confined to their own tenant so "reset all teams" can never reach across.
ALTER TABLE bingo_duels ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'bingo_duels'
  LOOP
    EXECUTE format('drop policy %I on public.bingo_duels', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "read open"   ON public.bingo_duels FOR SELECT USING (true);
CREATE POLICY "anon write"  ON public.bingo_duels FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update" ON public.bingo_duels FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete" ON public.bingo_duels FOR DELETE TO anon USING (true);
CREATE POLICY "tenant write" ON public.bingo_duels FOR ALL TO authenticated
  USING (public.can_use_game('bingo') AND EXISTS (
    SELECT 1 FROM public.bingo_sections s
    WHERE s.id = section_id AND public.bingo_can_write(s.owner_id)))
  WITH CHECK (public.can_use_game('bingo') AND EXISTS (
    SELECT 1 FROM public.bingo_sections s
    WHERE s.id = section_id AND public.bingo_can_write(s.owner_id)));

-- ── 4. Realtime — both phones and the scoreboard live-follow duels ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bingo_duels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bingo_duels;
  END IF;
END $$;


-- ===== supabase/migrations/20260803_bingo_tile_display.sql =====
-- Per-board tile display mode for the 5×5 bingo board.
--   'icon'  — one crisp category icon per tile (default; nothing to squint at)
--   'words' — the CATEGORY in readable caps plus a shortened title
-- Players complained the full title crammed into a ~70px tile was unreadable,
-- so the facilitator now picks per board in the Bingo Dash admin.
-- [column hoisted]

ALTER TABLE bingo_sections
  DROP CONSTRAINT IF EXISTS bingo_sections_tile_display_check;

ALTER TABLE bingo_sections
  ADD CONSTRAINT bingo_sections_tile_display_check
  CHECK (tile_display IN ('icon', 'words'));
-- [skipped: deleted game]

comment on column public.bingo_scans.words is
  'Result slots for AI Team Building cards — the drawn/typed words for this team on this card. Empty for every other card type.';


-- ===== supabase/migrations/20260813_bingo_bonus_breakdown.sql =====
-- Itemised bonus points per team.
-- Each entry is { "label": string, "points": number }; the team's bonus_points
-- column stays the authoritative total (sum of the entries) so the projector,
-- award slides and scoreboard keep reading a single number.
-- [column hoisted]


-- ===== supabase/coop-games/20261103_coop_sessions.sql =====
-- COPY. The source is supabase/coop-games/20261103_coop_sessions.sql: change that
-- file first, then repeat the change here (nothing syncs them).
-- Cooperative game sessions (PRD-004 / ADR-004).
-- Tables have RLS on and NO policies: anon/authenticated cannot read or write
-- them directly. Every access goes through the security definer RPCs below,
-- which take the caller's bingo_members.id and read team and role from that
-- row, never from the client.

create table if not exists public.coop_sessions (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null unique references public.bingo_scans(id) on delete cascade,
  team_id      uuid not null references public.bingo_teams(id) on delete cascade,
  game_key     text not null,
  status       text not null default 'lobby' check (status in ('lobby','playing','completed')),
  state        jsonb not null default '{}'::jsonb,
  version      int  not null default 0,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.coop_session_members (
  session_id uuid not null references public.coop_sessions(id) on delete cascade,
  member_id  uuid not null references public.bingo_members(id) on delete cascade,
  role       text not null check (role in ('player','observer')),
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (session_id, member_id)
);
create unique index if not exists coop_session_members_one_player
  on public.coop_session_members(session_id) where role = 'player';

alter table public.coop_sessions enable row level security;
alter table public.coop_session_members enable row level security;

-- Snapshot returned by every RPC. Internal: callers are checked before it runs.
create or replace function public.coop_snapshot(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_id', s.id, 'scan_id', s.scan_id, 'game_key', s.game_key,
    'status', s.status, 'state', s.state, 'version', s.version,
    'completed_at', s.completed_at,
    'members', coalesce((
      select json_agg(json_build_object('member_id', m.id, 'name', m.name, 'role', sm.role)
                      order by sm.joined_at)
      from coop_session_members sm join bingo_members m on m.id = sm.member_id
      where sm.session_id = s.id), '[]'::json))
  from coop_sessions s where s.id = p_session;
$$;
revoke all on function public.coop_snapshot(uuid) from public, anon, authenticated;

-- Create-or-join. One session per scan (team + card + box) via unique(scan_id).
create or replace function public.coop_open(p_member uuid, p_scan uuid, p_game_key text)
returns json language plpgsql security definer set search_path = public as $$
declare
  m   bingo_members%rowtype;
  sc  bingo_scans%rowtype;
  s   coop_sessions%rowtype;
  cur uuid;
  n   int;
begin
  select * into m  from bingo_members where id = p_member;
  select * into sc from bingo_scans   where id = p_scan;
  if m.id is null or sc.id is null or m.team_id <> sc.team_id then
    raise exception 'NOT_ON_TEAM';
  end if;

  insert into coop_sessions (scan_id, team_id, game_key)
  values (p_scan, sc.team_id, p_game_key)
  on conflict (scan_id) do nothing;

  select * into s from coop_sessions where scan_id = p_scan for update;

  -- Already in: refresh and return (reconnect).
  if exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
    return public.coop_snapshot(s.id);
  end if;

  if m.role = 'player' then
    select member_id into cur from coop_session_members
      where session_id = s.id and role = 'player';
    if cur is not null then
      if exists (select 1 from coop_session_members
                 where session_id = s.id and member_id = cur
                   and last_seen > now() - interval '120 seconds') then
        raise exception 'PLAYER_TAKEN';
      end if;
      -- stale player (over 120 s): the newcomer takes over, state is kept
      delete from coop_session_members where session_id = s.id and member_id = cur;
    end if;
  else
    select count(*) into n from coop_session_members where session_id = s.id and role = 'observer';
    if n >= 9 then raise exception 'OBSERVERS_FULL'; end if;
  end if;

  insert into coop_session_members (session_id, member_id, role) values (s.id, m.id, m.role);
  return public.coop_snapshot(s.id);
end $$;

-- Card page check: does this team already have a session for this scan?
-- Returns the status ('lobby'|'playing'|'completed') or null. Never returns state.
create or replace function public.coop_peek(p_member uuid, p_scan uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.status from coop_sessions s
    join bingo_members m on m.id = p_member and m.team_id = s.team_id
   where s.scan_id = p_scan;
$$;
grant execute on function public.coop_peek(uuid, uuid) to anon, authenticated;

-- The only read path. Touches last_seen.
create or replace function public.coop_get(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session;
  if m.id is null then raise exception 'NOT_ON_TEAM'; end if;
  -- session gone (an admin reset it): null, so open clients drop back to Play
  if s.id is null then return null; end if;
  if m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  -- on the team but no longer in the session (a newer player took the seat)
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_IN_SESSION';
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return public.coop_snapshot(s.id);
end $$;

create or replace function public.coop_start(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype; n_players int; n_obs int;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_ON_TEAM';
  end if;
  -- double tap or two devices: already started, just return it
  if s.status <> 'lobby' then return public.coop_snapshot(s.id); end if;
  select count(*) filter (where role = 'player'), count(*) filter (where role = 'observer')
    into n_players, n_obs from coop_session_members where session_id = s.id;
  if n_players <> 1 or n_obs < 1 or n_obs > 9 then raise exception 'LOBBY_INCOMPLETE'; end if;
  update coop_sessions set status = 'playing', started_at = now(), version = version + 1 where id = s.id;
  return public.coop_snapshot(s.id);
end $$;

-- Player-only write. Role comes from the member row. first_completion is true
-- exactly once. No timeout check: the bonus timer never ends a game.
create or replace function public.coop_move(
  p_member uuid, p_session uuid, p_base_version int, p_state jsonb, p_solved boolean
) returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members
                  where session_id = s.id and member_id = m.id and role = 'player') then
    raise exception 'NOT_PLAYER';
  end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if p_base_version <> s.version then raise exception 'STALE'; end if;
  if length(p_state::text) > 20000 then raise exception 'STATE_TOO_BIG'; end if;

  if p_solved then
    -- same transaction: the session and the card complete together, once
    -- (the row lock above and the status check make this the only solve).
    update coop_sessions set state = p_state, version = version + 1,
      status = 'completed', completed_at = now() where id = s.id;
    update bingo_scans set completed = true, completed_at = now()
     where id = s.scan_id and not completed;
  else
    update coop_sessions set state = p_state, version = version + 1 where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', p_solved);
end $$;

create or replace function public.coop_leave(p_member uuid, p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from coop_session_members sm
   using bingo_members m, coop_sessions s
   where sm.session_id = p_session and sm.member_id = p_member
     and m.id = p_member and s.id = p_session and m.team_id = s.team_id;
end $$;

-- Admin only (signed-in section writer): clears the session and undoes the
-- card completion in one transaction.
create or replace function public.coop_reset(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s coop_sessions%rowtype; own uuid;
begin
  select * into s from coop_sessions where id = p_session for update;
  if s.id is null then return; end if;
  select sec.owner_id into own
    from bingo_teams t join bingo_sections sec on sec.id = t.section_id
   where t.id = s.team_id;
  if not public.bingo_can_write(own) then raise exception 'NOT_ADMIN'; end if;
  update bingo_scans set completed = false, completed_at = null where id = s.scan_id;
  delete from coop_sessions where id = s.id;
end $$;

-- Admin entry point (AC-12): replay every game of one team. Used by the admin
-- team menu ("Reset games"). Each session goes through coop_reset, so the
-- same admin check applies. Returns how many sessions were cleared.
create or replace function public.coop_reset_team(p_team uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r uuid; n int := 0;
begin
  for r in select id from coop_sessions where team_id = p_team loop
    perform public.coop_reset(r); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.coop_reset_team(uuid) from public, anon;
grant execute on function public.coop_reset_team(uuid) to authenticated;

grant execute on function public.coop_open(uuid, uuid, text)                to anon, authenticated;
grant execute on function public.coop_get(uuid, uuid)                       to anon, authenticated;
grant execute on function public.coop_start(uuid, uuid)                     to anon, authenticated;
grant execute on function public.coop_move(uuid, uuid, int, jsonb, boolean) to anon, authenticated;
grant execute on function public.coop_leave(uuid, uuid)                     to anon, authenticated;
revoke all on function public.coop_reset(uuid) from public, anon;
grant execute on function public.coop_reset(uuid) to authenticated;


-- ===== supabase/coop-games/20261104_coop_two_players.sql =====
-- COPY. The source is supabase/coop-games/20261104_coop_two_players.sql: change that
-- file first, then repeat the change here (nothing syncs them).
-- Icon Matching with two players (PRD-007). Run AFTER 20261103_coop_sessions.sql.
-- Safe to run twice. Do not edit the first migration: this file changes what it made.
--
-- * Icon Matching ('icon-matching') takes 2 players; every other game keeps 1.
--   Each player gets a fixed slot (0 or 1) in coop_session_members, chosen by the
--   server when they join. A unique index on (session, slot) replaces the old
--   "one player per session" index.
-- * Players pick through coop_pick: the server reads the caller's slot from the member
--   row, locks the session row and merges the pick into the state, so two picks at the
--   same moment never clash on a version. coop_move is closed for icon-matching.
-- * coop_hide ends the viewing period after a miss (idempotent, either player may call it).
-- * coop_start needs 2 players for icon-matching.
-- A section's max_team_players defaults to 1: the team needs a section that allows 2.

alter table public.coop_session_members add column if not exists slot smallint;
update public.coop_session_members set slot = 0 where role = 'player' and slot is null;
alter table public.coop_session_members drop constraint if exists coop_session_members_slot_chk;
alter table public.coop_session_members
  add constraint coop_session_members_slot_chk check (slot is null or slot in (0, 1));
drop index if exists public.coop_session_members_one_player;
create unique index if not exists coop_session_members_slot_uq
  on public.coop_session_members(session_id, slot) where slot is not null;

-- Same snapshot, members now carry their slot.
create or replace function public.coop_snapshot(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'session_id', s.id, 'scan_id', s.scan_id, 'game_key', s.game_key,
    'status', s.status, 'state', s.state, 'version', s.version,
    'completed_at', s.completed_at,
    'members', coalesce((
      select json_agg(json_build_object('member_id', m.id, 'name', m.name, 'role', sm.role, 'slot', sm.slot)
                      order by sm.joined_at)
      from coop_session_members sm join bingo_members m on m.id = sm.member_id
      where sm.session_id = s.id), '[]'::json))
  from coop_sessions s where s.id = p_session;
$$;
revoke all on function public.coop_snapshot(uuid) from public, anon, authenticated;

create or replace function public.coop_open(p_member uuid, p_scan uuid, p_game_key text)
returns json language plpgsql security definer set search_path = public as $$
declare
  m    bingo_members%rowtype;
  sc   bingo_scans%rowtype;
  s    coop_sessions%rowtype;
  cur  uuid;
  n    int;
  maxp int;
  sl   smallint;
begin
  select * into m  from bingo_members where id = p_member;
  select * into sc from bingo_scans   where id = p_scan;
  if m.id is null or sc.id is null or m.team_id <> sc.team_id then
    raise exception 'NOT_ON_TEAM';
  end if;

  insert into coop_sessions (scan_id, team_id, game_key)
  values (p_scan, sc.team_id, p_game_key)
  on conflict (scan_id) do nothing;

  select * into s from coop_sessions where scan_id = p_scan for update;

  if exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
    return public.coop_snapshot(s.id);
  end if;

  if m.role = 'player' then
    maxp := case when s.game_key = 'icon-matching' then 2 else 1 end;
    select count(*) into n from coop_session_members where session_id = s.id and role = 'player';
    if n >= maxp then
      -- full: only a player silent for over 120 s can be replaced; the newcomer takes the slot and the state stays
      select member_id, slot into cur, sl from coop_session_members
       where session_id = s.id and role = 'player' and last_seen <= now() - interval '120 seconds'
       order by last_seen limit 1;
      if cur is null then raise exception 'PLAYER_TAKEN'; end if;
      delete from coop_session_members where session_id = s.id and member_id = cur;
    else
      select min(x)::smallint into sl from generate_series(0, maxp - 1) x
       where not exists (select 1 from coop_session_members where session_id = s.id and slot = x);
    end if;
    insert into coop_session_members (session_id, member_id, role, slot) values (s.id, m.id, 'player', sl);
  else
    select count(*) into n from coop_session_members where session_id = s.id and role = 'observer';
    if n >= 9 then raise exception 'OBSERVERS_FULL'; end if;
    insert into coop_session_members (session_id, member_id, role) values (s.id, m.id, 'observer');
  end if;
  return public.coop_snapshot(s.id);
end $$;

create or replace function public.coop_start(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype; n_players int; n_obs int; need int;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members where session_id = s.id and member_id = m.id) then
    raise exception 'NOT_ON_TEAM';
  end if;
  if s.status <> 'lobby' then return public.coop_snapshot(s.id); end if;
  need := case when s.game_key = 'icon-matching' then 2 else 1 end;
  select count(*) filter (where role = 'player'), count(*) filter (where role = 'observer')
    into n_players, n_obs from coop_session_members where session_id = s.id;
  if n_players <> need or n_obs < 1 or n_obs > 9 then raise exception 'LOBBY_INCOMPLETE'; end if;
  update coop_sessions set status = 'playing', started_at = now(), version = version + 1 where id = s.id;
  return public.coop_snapshot(s.id);
end $$;

-- Whole-state write, unchanged except: closed for icon-matching (use coop_pick), so a
-- player cannot write the other player's pick or the board.
create or replace function public.coop_move(
  p_member uuid, p_session uuid, p_base_version int, p_state jsonb, p_solved boolean
) returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members
                  where session_id = s.id and member_id = m.id and role = 'player') then
    raise exception 'NOT_PLAYER';
  end if;
  if s.game_key = 'icon-matching' then raise exception 'USE_PICK'; end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if p_base_version <> s.version then raise exception 'STALE'; end if;
  if length(p_state::text) > 20000 then raise exception 'STATE_TOO_BIG'; end if;

  if p_solved then
    update coop_sessions set state = p_state, version = version + 1,
      status = 'completed', completed_at = now() where id = s.id;
    update bingo_scans set completed = true, completed_at = now()
     where id = s.scan_id and not completed;
  else
    update coop_sessions set state = p_state, version = version + 1 where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', p_solved);
end $$;

-- One player's pick for the turn (Icon Matching). No base version: the session row lock
-- orders simultaneous picks and each one is merged into the current state.
-- p_init is the shuffled board from the client, used only while the session has no state yet.
create or replace function public.coop_pick(p_member uuid, p_session uuid, p_index int, p_init jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  m bingo_members%rowtype; s coop_sessions%rowtype;
  sl smallint; st jsonb; n int; picks jsonb; mine text; other text; a int; b int;
  matched jsonb; solved boolean := false;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  -- the slot comes from the member row, never from the caller
  select slot into sl from coop_session_members
   where session_id = s.id and member_id = m.id and role = 'player';
  if sl is null then raise exception 'NOT_PLAYER'; end if;
  if s.game_key <> 'icon-matching' then raise exception 'NOT_PLAYING'; end if;
  if s.status = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;
  if s.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;

  st := s.state;
  if st is null or st = '{}'::jsonb then
    if p_init is null or jsonb_typeof(p_init -> 'cards') <> 'array' or length(p_init::text) > 20000
       or jsonb_array_length(p_init -> 'cards') < 2 or jsonb_array_length(p_init -> 'cards') % 2 <> 0 then
      raise exception 'STATE_TOO_BIG';
    end if;
    st := jsonb_build_object('v', 1, 'cols', p_init -> 'cols', 'cards', p_init -> 'cards',
      'flipped', '[]'::jsonb, 'matched', '[]'::jsonb, 'last', 'null'::jsonb, 'picks', '{}'::jsonb);
  end if;

  n := jsonb_array_length(st -> 'cards');
  if p_index is null or p_index < 0 or p_index >= n then raise exception 'PICK_LOCKED'; end if;
  if jsonb_array_length(st -> 'flipped') >= 2 or (st -> 'matched') @> to_jsonb(p_index) then
    raise exception 'PICK_LOCKED';
  end if;
  picks := coalesce(st -> 'picks', '{}'::jsonb);
  mine := sl::text; other := (1 - sl)::text;
  if picks ? mine then raise exception 'PICK_LOCKED'; end if;
  if picks ? other and (picks ->> other)::int = p_index then raise exception 'PICK_TAKEN'; end if;
  picks := picks || jsonb_build_object(mine, p_index);

  if picks ? '0' and picks ? '1' then
    a := (picks ->> '0')::int; b := (picks ->> '1')::int;
    if (st -> 'cards' -> a) = (st -> 'cards' -> b) then
      matched := (st -> 'matched') || jsonb_build_array(a, b);
      st := st || jsonb_build_object('matched', matched, 'flipped', '[]'::jsonb, 'picks', '{}'::jsonb, 'last', 'match');
      solved := jsonb_array_length(matched) = n;
    else
      st := st || jsonb_build_object('flipped', jsonb_build_array(a, b), 'picks', '{}'::jsonb, 'last', 'miss');
    end if;
  else
    st := st || jsonb_build_object('picks', picks, 'last', 'null'::jsonb);
  end if;

  if solved then
    -- same transaction: the session and the card complete together, once
    update coop_sessions set state = st, version = version + 1,
      status = 'completed', completed_at = now() where id = s.id;
    update bingo_scans set completed = true, completed_at = now()
     where id = s.scan_id and not completed;
  else
    update coop_sessions set state = st, version = version + 1 where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', solved);
end $$;

-- End of the viewing period after a miss. Either player may call it; with nothing to hide it changes nothing.
create or replace function public.coop_hide(p_member uuid, p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m bingo_members%rowtype; s coop_sessions%rowtype;
begin
  select * into m from bingo_members where id = p_member;
  select * into s from coop_sessions where id = p_session for update;
  if m.id is null or s.id is null or m.team_id <> s.team_id then raise exception 'NOT_ON_TEAM'; end if;
  if not exists (select 1 from coop_session_members
                  where session_id = s.id and member_id = m.id and role = 'player') then
    raise exception 'NOT_PLAYER';
  end if;
  if s.game_key = 'icon-matching' and s.status = 'playing' and s.state ? 'flipped'
     and jsonb_array_length(s.state -> 'flipped') = 2 then
    update coop_sessions set version = version + 1,
      state = s.state || jsonb_build_object('flipped', '[]'::jsonb, 'picks', '{}'::jsonb, 'last', 'null'::jsonb)
     where id = s.id;
  end if;
  update coop_session_members set last_seen = now() where session_id = s.id and member_id = m.id;
  return json_build_object('snapshot', public.coop_snapshot(s.id), 'first_completion', false);
end $$;

grant execute on function public.coop_open(uuid, uuid, text)                to anon, authenticated;
grant execute on function public.coop_start(uuid, uuid)                     to anon, authenticated;
grant execute on function public.coop_move(uuid, uuid, int, jsonb, boolean) to anon, authenticated;
grant execute on function public.coop_pick(uuid, uuid, int, jsonb)          to anon, authenticated;
grant execute on function public.coop_hide(uuid, uuid)                      to anon, authenticated;

-- ===== supabase/prize-card/20261117_prize_card.sql =====
-- PRD-008 / ADR-008: the prize card ("?"). NOT RUN against any database yet.
--
-- A prize card is a normal bingo_tasks row flagged is_prize, placed on a
-- RESERVED slot 200..209 of bingo_board_cards (never a grid tile, never scored).
-- The first team to reach the card's threshold of completed grid cards can claim
-- it; one claim per placement (= per board). The reveal text and Maps link live
-- in their own table, because bingo_tasks is readable by every player.
--
-- Also re-run these edited files so clone, sync, fork and library push carry
-- bingo_prize_secrets (each gained one array entry / one insert):
--   accounts-tenancy/20261112_clone_board_exact.sql
--   accounts-tenancy/20261116_sync_board_from_source.sql
--   accounts-tenancy/functions.sql   (clone_template... and import_library_pack)
--   core-tables/20261008_board_card_fork.sql
--   core-tables/20261028_push_board_copy_to_library.sql
-- Reset Game needs no change: it deletes the board's teams and claims cascade.

-- 1. Card columns (public: the strip shows "n / threshold") -----------------
alter table public.bingo_tasks
  add column if not exists is_prize boolean not null default false,
  add column if not exists prize_threshold int not null default 20;
alter table public.bingo_tasks drop constraint if exists bingo_tasks_prize_threshold_check;
alter table public.bingo_tasks add constraint bingo_tasks_prize_threshold_check check (prize_threshold >= 1);

alter table public.bingo_library_cards
  add column if not exists is_prize boolean not null default false,
  add column if not exists prize_threshold int not null default 20;
alter table public.bingo_library_cards drop constraint if exists bingo_library_cards_prize_threshold_check;
alter table public.bingo_library_cards add constraint bingo_library_cards_prize_threshold_check check (prize_threshold >= 1);

-- import_library_pack: a pack can carry the flag and threshold (not the secret text).
create or replace function public.import_library_pack(p_pack uuid, p_section uuid)
returns json language plpgsql security definer set search_path = public as $$
declare sec record; c record; n int := 0; skipped int := 0;
begin
  select * into sec from bingo_sections where id = p_section;
  if not found then raise exception 'BOARD_NOT_FOUND'; end if;
  if not (public.is_bingo_owner() or public.bingo_can_write(sec.owner_id)) then
    raise exception 'NOT_YOUR_BOARD';
  end if;

  for c in select * from bingo_library_cards where pack_id = p_pack order by sort_order
  loop
    if exists (select 1 from bingo_tasks t
               where t.section_id = p_section and lower(t.title) = lower(c.title)) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into bingo_tasks (section_id, owner_id, title, color, hex_code, category,
                             points, sort_order, in_grid, task_type,
                             is_contest, contest_bonus, contest_game,
                             is_prize, prize_threshold)
    values (p_section, sec.owner_id, c.title, c.color, c.hex_code, c.category,
            c.points, c.sort_order, false, c.task_type,
            c.is_contest, c.contest_bonus, c.contest_game,
            coalesce(c.is_prize, false), coalesce(c.prize_threshold, 20));
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'created', n, 'skipped', skipped);
end; $$;

-- 2. Reveal text: players have no table access, only get_prize_reveal ------
create table if not exists public.bingo_prize_secrets (
  task_id       uuid primary key references public.bingo_tasks(id) on delete cascade,
  message       text,
  marshal_name  text,
  location_text text,
  maps_url      text,
  maps_label    text,
  updated_at    timestamptz not null default now()
);
alter table public.bingo_prize_secrets enable row level security;
drop policy if exists "tenant all" on public.bingo_prize_secrets;
create policy "tenant all" on public.bingo_prize_secrets for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

-- 3. Reserved placement slots 200..209 ---------------------------------------
alter table public.bingo_board_cards drop constraint if exists bingo_board_cards_slot_check;
alter table public.bingo_board_cards add constraint bingo_board_cards_slot_check check (slot >= 0 and slot < 210);

-- 4. Claims: one per placement; the unique index is the one-winner guard -----
create table if not exists public.bingo_prize_claims (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references public.bingo_sections(id) on delete cascade,
  board_card_id uuid not null unique references public.bingo_board_cards(id) on delete cascade,
  team_id       uuid not null references public.bingo_teams(id) on delete cascade,
  team_name     text not null,
  claimed_at    timestamptz not null default now()
);
create index if not exists bingo_prize_claims_section_idx on public.bingo_prize_claims(section_id);
alter table public.bingo_prize_claims enable row level security;
-- The winner is public by design. No insert/update policy: claim_prize is the only way in.
drop policy if exists "read open" on public.bingo_prize_claims;
create policy "read open" on public.bingo_prize_claims for select using (true);
-- Reset claim (admin).
drop policy if exists "tenant delete" on public.bingo_prize_claims;
create policy "tenant delete" on public.bingo_prize_claims for delete to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));
alter table public.bingo_prize_claims replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.bingo_prize_claims;
exception when duplicate_object then null; end $$;

-- 5. RPCs: the caller is bingo_members.id; team and role come from that row ---
create or replace function public.claim_prize(p_member uuid, p_board_card uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  m  bingo_members%rowtype;
  tm bingo_teams%rowtype;
  bc bingo_board_cards%rowtype;
  t  bingo_tasks%rowtype;
  n  int;
  v_id uuid;
  v_winner text;
  v_team uuid;
begin
  select * into m  from bingo_members where id = p_member;
  select * into bc from bingo_board_cards where id = p_board_card;
  if m.id is null or bc.id is null then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;
  select * into tm from bingo_teams where id = m.team_id;
  select * into t  from bingo_tasks where id = bc.task_id;
  -- an observer, a team of another board, or a card that is not a prize: refused, nothing written
  if tm.id is null or tm.section_id <> bc.section_id or m.role <> 'player' or not coalesce(t.is_prize, false) then
    return json_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  -- Re-count on the server (the client number is display only). Same predicate
  -- as the scoreboard: a completed scan of the box, or (legacy scan without a
  -- box) of its card. Pending, submitted and awaiting-approval scans have
  -- completed = false; prize placements (slot >= 200) are never counted.
  select count(*) into n
    from bingo_board_cards g
   where g.section_id = bc.section_id and g.slot < 200
     and exists (select 1 from bingo_scans sc
                  where sc.team_id = tm.id and sc.completed
                    and (sc.board_card_id = g.id or (sc.board_card_id is null and sc.task_id = g.task_id)));
  if n < t.prize_threshold then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;

  insert into bingo_prize_claims (section_id, board_card_id, team_id, team_name)
  values (bc.section_id, bc.id, tm.id, tm.name)
  on conflict (board_card_id) do nothing
  returning id into v_id;
  if v_id is null then
    select team_id, team_name into v_team, v_winner from bingo_prize_claims where board_card_id = bc.id;
    -- the holding team tapping CLAIM again is not "too late": it already has it
    if v_team = tm.id then return json_build_object('ok', true); end if;
    return json_build_object('ok', false, 'reason', 'taken', 'winner', v_winner);
  end if;
  return json_build_object('ok', true);
end $$;

-- The secret text, only for the team that holds the claim (observers included),
-- at any time, also after the event has ended. Null for everyone else.
create or replace function public.get_prize_reveal(p_member uuid, p_board_card uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
           'title', t.title, 'message', k.message, 'marshal_name', k.marshal_name,
           'location_text', k.location_text, 'maps_url', k.maps_url, 'maps_label', k.maps_label,
           'task_id', t.id, 'team_name', c.team_name, 'claimed_at', c.claimed_at)
    from bingo_members m
    join bingo_prize_claims c on c.team_id = m.team_id and c.board_card_id = p_board_card
    join bingo_board_cards bc on bc.id = c.board_card_id
    join bingo_tasks t on t.id = bc.task_id
    left join bingo_prize_secrets k on k.task_id = t.id
   where m.id = p_member;
$$;

grant execute on function public.claim_prize(uuid, uuid) to anon, authenticated;
grant execute on function public.get_prize_reveal(uuid, uuid) to anon, authenticated;
