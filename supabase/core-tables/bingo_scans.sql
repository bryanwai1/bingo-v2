-- bingo_scans: one row per (team, task[, board box]) completion record.
-- Created directly in the Supabase dashboard (predates version control) —
-- base columns below are inferred from src/types/database.ts (BingoScan)
-- since no CREATE TABLE for this table exists in the migration history,
-- only ALTERs.

create table public.bingo_scans (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.bingo_teams(id) on delete cascade,
  task_id       uuid not null references public.bingo_tasks(id) on delete cascade,
  scanned_at    timestamptz not null default now(),
  completed     boolean not null default false,
  completed_at  timestamptz,

  -- Result slots for AI Team Building / draw-style cards — the drawn or
  -- typed words a team agreed on. Empty for every other card type.
  -- (tracked) aitb/20260804_bingo_scan_words.sql
  words         text[] not null default '{}',

  -- (tracked) scan-completion/20260910_scan_board_card_id.sql
  -- Which board box this scan came from, so a card placed in several boxes
  -- on one board completes each box independently. NULL on scans recorded
  -- before this column existed (and on any bare task-link scan) — those
  -- apply to every box showing the card, matching the old behavior.
  board_card_id uuid references public.bingo_board_cards(id) on delete set null,

  -- (tracked) scan-completion/20260910_scan_unique_constraint.sql
  -- Stand-in for board_card_id that's never NULL, so the unique index below
  -- can give every legacy (NULL) scan a stable identity too.
  board_card_key uuid generated always as
    (coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,

  -- (tracked) misc-small-tweaks/017_bingo_scan_steps.sql
  -- Indexes of ticked steps for a standalone AI Team Building card.
  steps_done    int[] not null default '{}',

  -- (tracked) misc-small-tweaks/036_completion_inputs.sql
  answer_ok     boolean not null default false,

  -- ==========================================================================
  -- NOT part of the live design — see the block at the bottom of this file.
  -- ==========================================================================
  submitted_by  uuid,
  submitted_at  timestamptz,
  approved_by   uuid,
  pending       boolean not null default false
);

comment on column public.bingo_scans.steps_done is 'Indexes of ticked steps for a standalone AI Team Building card — same purpose as bingo_bundle_progress.steps_done.';

create index bingo_scans_team_idx on public.bingo_scans(team_id);
create index bingo_scans_task_idx on public.bingo_scans(task_id);
create index bingo_scans_team_task_idx on public.bingo_scans(team_id, task_id);
create index bingo_scans_completed_idx on public.bingo_scans(completed) where completed;
create index bingo_scans_board_card_idx on public.bingo_scans(board_card_id);

-- Closes the recordScan() race that could create duplicate rows for the same
-- (team, task, box): concurrent calls now converge on one row via upsert
-- instead of racing a "select existing, else insert".
create unique index bingo_scans_team_task_board_key_uidx
  on public.bingo_scans (team_id, task_id, board_card_key);

alter table public.bingo_scans enable row level security;

create policy "read open" on public.bingo_scans for select using (true);
create policy "anon write" on public.bingo_scans for insert to anon with check (true);
create policy "anon update" on public.bingo_scans for update to anon using (true) with check (true);
create policy "anon delete" on public.bingo_scans for delete to anon using (true);
create policy "tenant write" on public.bingo_scans for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)));

-- ============================================================================
-- submitted_by / submitted_at / approved_by / pending — NOT part of the live
-- design. Written by a "submit to team leader" migration that was never
-- fully deployed (its trigger/functions on bingo_members never shipped —
-- see core-tables/bingo_members.sql); the app-side approval UI was removed
-- instead of finishing it. These four columns are real and present on the
-- live table, but structurally inert: nothing ever sets `pending` true.
-- Safe to drop this whole block (and the columns above) if you'd rather not
-- carry dead weight forward.
-- ============================================================================
comment on column public.bingo_scans.pending is 'DEAD — true when a member had submitted but the team leader had not approved yet. The approval mechanism never shipped.';
-- create index bingo_scans_pending_idx on public.bingo_scans(team_id, pending) where pending;
