-- vote_polls: photo/video voting — admin uploads media, voters scan a QR
-- and pick N entries, live tally. Deliberately NOT part of the multi-tenant
-- RLS hardening (20260703_multitenant_rls.sql explicitly excludes vote_*) —
-- stays fully anon-writable like the rest of this anon-keyed event app.
-- Source: voting/20260430_voting.sql, widened by 20260430_voting_media_type.sql.

create table public.vote_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Photo Vote',
  max_votes_per_voter int not null default 2 check (max_votes_per_voter between 1 and 16),
  is_open boolean not null default false,
  created_at timestamptz not null default now(),

  -- (tracked) voting/20260430_voting_media_type.sql
  media_type text not null default 'photo'
    constraint vote_polls_media_type_check check (media_type in ('photo','video'))
);

alter table public.vote_polls enable row level security;
create policy "anon rw vote_polls" on public.vote_polls for all using (true) with check (true);

alter publication supabase_realtime add table public.vote_polls;
