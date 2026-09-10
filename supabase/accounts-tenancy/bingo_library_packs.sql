-- bingo_library_packs: content packs any renter can browse and copy cards
-- from. Source: accounts-tenancy/010_shared_library.sql.

create table public.bingo_library_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  emoji       text not null default '📦',
  is_public   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.bingo_library_packs enable row level security;

-- Every approved account may browse public packs; only the owner authors them.
create policy "read public packs" on public.bingo_library_packs
  for select using (is_public or public.is_bingo_owner());
create policy "owner writes packs" on public.bingo_library_packs
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- Seed: "AI Team Building" pack (cards themselves live in bingo_library_cards.sql).
insert into public.bingo_library_packs (name, description, emoji, sort_order)
select 'AI Team Building', 'Ten AI-led activities for corporate teams — prompting, generation and judgement under time pressure.', '🤖', 0
where not exists (select 1 from public.bingo_library_packs where name = 'AI Team Building');
