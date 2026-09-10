-- vote_photos: the entries in a voting poll. Source: voting/20260430_voting.sql.

create table public.vote_photos (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.vote_polls(id) on delete cascade,
  photo_url text not null,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index vote_photos_poll_idx on public.vote_photos (poll_id);

alter table public.vote_photos enable row level security;
create policy "anon rw vote_photos" on public.vote_photos for all using (true) with check (true);

alter publication supabase_realtime add table public.vote_photos;
