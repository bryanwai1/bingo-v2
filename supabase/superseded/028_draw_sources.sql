-- Let a draw slot take its options from either place.
--
-- Two option stores grew up separately: aitb_pool_items holds the shared house
-- vocabulary (genre, topic, country…) reused across cards, and bingo_draw_items
-- holds a bank belonging to one card. Both are just "a list of things a team can
-- draw", so a slot now names which store it reads and the presentation no longer
-- cares — a spin wheel can turn on a card's own list, and a plain list can show
-- a shared pool.

alter table bingo_draw_slots
  add column if not exists source text not null default 'pool';

alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_source_check;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_source_check
  check (source in ('pool', 'card'));

-- A card-sourced slot has no pool to point at.
alter table bingo_draw_slots
  alter column pool_key drop not null;

-- Exactly one source must be resolvable.
alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_source_resolves;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_source_resolves
  check ((source = 'pool' and pool_key is not null) or source = 'card');

-- Which slot an item belongs to. Null keeps the existing behaviour: the card's
-- items are one flat bank, which is what the plain-list draw uses.
alter table bingo_draw_items
  add column if not exists slot_id uuid references bingo_draw_slots(id) on delete cascade;

create index if not exists idx_draw_items_slot on bingo_draw_items (slot_id, position);

-- Positions were unique per card, which was fine while a card had one flat
-- bank. With per-slot lists two slots both start at position 0, so the
-- uniqueness moves down to the slot (and stays per-card for the flat bank).
alter table bingo_draw_items
  drop constraint if exists bingo_draw_items_task_id_position_key;

create unique index if not exists uq_draw_items_task_position
  on bingo_draw_items (task_id, position) where slot_id is null;
create unique index if not exists uq_draw_items_slot_position
  on bingo_draw_items (slot_id, position) where slot_id is not null;

-- A card's own option can carry artwork too, so the wheel and the card deal
-- look the same whichever store the slot reads from.
alter table bingo_draw_items
  add column if not exists photo_url text;
