-- bingo_draw_slots: one wheel/card/cup on a draw-type card, in the order
-- they're shown. A card can hand each team something at the moment they
-- open it — four colours to photograph, a riddle to solve, three words
-- that chain into an AI prompt — all the same mechanism (deal N items from
-- a bank, remember what the team got), sharing this one set of tables
-- rather than a module apiece. Presentation lives on bingo_tasks.draw_style
-- (core-tables/bingo_tasks.sql); a slot says where ITS options come from,
-- how many it deals, and whether they feed the copyable AI prompt.
--
-- Source: draws/025_draws.sql, which replaced an earlier six-file build-up
-- (each superseded piece verified this session to be fully restated here —
-- no information was lost in the consolidation).

create table public.bingo_draw_slots (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  position   int  not null,
  -- Which store the options come from: a shared pool, or this card's own list.
  source     text not null default 'pool'
    constraint bingo_draw_slots_source_check check (source in ('pool', 'card')),
  -- Set only when source = 'pool'; names the aitb_pool_items key.
  pool_key   text,
  label      text not null,
  emoji      text,
  -- How many items this one slot deals. A slot set to 4 puts four cards on
  -- the table, which is how "your team's 4 colours" is expressed.
  deal_count integer not null default 1
    constraint bingo_draw_slots_deal_count_check check (deal_count >= 1 and deal_count <= 12),
  -- Whether what this slot draws is chained into the copyable AI prompt.
  -- Off by default: a set of colours or checkpoints is not a sentence.
  in_prompt  boolean not null default false,
  created_at timestamptz not null default now(),

  -- Exactly one source must resolve: a pool slot needs a pool to read.
  constraint bingo_draw_slots_source_resolves
    check ((source = 'pool' and pool_key is not null) or source = 'card'),

  unique (task_id, position)
);

create index idx_draw_slots_task on public.bingo_draw_slots (task_id, position);

alter table public.bingo_draw_slots enable row level security;
create policy draw_slots_all on public.bingo_draw_slots for all using (true) with check (true);

-- The Nerf cups are the draw that is genuinely a prompt: three words that
-- read as one instruction.
update public.bingo_draw_slots
set in_prompt = true
where pool_key in ('cupCharacter', 'cupAction', 'cupScene')
  and in_prompt = false;
