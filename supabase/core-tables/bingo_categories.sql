-- bingo_categories: card-library category groupings shown in the admin
-- Cards tab. No CREATE/ALTER TABLE for this table exists in the migration
-- history — columns are inferred from src/types/database.ts
-- (BingoCategory), corroborated by the insert list in clone_bingo_board().

create table public.bingo_categories (
  id                     uuid primary key default gen_random_uuid(),
  section_id             uuid references public.bingo_sections(id) on delete cascade,
  challenge_section_id   uuid references public.bingo_challenge_sections(id) on delete set null,
  name                   text not null,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now()
);

alter table public.bingo_categories enable row level security;

create policy "read open" on public.bingo_categories for select using (true);
create policy "tenant write" on public.bingo_categories for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));
