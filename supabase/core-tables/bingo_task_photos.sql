-- bingo_task_photos: reference photos attached to a card (distinct from
-- team-submitted evidence, which lives in bingo_photo_submissions). No
-- CREATE/ALTER TABLE for this table exists in the migration history —
-- columns are inferred from src/types/database.ts (TaskPhoto),
-- corroborated by the insert list in clone_bingo_board().

create table public.bingo_task_photos (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  photo_url   text not null,
  photo_order int not null default 0,
  position_x  numeric,
  position_y  numeric,
  caption     text,
  created_at  timestamptz not null default now()
);

alter table public.bingo_task_photos enable row level security;

create policy "read open" on public.bingo_task_photos for select using (true);
create policy "tenant write" on public.bingo_task_photos for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)));
