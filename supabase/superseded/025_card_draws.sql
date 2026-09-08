-- Per-team draws for cards whose instructions promise in-app content.
--
-- Colour Hunt ("your team's 4 assigned colours"), Escape the Mall ("draw your
-- riddle") and Route Master ("get your 4 checkpoints") all told teams to open
-- the card for something the app never supplied. They are the same mechanism:
-- deal N items from a bank, and remember what each team got so reopening the
-- card shows the same draw rather than a new one.
--
-- This rides alongside a normal card — no new task_type — because the draw adds
-- to the card rather than replacing how it is played or completed.

-- How many items this card deals. 0 (the default) means no draw panel.
alter table bingo_tasks
  add column if not exists draw_count integer not null default 0;

alter table bingo_tasks
  drop constraint if exists bingo_tasks_draw_count_check;
alter table bingo_tasks
  add constraint bingo_tasks_draw_count_check
  check (draw_count >= 0 and draw_count <= 12);

-- The bank a card draws from, editable per venue on the card's edit page.
create table if not exists bingo_draw_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  position   int  not null,
  -- What the team is shown, e.g. a colour name, a riddle, a checkpoint.
  label      text not null,
  -- Optional second line: a riddle's answer, a checkpoint hint, a colour note.
  detail     text,
  -- Optional swatch, used by Colour Hunt so a colour is shown, not just named.
  hex        text,
  created_at timestamptz not null default now(),
  unique (task_id, position)
);

-- What a team drew. One row per dealt item, so a 4-colour draw is 4 rows.
create table if not exists bingo_draw_assignments (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references bingo_teams(id) on delete cascade,
  task_id    uuid not null references bingo_tasks(id) on delete cascade,
  item_id    uuid not null references bingo_draw_items(id) on delete cascade,
  slot       int  not null,
  drawn_at   timestamptz not null default now(),
  unique (team_id, task_id, slot)
);

create index if not exists idx_draw_items_task on bingo_draw_items (task_id, position);
create index if not exists idx_draw_assign_team on bingo_draw_assignments (team_id, task_id);
-- Lets the draw spread items evenly across teams instead of picking blind.
create index if not exists idx_draw_assign_item on bingo_draw_assignments (task_id, item_id);

alter table bingo_draw_items enable row level security;
alter table bingo_draw_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_items' and policyname = 'draw_items_all') then
    create policy draw_items_all on bingo_draw_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'bingo_draw_assignments' and policyname = 'draw_assign_all') then
    create policy draw_assign_all on bingo_draw_assignments for all using (true) with check (true);
  end if;
end $$;
