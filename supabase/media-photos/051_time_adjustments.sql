-- Admin can correct a card's time for a group (a late approval, a marshal
-- delay) and every score follows. The original open/complete times stay on the
-- scan; this column only overrides the elapsed time the score is built from.
alter table public.bingo_scans
  add column if not exists time_override_seconds integer check (time_override_seconds >= 0);

-- Admin-only record of every correction, so a group's question can be answered.
create table if not exists public.bingo_adjustments (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.bingo_sections(id) on delete cascade,
  team_id    uuid references public.bingo_teams(id) on delete cascade,
  task_id    uuid references public.bingo_tasks(id) on delete set null,
  kind       text not null check (kind in ('time_set', 'time_reset', 'card_reset', 'fix_all', 'undo_approval', 'undo_rejection')),
  detail     text not null,
  reason     text,
  by_email   text,
  created_at timestamptz not null default now()
);
create index if not exists bingo_adjustments_section_idx on public.bingo_adjustments(section_id, created_at desc);

alter table public.bingo_adjustments enable row level security;
-- No anon access: only the board's own admins read or write the history.
drop policy if exists "tenant all" on public.bingo_adjustments;
create policy "tenant all" on public.bingo_adjustments for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));
