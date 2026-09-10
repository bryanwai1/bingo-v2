-- How many items a single slot deals.
--
-- A slot used to land on exactly one thing, which is why a card that needed
-- "four colours per team" had to use a separate mechanism with its own count.
-- With a count on the slot, the card deal and the instant reveal cover that
-- case themselves: one slot, four items.
--
-- Defaults to 1, so every existing slot behaves exactly as it does today.

alter table bingo_draw_slots
  add column if not exists deal_count integer not null default 1;

alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_deal_count_check;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_deal_count_check
  check (deal_count >= 1 and deal_count <= 12);
