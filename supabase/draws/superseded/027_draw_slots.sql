-- Make a card's draw configurable instead of hardcoded per module.
--
-- AITB_MODULE_SLOTS in src/lib/aitbActivities.ts fixes four module shapes in
-- code: roulette is always Genre + Topic, cards is always Country/Character/
-- Scene/Style, and so on. That means a new draw needs a deploy, and a card
-- outside AI Team Building cannot have one at all.
--
-- These columns move that shape into data. Nothing changes for a card that
-- defines no slots — the app still falls back to the hardcoded map — so this
-- migration is inert until a card is deliberately moved across.

-- How the draw is presented. Mirrors AITB_MODULE_MODE, plus 'list' for the
-- plain draw used by Colour Hunt / Escape the Mall / Route Master.
alter table bingo_tasks
  add column if not exists draw_style text;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_style_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_style_check
  check (draw_style is null or draw_style in ('pick', 'spin', 'deal', 'gamepick', 'list'));

-- Re-draws allowed before the result locks. Roulette's two spins today.
alter table bingo_tasks
  add column if not exists draw_spins integer not null default 1;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_spins_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_spins_check
  check (draw_spins >= 1 and draw_spins <= 10);

-- Whether the slots show their pool artwork (the card deal and the wheel's
-- reveal images) or plain text.
alter table bingo_tasks
  add column if not exists draw_images boolean not null default false;

-- One row per wheel / reel / cup on a card, in the order they are shown.
-- pool_key points at aitb_pool_items, so the shared house vocabulary is reused
-- rather than duplicated per card.
create table if not exists bingo_draw_slots (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  position   int  not null,
  pool_key   text not null,
  label      text not null,
  emoji      text,
  created_at timestamptz not null default now(),
  unique (task_id, position)
);

create index if not exists idx_draw_slots_task on bingo_draw_slots (task_id, position);

alter table bingo_draw_slots enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_slots' and policyname = 'draw_slots_all') then
    create policy draw_slots_all on bingo_draw_slots for all using (true) with check (true);
  end if;
end $$;
