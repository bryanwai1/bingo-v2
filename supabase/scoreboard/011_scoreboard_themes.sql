-- ============================================================
-- Per-board scoreboard themes.
--
-- Per board rather than global: renters run different clients on
-- different days, and a hotel function room with windows needs a light
-- scoreboard while a dark AV suite wants the opposite. One global
-- setting would make one of those unreadable.
-- ============================================================

alter table public.bingo_sections
  add column if not exists scoreboard_theme text not null default 'midnight';

comment on column public.bingo_sections.scoreboard_theme is
  'midnight | arena | daylight — keys come from src/lib/scoreboardThemes.ts';

notify pgrst, 'reload schema';
