-- bingo_challenge_sections: a grouping ABOVE categories in the admin Board
-- tab (distinct from bingo_sections, which is a whole board/event). No
-- CREATE/ALTER TABLE for this table exists in the migration history —
-- columns are inferred from src/types/database.ts (BingoChallengeSection).

create table public.bingo_challenge_sections (
  id               uuid primary key default gen_random_uuid(),
  game_section_id  uuid references public.bingo_sections(id) on delete cascade,
  name             text not null,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

alter table public.bingo_challenge_sections enable row level security;

create policy "read open" on public.bingo_challenge_sections for select using (true);
create policy "tenant write" on public.bingo_challenge_sections for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = game_section_id and public.bingo_can_write(s.owner_id)));
