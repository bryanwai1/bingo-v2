# supabase/

SQL history for the project's Supabase database, grouped by feature instead of
one flat pile. Files are applied by hand in the Supabase Dashboard SQL Editor —
there's no `supabase/config.toml` and nothing in the build reads these paths,
so this folder is documentation of what's been run, not something a tool
executes automatically. Reorganizing it never touches the live database.

Within each folder, filenames keep their original numbering/dating, so
chronological order is still visible — some folders mix the two conventions
this project has used over time (`NNN_name.sql` and `YYYYMMDD_name.sql`).

| Folder | What it covers |
|---|---|
| `core-tables/` | Base tasks/scans/board-cards/sections/settings schema |
| `accounts-tenancy/` | Multi-tenant accounts, renters, facilitators, crew passes, RLS |
| `duels-contests/` | Referee/sticker duels, contest games |
| `aitb/` | AI Team Building missions, scoring, timers, word submissions |
| `sign-splice/` | Sign Splice letter-hunt task type |
| `breakout-hunt/` | Breakout Hunt puzzle-bank task type |
| `draws/` | The draw-slot system; `draws/superseded/` is earlier iterations replaced by `025_draws.sql` |
| `media-photos/` | Photo/video/media task types and the submission review pipeline |
| `voting/` | QR photo/video voting polls |
| `cube-board/` | Multi-face (cube) board layout |
| `bundle-cards/` | Bundle tiles (one card holding several activities) |
| `scoreboard/` | Scoreboard themes, realtime updates, bonus breakdown, award config |
| `realtime-misc/` | Realtime enablement not tied to one feature above |
| `scan-completion/` | The per-box completion fix and its dedupe/cascade follow-ups (2026-09-10) |
| `misc-small-tweaks/` | One-off column additions that don't warrant their own folder |
| `dead-code/` | `006_leader_approval.sql` — written but never deployed; the app-side leader-approval UI was removed instead of finishing this |
