-- A card whose colour was picked on the card itself (Quick edit) keeps it on the
-- board instead of being repainted with its category's colour.
alter table public.bingo_tasks add column if not exists hex_custom boolean not null default false;
notify pgrst, 'reload schema';
