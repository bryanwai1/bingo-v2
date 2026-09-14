-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.bingo_award_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL UNIQUE,
  total_points integer NOT NULL DEFAULT 0,
  image_url text,
  consolation_count integer NOT NULL DEFAULT 3,
  third_count integer NOT NULL DEFAULT 1,
  second_count integer NOT NULL DEFAULT 1,
  first_count integer NOT NULL DEFAULT 1,
  slide_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  slide_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  consolation_group_count integer NOT NULL DEFAULT 0,
  holding_title text,
  main_title text,
  main_subtitle text,
  main_tagline text,
  CONSTRAINT bingo_award_configs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_board_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  task_id uuid NOT NULL,
  slot integer NOT NULL DEFAULT 0 CHECK (slot >= 0 AND slot < 150),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_board_cards_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  color text NOT NULL DEFAULT 'Blue'::text,
  hex_code text NOT NULL DEFAULT '#3b82f6'::text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  in_grid boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0,
  section_id uuid,
  category text NOT NULL DEFAULT ''::text,
  require_marshal boolean NOT NULL DEFAULT true,
  task_type text NOT NULL DEFAULT 'standard'::text CHECK (task_type = ANY (ARRAY['standard'::text, 'answer'::text, 'photo'::text])),
  answer_question text,
  answer_text text,
  maps_url text,
  maps_label text,
  owner_id uuid,
  cloned_from uuid,
  is_contest boolean NOT NULL DEFAULT false,
  contest_game text NOT NULL DEFAULT 'speed-edit'::text,
  contest_bonus integer NOT NULL DEFAULT 100,
  is_bundle boolean NOT NULL DEFAULT false,
  led text CHECK (led IS NULL OR (led = ANY (ARRAY['teal'::text, 'amber'::text, 'violet'::text, 'lime'::text, 'rose'::text, 'cyan'::text]))),
  CONSTRAINT bingo_tasks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_task_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  page_order integer NOT NULL DEFAULT 0,
  media_url text,
  media_type text CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text])),
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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_task_pages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_task_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  photo_url text NOT NULL,
  photo_order integer NOT NULL DEFAULT 0,
  position_x numeric NOT NULL DEFAULT 50,
  position_y numeric NOT NULL DEFAULT 50,
  caption text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_task_photos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  password text NOT NULL DEFAULT ''::text,
  section_id uuid NOT NULL,
  bonus_points integer NOT NULL DEFAULT 0,
  photo_url text,
  bonus_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT bingo_teams_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_scans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  task_id uuid NOT NULL,
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  words ARRAY DEFAULT '{}'::text[],
  submitted_by uuid,
  submitted_at timestamp with time zone,
  approved_by uuid,
  pending boolean NOT NULL DEFAULT false,
  CONSTRAINT bingo_scans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  section_id uuid NOT NULL,
  name text NOT NULL,
  password text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['member'::text, 'observer'::text])),
  CONSTRAINT bingo_members_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  timer_seconds integer NOT NULL DEFAULT 0,
  timer_end_at timestamp with time zone,
  time_up_message text NOT NULL DEFAULT ''::text,
  time_up_label text NOT NULL DEFAULT ''::text,
  time_up_maps_url text NOT NULL DEFAULT ''::text,
  marshal_password text NOT NULL DEFAULT '1234'::text,
  photo_submissions_enabled boolean NOT NULL DEFAULT true,
  game_started boolean NOT NULL DEFAULT false,
  board_note text NOT NULL DEFAULT ''::text,
  board_note_every integer NOT NULL DEFAULT 2,
  owner_id uuid,
  tile_display text NOT NULL DEFAULT 'icon'::text CHECK (tile_display = ANY (ARRAY['icon'::text, 'words'::text])),
  scoreboard_theme text NOT NULL DEFAULT 'midnight'::text,
  face_count integer NOT NULL DEFAULT 1 CHECK (face_count >= 1 AND face_count <= 6),
  CONSTRAINT bingo_sections_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_task_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  label text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bingo_task_links_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_settings (
  id text NOT NULL DEFAULT 'main'::text,
  timer_seconds integer NOT NULL DEFAULT 0,
  timer_end_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  game_started boolean NOT NULL DEFAULT false,
  active_section_id uuid,
  marshal_password text NOT NULL DEFAULT '1234'::text,
  photo_submissions_enabled boolean NOT NULL DEFAULT true,
  time_up_message text NOT NULL DEFAULT 'Time''s up! Please return to the meeting point.'::text,
  time_up_label text NOT NULL DEFAULT ''::text,
  time_up_maps_url text NOT NULL DEFAULT ''::text,
  template_section_id uuid,
  CONSTRAINT bingo_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_photo_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  task_id uuid NOT NULL,
  scan_id uuid,
  photo_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_photo_submissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_accounts (
  id uuid NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'sub'::text CHECK (role = ANY (ARRAY['owner'::text, 'sub'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  can_bingo boolean NOT NULL DEFAULT true,
  can_flag boolean NOT NULL DEFAULT false,
  active_section_id uuid,
  facilitator_host uuid,
  access_expires_at timestamp with time zone,
  display_name text,
  facilitator_session_id uuid,
  CONSTRAINT bingo_accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_facilitator_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  pin text NOT NULL,
  host_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Event session'::text,
  expires_at timestamp with time zone NOT NULL,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_facilitator_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_duels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  task_id uuid NOT NULL,
  challenger_team_id uuid NOT NULL,
  defender_team_id uuid NOT NULL,
  game_key text NOT NULL DEFAULT 'speed-edit'::text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'done'::text, 'declined'::text, 'cancelled'::text])),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_team_id uuid,
  bonus_points integer NOT NULL DEFAULT 0,
  code text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  resolved_at timestamp with time zone,
  sticker_team_id uuid,
  CONSTRAINT bingo_duels_pkey PRIMARY KEY (id),
  CONSTRAINT bingo_duels_sticker_team_id_fkey FOREIGN KEY (sticker_team_id) REFERENCES public.bingo_teams(id)
);
CREATE TABLE public.bingo_challenge_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_section_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_challenge_sections_pkey PRIMARY KEY (id)
);
CREATE TABLE public.settings (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  key text UNIQUE,
  value text,
  owner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_duel_codes (
  duel_id uuid NOT NULL,
  code text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_duel_codes_pkey PRIMARY KEY (duel_id),
  CONSTRAINT bingo_duel_codes_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.bingo_duels(id)
);
CREATE TABLE public.bingo_contest_games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid,
  key text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '⚔️'::text,
  tagline text NOT NULL DEFAULT ''::text,
  clue text NOT NULL DEFAULT ''::text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  win_condition text NOT NULL DEFAULT ''::text,
  mins integer NOT NULL DEFAULT 10,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_contest_games_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_by uuid,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_events_pkey PRIMARY KEY (id),
  CONSTRAINT bingo_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.bingo_accounts(id)
);
CREATE TABLE public.bingo_event_members (
  event_id uuid NOT NULL,
  account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'removed'::text])),
  joined_at timestamp with time zone,
  CONSTRAINT bingo_event_members_pkey PRIMARY KEY (event_id, account_id),
  CONSTRAINT bingo_event_members_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.bingo_events(id),
  CONSTRAINT bingo_event_members_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.bingo_accounts(id)
);
CREATE TABLE public.bingo_event_boards (
  event_id uuid NOT NULL,
  section_id uuid NOT NULL,
  added_by uuid,
  CONSTRAINT bingo_event_boards_pkey PRIMARY KEY (event_id, section_id),
  CONSTRAINT bingo_event_boards_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.bingo_events(id),
  CONSTRAINT bingo_event_boards_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.bingo_sections(id),
  CONSTRAINT bingo_event_boards_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.bingo_accounts(id)
);
CREATE TABLE public.bingo_library_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  emoji text NOT NULL DEFAULT '📦'::text,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_library_packs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bingo_library_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT ''::text,
  color text NOT NULL DEFAULT ''::text,
  hex_code text NOT NULL DEFAULT '#8b5cf6'::text,
  points integer NOT NULL DEFAULT 50,
  task_type text NOT NULL DEFAULT 'standard'::text,
  is_contest boolean NOT NULL DEFAULT false,
  contest_bonus integer NOT NULL DEFAULT 0,
  contest_game text NOT NULL DEFAULT 'speed-edit'::text,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT bingo_library_cards_pkey PRIMARY KEY (id),
  CONSTRAINT bingo_library_cards_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES public.bingo_library_packs(id)
);
CREATE TABLE public.bingo_bundle_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bingo_bundle_items_pkey PRIMARY KEY (id),
  CONSTRAINT bingo_bundle_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.bingo_tasks(id),
  CONSTRAINT bingo_bundle_items_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.bingo_tasks(id)
);
CREATE TABLE public.bingo_bundle_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  bundle_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])),
  points integer NOT NULL DEFAULT 0,
  submitted_at timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by uuid,
  CONSTRAINT bingo_bundle_progress_pkey PRIMARY KEY (id),
  CONSTRAINT bingo_bundle_progress_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.bingo_teams(id),
  CONSTRAINT bingo_bundle_progress_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.bingo_tasks(id),
  CONSTRAINT bingo_bundle_progress_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.bingo_tasks(id)
);