-- vote_ballots: one row per (voter, photo) vote cast. voter_id is a client-
-- generated identifier (not an auth uid — voters are anonymous), so the
-- unique constraint is what actually stops double-voting for the same entry.
-- Source: voting/20260430_voting.sql.

create table public.vote_ballots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.vote_polls(id) on delete cascade,
  photo_id uuid not null references public.vote_photos(id) on delete cascade,
  voter_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id, photo_id)
);

create index vote_ballots_poll_idx on public.vote_ballots (poll_id);
create index vote_ballots_photo_idx on public.vote_ballots (photo_id);

alter table public.vote_ballots enable row level security;
create policy "anon rw vote_ballots" on public.vote_ballots for all using (true) with check (true);

alter publication supabase_realtime add table public.vote_ballots;
