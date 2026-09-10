-- bingo_duel_codes: the marshal-facing reference code for one duel, kept in
-- its own table so anonymous players can never read it directly — only a
-- marshal (authenticated) can, and only within their own tenant. The only
-- way to consume a code is resolve_duel() (duels-contests/functions.sql),
-- which deletes it once used. Source: duels-contests/002_referee_and_stickers.sql.

create table public.bingo_duel_codes (
  duel_id     uuid primary key references public.bingo_duels(id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now()
);

alter table public.bingo_duel_codes enable row level security;

-- No INSERT/UPDATE/DELETE policy exists — all writes go through
-- issue_duel_code() (insert) and resolve_duel() (delete), both SECURITY
-- DEFINER, which bypass RLS. That's deliberate: anon players cannot read
-- or write this table at all, by any path except those two functions.
create policy "marshal reads own tenant codes" on public.bingo_duel_codes
  for select to authenticated
  using (exists (
    select 1 from public.bingo_duels d
    join public.bingo_sections s on s.id = d.section_id
    where d.id = duel_id and public.bingo_can_write(s.owner_id)));
