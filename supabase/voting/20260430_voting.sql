-- Photo Voting: admin uploads photos, voters scan QR and pick N photos, live tally.
-- Run in the Supabase SQL editor (or via supabase db push).

create table if not exists vote_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Photo Vote',
  max_votes_per_voter int not null default 2 check (max_votes_per_voter between 1 and 16),
  is_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists vote_photos (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references vote_polls(id) on delete cascade,
  photo_url text not null,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vote_photos_poll_idx on vote_photos (poll_id);

create table if not exists vote_ballots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references vote_polls(id) on delete cascade,
  photo_id uuid not null references vote_photos(id) on delete cascade,
  voter_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id, photo_id)
);
create index if not exists vote_ballots_poll_idx on vote_ballots (poll_id);
create index if not exists vote_ballots_photo_idx on vote_ballots (photo_id);

-- Permissive RLS to match the rest of this anon-keyed event app.
alter table vote_polls   enable row level security;
alter table vote_photos  enable row level security;
alter table vote_ballots enable row level security;

drop policy if exists "anon rw vote_polls"   on vote_polls;
drop policy if exists "anon rw vote_photos"  on vote_photos;
drop policy if exists "anon rw vote_ballots" on vote_ballots;

create policy "anon rw vote_polls"   on vote_polls   for all using (true) with check (true);
create policy "anon rw vote_photos"  on vote_photos  for all using (true) with check (true);
create policy "anon rw vote_ballots" on vote_ballots for all using (true) with check (true);

-- Realtime publication membership: Bingo Dash debugging history shows that
-- subscriptions silently receive nothing unless the table is in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_ballots'
  ) then
    execute 'alter publication supabase_realtime add table public.vote_ballots';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_photos'
  ) then
    execute 'alter publication supabase_realtime add table public.vote_photos';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_polls'
  ) then
    execute 'alter publication supabase_realtime add table public.vote_polls';
  end if;
end $$;

notify pgrst, 'reload schema';
