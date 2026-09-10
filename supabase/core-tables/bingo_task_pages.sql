-- bingo_task_pages: the swipeable instruction pages shown on a card. No
-- CREATE/ALTER TABLE for this table exists in the migration history —
-- columns are inferred from src/types/database.ts (TaskPage / BingoTaskPage),
-- corroborated by the insert list in clone_bingo_board().

create table public.bingo_task_pages (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  page_order  int not null default 0,
  media_url   text,
  media_type  text,
  pointer_1   text, pointer_2 text, pointer_3 text, pointer_4 text, pointer_5 text, pointer_6 text,
  example_1   text, example_2 text, example_3 text, example_4 text, example_5 text, example_6 text,
  icon_1      text, icon_2 text, icon_3 text, icon_4 text, icon_5 text, icon_6 text,
  created_at  timestamptz not null default now()
);

alter table public.bingo_task_pages enable row level security;

create policy "read open" on public.bingo_task_pages for select using (true);
create policy "tenant write" on public.bingo_task_pages for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)));
