-- Fallback board icon per category (Admin -> category header -> Icon).
-- Cards with their own icon (bingo_tasks.tile_icon) keep it; the rest show
-- their category's. Null = pick from the category name, as before.
alter table public.bingo_categories
  add column if not exists tile_icon text;

comment on column public.bingo_categories.tile_icon is 'Fallback board icon key for cards in this category with no tile_icon of their own.';
