-- Editable text for every award slide, plus live updates for a running show.
--
-- slide_text (jsonb), all keys optional — an empty value means the slide's
-- built-in default:
--   { "v": 1,
--     "logo":       "default" | "none" | "<image url>",   -- main + closing
--     "intro":      { "pretitle", "title", "subtitle" },
--     "holding":    { "pretitle", "title", "hint" },
--     "lineup":     { "pretitle", "title" },
--     "scoreboard": { "pretitle", "title" },
--     "closing":    { "pretitle", "title", "subtitle", "tagline", "bg" } }
-- "v": 1 marks a config saved by the editor that knows scoreboard/closing can
-- be removed; older configs still get them added back automatically.
alter table public.bingo_award_configs
  add column if not exists slide_text jsonb not null default '{}'::jsonb;

-- The show listens for config edits so the running ceremony updates without a
-- reload. Teams/scans/duels are already published for the projector.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bingo_award_configs'
  ) then
    alter publication supabase_realtime add table public.bingo_award_configs;
  end if;
end $$;
