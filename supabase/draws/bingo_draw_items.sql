-- bingo_draw_items: the bank a draw-type card draws from — either
-- belonging to one bingo_draw_slots row, or (slot_id null) sitting in the
-- card's own flat list. Source: draws/025_draws.sql.
--
-- bingo_draw_assignments — what each team drew, for the older stand-alone
-- per-team deal (draw_style = 'list') — existed alongside this table but
-- was DROPPED entirely by a later cleanup: every card that used it moved
-- onto the slot model above, where the draw is saved with the team's own
-- progress (bingo_scans.words) instead, and it was empty on this database
-- (no team had ever drawn through it) when it was retired. Its reading
-- components (CardDrawPanel, CardDrawAdminPanel) are gone from the app too
-- — there is deliberately no file for it here.

create table public.bingo_draw_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  -- The slot this option belongs to. Null keeps it in the card's flat bank,
  -- which is what the (now-retired) per-team deal used to read.
  slot_id    uuid references public.bingo_draw_slots(id) on delete cascade,
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

-- Positions are unique within whatever owns the item — per slot when the
-- item belongs to one, per card when it sits in the flat bank (slot_id
-- null). A single plain unique constraint on (task_id, position) used to
-- stop two slots from both starting at 0; these two partial indexes fixed
-- that.
create unique index uq_draw_items_task_position
  on public.bingo_draw_items (task_id, position) where slot_id is null;
create unique index uq_draw_items_slot_position
  on public.bingo_draw_items (slot_id, position) where slot_id is not null;

create index idx_draw_items_task on public.bingo_draw_items (task_id, position);
create index idx_draw_items_slot on public.bingo_draw_items (slot_id, position);

alter table public.bingo_draw_items enable row level security;
create policy draw_items_all on public.bingo_draw_items for all using (true) with check (true);

-- Route Master's `detail` was always a nudge rather than an answer, so it
-- belongs in `hint` where the team can ask for it.
update public.bingo_draw_items i
set hint = i.detail, detail = null
from public.bingo_tasks t
where t.id = i.task_id
  and t.title = 'Route Master'
  and i.detail is not null
  and i.hint is null;
