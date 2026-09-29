-- bingo_task_samples: worked-example photos/videos an admin attaches to a
-- card, shown to teams as "See a sample first" (open by default). A card with
-- rows here uses them instead of the built-in samples in src/lib/cardSamples.ts.

create table public.bingo_task_samples (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  sort_order  int  not null default 0,
  media_url   text not null,
  media_type  text not null check (media_type in ('image', 'video')),
  caption     text,
  created_at  timestamptz not null default now()
);

create index idx_task_samples_task on public.bingo_task_samples (task_id, sort_order);

alter table public.bingo_task_samples enable row level security;

create policy "read open" on public.bingo_task_samples for select using (true);
create policy "tenant write" on public.bingo_task_samples for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks pt
    where pt.id = task_id and public.bingo_can_write(pt.owner_id)));
