-- bingo_sections: one row per board/event. Created directly in the Supabase
-- dashboard (predates version control) — base columns below are inferred
-- from src/types/database.ts (BingoSection / BoardTimer) since no CREATE
-- TABLE for this table exists in the migration history, only ALTERs.
-- Columns marked (tracked) came from an explicit ALTER TABLE in that history.

create table public.bingo_sections (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  slug                    text not null,
  sort_order              int not null default 0,
  marshal_password        text,
  timer_seconds           int not null default 0,
  timer_end_at            timestamptz,
  photo_submissions_enabled boolean not null default true,
  time_up_message         text not null default '',
  time_up_label           text not null default '',
  time_up_maps_url        text not null default '',
  created_at              timestamptz not null default now(),

  -- (tracked) accounts-tenancy/20260619_bingo_accounts.sql
  owner_id                uuid references auth.users(id) on delete set null,

  -- (tracked) scoreboard/011_scoreboard_themes.sql
  scoreboard_theme        text not null default 'midnight',

  -- (tracked) misc-small-tweaks/20260422_bingo_section_game_started.sql
  game_started            boolean not null default false,

  -- (tracked) misc-small-tweaks/20260610_bingo_board_note.sql
  board_note              text not null default '',
  board_note_every        int not null default 2,

  -- (tracked) misc-small-tweaks/20260803_bingo_tile_display.sql
  tile_display            text not null default 'icon'
    check (tile_display in ('icon', 'words')),

  -- (tracked) misc-small-tweaks/032_board_glow.sql
  glow_slots              integer[] not null default '{}',

  -- (tracked) misc-small-tweaks/20260910_bingo_timer_duration.sql
  -- The configured length, kept separate from timer_seconds (the live
  -- countdown) so Reset Timer restores the real duration instead of zero.
  timer_duration_seconds  int not null default 0,

  -- (tracked) cube-board/012_cube_board.sql, widened by cube-board/015_flexible_faces.sql
  -- How many cube faces are in play: a flat board is 1. Points scale with it.
  face_count              int not null default 1
    constraint bingo_sections_face_count_check check (face_count between 1 and 6)
);

comment on column public.bingo_sections.scoreboard_theme is 'midnight | arena | daylight — how the projector looks for this board.';
comment on column public.bingo_sections.face_count is 'How many cube faces are in play: 1 (flat board), 2, or 6. Points scale with it.';

create index bingo_sections_owner_idx on public.bingo_sections(owner_id);
create index bingo_sections_slug_idx on public.bingo_sections(slug);

alter table public.bingo_sections enable row level security;

create policy "read open" on public.bingo_sections for select using (true);
create policy "tenant insert" on public.bingo_sections for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_sections for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_sections for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

-- Blocks a new board once a renter hits bingo_accounts.max_boards.
-- Function defined in accounts-tenancy/functions.sql.
create trigger on_section_insert_quota
  before insert on public.bingo_sections
  for each row execute function public.enforce_board_quota();

alter publication supabase_realtime add table public.bingo_sections;
