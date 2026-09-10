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
