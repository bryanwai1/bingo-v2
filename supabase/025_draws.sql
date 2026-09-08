-- The draw system, end to end. Replaces 025–030, which built it a piece at a
-- time; this is the same schema in its finished shape, written so a fresh
-- database gets there in one run and an existing one is left untouched.
--
-- What a draw is
-- --------------
-- A card can hand each team something at the moment they open it: four colours
-- to photograph, a riddle to solve, a set of checkpoints to visit, three words
-- that chain into an AI prompt. Every one of those is the same mechanism —
-- deal N items from a bank and remember what the team got — so they share one
-- set of tables rather than a module apiece.
--
-- The shape of the draw is data, not code:
--
--   bingo_tasks.draw_style   how it is presented (wheel, card deal, instant
--                            reveal, checklist); null means the card has none
--   bingo_draw_slots         one wheel / card / cup on the card, in order.
--                            A slot says where its options come from, how many
--                            it deals, and whether they feed the prompt.
--   bingo_draw_items         a bank of options belonging to one card — either
--                            to a single slot, or (slot_id null) to the card as
--                            a flat list
--   aitb_pool_items          the shared house vocabulary a slot can read
--                            instead, so genre/topic/character are written once
--   bingo_draw_assignments   what each team drew, for the per-team deal
--
-- Every statement here is idempotent: safe to re-run, and safe to run against a
-- database that already has 025–030 applied.

-- ── Card-level settings ──────────────────────────────────────────────────────

-- How many items the per-team deal hands out. 0 means that mechanism is off.
alter table bingo_tasks
  add column if not exists draw_count integer not null default 0;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_count_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_count_check
  check (draw_count >= 0 and draw_count <= 12);

-- How the draw is presented. 'list' is the older stand-alone per-team deal,
-- kept so cards configured before the picker existed still read back.
alter table bingo_tasks
  add column if not exists draw_style text;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_style_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_style_check
  check (draw_style is null or draw_style in ('pick', 'spin', 'deal', 'gamepick', 'list'));

-- Re-draws allowed before the result locks. Roulette spins twice.
alter table bingo_tasks
  add column if not exists draw_spins integer not null default 1;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_spins_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_spins_check
  check (draw_spins >= 1 and draw_spins <= 10);

-- Whether the slots show their artwork (reels, photo cards) or plain text.
alter table bingo_tasks
  add column if not exists draw_images boolean not null default false;

-- ── Slots: one wheel / card / cup, in the order they are shown ───────────────

create table if not exists bingo_draw_slots (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  position   int  not null,
  -- Which store the options come from: a shared pool, or this card's own list.
  source     text not null default 'pool',
  -- Set only when source = 'pool'; names the aitb_pool_items key.
  pool_key   text,
  label      text not null,
  emoji      text,
  -- How many items this one slot deals. A slot set to 4 puts four cards on the
  -- table, which is how "your team's 4 colours" is expressed.
  deal_count integer not null default 1,
  -- Whether what this slot draws is chained into the copyable AI prompt. Off by
  -- default: a set of colours or checkpoints is not a sentence.
  in_prompt  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task_id, position)
);

-- Columns for a database that already has the table from an earlier run.
alter table bingo_draw_slots add column if not exists source     text not null default 'pool';
alter table bingo_draw_slots add column if not exists deal_count integer not null default 1;
alter table bingo_draw_slots add column if not exists in_prompt  boolean not null default false;
alter table bingo_draw_slots alter column pool_key drop not null;

alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_source_check;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_source_check
  check (source in ('pool', 'card'));

-- Exactly one source must resolve: a pool slot needs a pool to read.
alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_source_resolves;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_source_resolves
  check ((source = 'pool' and pool_key is not null) or source = 'card');

alter table bingo_draw_slots
  drop constraint if exists bingo_draw_slots_deal_count_check;
alter table bingo_draw_slots
  add constraint bingo_draw_slots_deal_count_check
  check (deal_count >= 1 and deal_count <= 12);

create index if not exists idx_draw_slots_task on bingo_draw_slots (task_id, position);

-- ── Items: the bank a card draws from ────────────────────────────────────────

create table if not exists bingo_draw_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  -- The slot this option belongs to. Null keeps it in the card's flat bank,
  -- which is what the per-team deal reads.
  slot_id    uuid references bingo_draw_slots(id) on delete cascade,
  position   int  not null,
  -- What the team is shown: a colour name, a riddle, a checkpoint.
  label      text not null,
  -- A nudge, shown to the team on request.
  hint       text,
  -- The answer. Facilitator only — never selected by the participant queries.
  detail     text,
  -- Optional swatch, so a colour is shown and not just named.
  hex        text,
  -- Optional artwork, shown by the designs that deal pictures.
  photo_url  text,
  created_at timestamptz not null default now()
);

alter table bingo_draw_items add column if not exists slot_id   uuid references bingo_draw_slots(id) on delete cascade;
alter table bingo_draw_items add column if not exists hint      text;
alter table bingo_draw_items add column if not exists photo_url text;

-- Positions are unique within whatever owns the item. They used to be unique
-- per card, which stopped two slots from both starting at 0.
alter table bingo_draw_items
  drop constraint if exists bingo_draw_items_task_id_position_key;

create unique index if not exists uq_draw_items_task_position
  on bingo_draw_items (task_id, position) where slot_id is null;
create unique index if not exists uq_draw_items_slot_position
  on bingo_draw_items (slot_id, position) where slot_id is not null;

create index if not exists idx_draw_items_task on bingo_draw_items (task_id, position);
create index if not exists idx_draw_items_slot on bingo_draw_items (slot_id, position);

-- ── Assignments: what each team drew (the per-team deal) ─────────────────────

create table if not exists bingo_draw_assignments (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references bingo_teams(id) on delete cascade,
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  item_id    uuid not null references bingo_draw_items(id) on delete cascade,
  slot       int  not null,
  drawn_at   timestamptz not null default now(),
  unique (team_id, task_id, slot)
);

create index if not exists idx_draw_assign_team on bingo_draw_assignments (team_id, task_id);
-- Lets the deal spread items evenly across teams instead of picking blind.
create index if not exists idx_draw_assign_item on bingo_draw_assignments (task_id, item_id);

-- ── Access ───────────────────────────────────────────────────────────────────
-- Participants play without an account, exactly as they do for photo
-- submissions, so these follow the same open-access pattern as the rest of the
-- participant-facing bingo tables.

alter table bingo_draw_slots       enable row level security;
alter table bingo_draw_items       enable row level security;
alter table bingo_draw_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_slots' and policyname = 'draw_slots_all') then
    create policy draw_slots_all on bingo_draw_slots for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_items' and policyname = 'draw_items_all') then
    create policy draw_items_all on bingo_draw_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_assignments' and policyname = 'draw_assign_all') then
    create policy draw_assign_all on bingo_draw_assignments for all using (true) with check (true);
  end if;
end $$;

-- ── Data fixes carried over ──────────────────────────────────────────────────

-- Route Master's `detail` was always a nudge rather than an answer, so it
-- belongs in `hint` where the team can ask for it.
update bingo_draw_items i
set hint = i.detail, detail = null
from bingo_tasks t
where t.id = i.task_id
  and t.title = 'Route Master'
  and i.detail is not null
  and i.hint is null;

-- The Nerf cups are the draw that is genuinely a prompt: three words that read
-- as one instruction.
update bingo_draw_slots
set in_prompt = true
where pool_key in ('cupCharacter', 'cupAction', 'cupScene')
  and in_prompt = false;
