-- bingo_event_members: who is in a shared event (accounts-tenancy/bingo_events.sql).
-- Source: accounts-tenancy/009_shared_events.sql.

create table public.bingo_event_members (
  event_id   uuid not null references public.bingo_events(id) on delete cascade,
  account_id uuid not null references public.bingo_accounts(id) on delete cascade,
  status     text not null default 'invited'
               check (status in ('invited','accepted','declined','removed')),
  joined_at  timestamptz,
  primary key (event_id, account_id)
);

create index bingo_event_members_acct_idx on public.bingo_event_members(account_id, status);

alter table public.bingo_event_members enable row level security;

create policy "see own membership" on public.bingo_event_members for select to authenticated
  using (public.is_bingo_owner() or account_id = auth.uid()
         or event_id in (select public.my_event_ids()));
-- You may accept/decline your own invite; the creator manages the roster.
create policy "manage membership" on public.bingo_event_members for all to authenticated
  using (public.is_bingo_owner() or account_id = auth.uid()
         or exists (select 1 from public.bingo_events e where e.id = event_id and e.created_by = auth.uid()))
  with check (public.is_bingo_owner() or account_id = auth.uid()
         or exists (select 1 from public.bingo_events e where e.id = event_id and e.created_by = auth.uid()));
