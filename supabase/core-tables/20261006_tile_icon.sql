-- Per-card board icon. The key names an icon in ICONS (src/components/BingoTileFace.tsx).
-- Null keeps the old behaviour: the icon follows the card's category.
alter table public.bingo_tasks
  add column if not exists tile_icon text;

comment on column public.bingo_tasks.tile_icon is 'Board tile icon key; null = icon chosen from the category.';
