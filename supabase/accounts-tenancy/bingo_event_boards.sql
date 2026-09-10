-- bingo_event_boards: which boards each member contributes to a shared
-- event. Source: accounts-tenancy/009_shared_events.sql.

create table public.bingo_event_boards (
  event_id   uuid not null references public.bingo_events(id) on delete cascade,
  section_id uuid not null references public.bingo_sections(id) on delete cascade,
  added_by   uuid references public.bingo_accounts(id) on delete set null,
  primary key (event_id, section_id)
);

alter table public.bingo_event_boards enable row level security;

create policy "members read boards" on public.bingo_event_boards for select to authenticated
  using (public.is_bingo_owner() or event_id in (select public.my_event_ids()));
-- You may only contribute a board you actually own.
create policy "contribute own board" on public.bingo_event_boards for all to authenticated
  using (public.is_bingo_owner() or exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.is_bingo_owner() or exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));
