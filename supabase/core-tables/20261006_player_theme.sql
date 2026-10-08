-- Per-board look of the player screens: 'default' (Bingo Dash) or 'grab'
-- (Grab Game Day art). Chosen in Admin → Player Look. Run once in the
-- Supabase SQL editor; existing boards stay on 'default'.

alter table public.bingo_sections
  add column if not exists player_theme text not null default 'default'
    constraint bingo_sections_player_theme_check
    check (player_theme in ('default', 'grab'));

comment on column public.bingo_sections.player_theme is 'default | grab — how join, waiting and board screens look to players.';
