# supabase/

Canonical schema, organized one file per table (plus a `functions.sql` per
folder for business logic, and one `storage.sql` for the media bucket) —
not an incremental migration history. Each file is a from-scratch
`CREATE TABLE` with every column, constraint, index, RLS policy and trigger
it actually carries today, reconstructed from the 79-file migration history
this replaced (79 files → 44) plus targeted cross-checks against the live
database where the history alone couldn't be trusted (see "Provenance").

Files are applied by hand in the Supabase Dashboard SQL Editor — there's no
`supabase/config.toml` and nothing in the build reads these paths, so this
folder is documentation of the schema, not something a tool executes
automatically. Editing or reorganizing it never touches the live database
on its own.

## Folders

| Folder | What it covers |
|---|---|
| `core-tables/` | Base tasks/scans/teams/members/sections/settings/board-cards — the tables every other folder builds on |
| `accounts-tenancy/` | Multi-tenant accounts, renters, shared events, card library, facilitators/crew passes, RLS |
| `duels-contests/` | Referee/sticker duels, contest mini-games |
| `aitb/` | The standalone AI Team Building marathon app (`/aitb`) — distinct from AITB cards played on a bingo board, which live in `bingo_tasks`/`bingo_scans` |
| `sign-splice/` | Sign Splice letter-hunt task type |
| `breakout-hunt/` | Breakout Hunt puzzle-bank task type |
| `draws/` | The draw-slot system (wheels/cards/cups a card deals to a team) |
| `media-photos/` | Photo/video/media task types, the submission review pipeline, and the `media` storage bucket |
| `voting/` | QR photo/video voting polls |
| `bundle-cards/` | Bundle tiles (one card holding several activities, e.g. the AI Team Building pack) |

Cube-board layout, scoreboard themes, realtime enablement and most small
column-level tweaks aren't their own folders — each landed inside the file
for the table it actually modifies (e.g. cube board's `face_count` is in
`core-tables/bingo_sections.sql`, not a separate folder).

## Run order, if you ever bootstrap fresh

These files are organized for **readability**, not turnkey one-pass
execution — several tables' RLS policies call functions defined in
`accounts-tenancy/functions.sql` (`bingo_can_write`, `can_use_game`,
`is_bingo_owner`, ...), and a couple of tables have foreign keys into
folders that read later alphabetically. If you do want to run these against
an empty database:

1. Every file's bare `create table` statement first, across all folders —
   comment out or defer the `alter table ... add constraint` calls that
   reference a not-yet-created table (each such case is called out in a
   comment at the point it happens, e.g. the circular FK between
   `accounts-tenancy/bingo_accounts.sql` and
   `accounts-tenancy/bingo_facilitator_sessions.sql`, or
   `media-photos/bingo_photo_submissions.sql`'s `puzzle_id` completed by
   `breakout-hunt/bingo_breakout_puzzles.sql`).
2. `accounts-tenancy/functions.sql`, `duels-contests/functions.sql`,
   `bundle-cards/functions.sql`.
3. Everything else (constraints, indexes, RLS, triggers, seed data) in any
   order.

## Provenance

Reconstructed by reading every file in the 79-file history this replaced,
cross-checked in two ways where the files alone weren't reliable:

- **`src/types/database.ts`**, for tables with no `CREATE TABLE` anywhere in
  the history at all — `bingo_tasks`, `bingo_scans`, `bingo_teams`,
  `bingo_members`, `bingo_sections`, `bingo_settings`, `bingo_categories`,
  `bingo_challenge_sections`, `bingo_task_pages`, `bingo_task_photos`,
  `bingo_task_links`, `bingo_award_configs` — these were created directly in
  the Supabase dashboard before version control existed for this project.
  Their base columns are inferred from the TypeScript interfaces; every
  column added by an actual migration is marked `-- (tracked)` with its
  source file.
- **Direct queries against the live database** (via the app's anon key),
  for facts no file could settle either way — e.g. confirming
  `bingo_scans.pending`/`submitted_by`/`submitted_at`/`approved_by` are real
  columns on the live table despite their migration's trigger/functions
  never having been deployed (see below), and that `bingo_draw_assignments`
  was genuinely empty before it was dropped.

## Known omissions

- **`dead-code/006_leader_approval.sql`** (the earlier reorg's placeholder
  for this) **no longer exists.** Its trigger/functions
  (`claim_team_leader`, `submit_tile`, `approve_tile`, `set_team_leader`)
  were verified this session to have never been deployed, and the app-side
  "submit to team leader" UI was removed rather than finished. The four
  now-inert columns they would have used (`bingo_scans.pending` etc.) are
  still documented in `core-tables/bingo_scans.sql`, since they are real
  columns on the live table — just clearly marked dead.
- **`bingo_draw_assignments`** has no file. It backed the older
  stand-alone per-team draw (`draw_style = 'list'`); every card that used it
  has moved onto the slot model in `draws/`, and the table was empty (no
  team had ever drawn through it) when it was dropped. See the note at the
  top of `draws/bingo_draw_items.sql`.
- **Flag Retrieval's tables** (`tasks`, `teams`, `team_members`,
  `team_scans`, `task_pages`, `task_photos`, `task_links`, and the FR
  `settings` key-value table) are a different game sharing this same
  Supabase project. They were never part of this folder's history either —
  only referenced via `ALTER TABLE` from `accounts-tenancy/` — so there was
  nothing here to reconstruct from; this README just flags that they exist
  elsewhere in the database, in case their absence here looks like an
  oversight.
