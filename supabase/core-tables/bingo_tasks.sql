-- bingo_tasks: one row per challenge card, shared across every board that
-- places it (see bingo_board_cards). Created directly in the Supabase
-- dashboard (predates version control) — base columns below are inferred
-- from src/types/database.ts (BingoTask) since no CREATE TABLE for this
-- table exists in the migration history, only ALTERs.
-- Columns marked (tracked) came from an explicit ALTER TABLE in that history.

create table public.bingo_tasks (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references public.bingo_sections(id) on delete cascade,
  title               text not null,
  color               text,
  hex_code            text,
  sort_order          int not null default 0,
  in_grid             boolean not null default false,
  category            text,
  points              int not null default 0,
  completion_warning  text,
  require_marshal     boolean not null default false,
  led                 text,
  created_at          timestamptz not null default now(),

  -- (tracked) accounts-tenancy/20260619_bingo_accounts.sql
  owner_id            uuid references auth.users(id) on delete set null,

  -- (tracked) accounts-tenancy/20260702_bingo_template_clone.sql
  cloned_from         uuid references public.bingo_tasks(id) on delete set null,

  -- (tracked) misc-small-tweaks/20260415_bingo_tasks_answer_type.sql,
  -- widened by media-photos/20260429_bingo_tasks_photo_type.sql,
  -- media-photos/034_video_submissions.sql, media-photos/035_media_task_type.sql
  task_type           text not null default 'standard'
    constraint bingo_tasks_task_type_check
    check (task_type in ('standard', 'answer', 'photo', 'video', 'media', 'sign_splice', 'breakout_hunt')),
  answer_question     text,
  answer_text         text,

  -- (tracked) media-photos/20260421_bingo_features.sql, misc-small-tweaks/20260428_bingo_tasks_maps_label.sql
  maps_url            text,
  maps_label          text,

  -- (tracked) duels-contests/20260803_bingo_duels.sql
  is_contest          boolean not null default false,
  contest_game        text not null default 'speed-edit',
  contest_bonus       int not null default 100,

  -- (tracked) media-photos/033_photo_multiple.sql
  photo_multiple      boolean not null default false,

  -- (tracked) misc-small-tweaks/036_completion_inputs.sql
  -- Which inputs a card requires, e.g. {"photo":"required"}. Backfilled from
  -- task_type at the time: photo->required photo, video->required video,
  -- answer->required answer, media->optional photo + optional video.
  completion_inputs   jsonb not null default '{}'::jsonb,

  -- (tracked) bundle-cards/013_bundle_cards.sql
  is_bundle           boolean not null default false,

  -- (tracked) aitb/020_aitb_card_timer.sql
  -- Per-card timer override for the standalone AITB speed-bonus ladder.
  -- aitb_timer_enabled false hides the bonus bar entirely (untimed run);
  -- aitb_timer_minutes NULL keeps the activity's own duration, a number
  -- rescales the whole bonus ladder to that window.
  aitb_timer_enabled  boolean not null default true,
  aitb_timer_minutes  int
    constraint bingo_tasks_aitb_timer_minutes_check
    check (aitb_timer_minutes is null or (aitb_timer_minutes >= 1 and aitb_timer_minutes <= 180)),

  -- (tracked) sign-splice/019_sign_splice.sql, sign-splice/021_sign_splice_settings.sql
  sign_splice_shop_input   text not null default 'optional'
    check (sign_splice_shop_input in ('hidden', 'optional', 'compulsory')),
  sign_splice_lot_input    text not null default 'optional'
    check (sign_splice_lot_input in ('hidden', 'optional', 'compulsory')),
  sign_splice_min_letters  integer not null default 4,
  sign_splice_max_letters  integer not null default 20,
  sign_splice_allow_spaces boolean not null default false,
  sign_splice_allow_numbers boolean not null default false,
  -- 0..1. Below this, the scan still counts but is flagged in the photo log
  -- and the team is warned before they accept the letter.
  sign_splice_min_confidence real not null default 0.70,
  constraint bingo_tasks_sign_splice_letters_check
    check (sign_splice_min_letters >= 1 and sign_splice_max_letters >= sign_splice_min_letters and sign_splice_max_letters <= 40),
  constraint bingo_tasks_sign_splice_confidence_check
    check (sign_splice_min_confidence >= 0 and sign_splice_min_confidence <= 1),

  -- (tracked) draws/025_draws.sql
  draw_count  integer not null default 0,  -- how many items the per-team deal hands out; 0 = off
  draw_style  text     -- 'list' is the older stand-alone per-team deal, kept for cards configured before the picker existed
    constraint bingo_tasks_draw_style_check
    check (draw_style is null or draw_style in ('pick', 'spin', 'deal', 'gamepick', 'list')),
  draw_spins  integer not null default 1,  -- re-draws allowed before the result locks
  draw_images boolean not null default false,  -- whether slots show artwork or plain text
  constraint bingo_tasks_draw_count_check check (draw_count >= 0 and draw_count <= 12),
  constraint bingo_tasks_draw_spins_check check (draw_spins >= 1 and draw_spins <= 10)
);

comment on column public.bingo_tasks.task_type is '''standard'' = marshal-verified completion; ''answer'' = auto-complete on correct typed answer';
comment on column public.bingo_tasks.answer_question is 'Prompt shown to participants above the letter-box rows (answer cards only)';
comment on column public.bingo_tasks.answer_text is 'Newline-separated correct answers; each line becomes one row of letter boxes (answer cards only)';
comment on column public.bingo_tasks.is_contest is 'When true this card is played as a head-to-head duel between two teams instead of a solo task.';
comment on column public.bingo_tasks.contest_game is 'Which contest game this card runs. Keys come from src/lib/contestGames.ts.';
comment on column public.bingo_tasks.contest_bonus is 'Extra points awarded to the WINNER of the duel, on top of the tile points the challenger gets for crossing off.';
comment on column public.bingo_tasks.is_bundle is 'One tile holding several activities. Children live in bingo_bundle_items.';
comment on column public.bingo_tasks.draw_count is 'How many items the per-team deal hands out. 0 means that mechanism is off.';
comment on column public.bingo_tasks.draw_spins is 'Re-draws allowed before the result locks. Roulette spins twice.';
comment on column public.bingo_tasks.draw_images is 'Whether the slots show their artwork (reels, photo cards) or plain text.';

create index bingo_tasks_owner_idx on public.bingo_tasks(owner_id);
create index bingo_tasks_section_idx on public.bingo_tasks(section_id);
create index bingo_tasks_cloned_from_idx on public.bingo_tasks(cloned_from);

alter table public.bingo_tasks enable row level security;

create policy "read open" on public.bingo_tasks for select using (true);
create policy "tenant insert" on public.bingo_tasks for insert to authenticated
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant update" on public.bingo_tasks for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
create policy "tenant delete" on public.bingo_tasks for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id));
