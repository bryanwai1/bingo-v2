-- bingo_library_cards: individual cards within a library pack. Copy-on-use —
-- import_library_pack() (accounts-tenancy/functions.sql) copies these into
-- a tenant's own bingo_tasks rather than referencing them live.
-- Source: accounts-tenancy/010_shared_library.sql.

create table public.bingo_library_cards (
  id            uuid primary key default gen_random_uuid(),
  pack_id       uuid not null references public.bingo_library_packs(id) on delete cascade,
  title         text not null,
  category      text not null default '',
  color         text not null default '',
  hex_code      text not null default '#8b5cf6',
  points        int  not null default 50,
  task_type     text not null default 'standard',
  is_contest    boolean not null default false,
  contest_bonus int not null default 0,
  contest_game  text not null default 'speed-edit',
  body          jsonb not null default '{}'::jsonb,   -- pages, pointers, examples
  sort_order    int not null default 0
);

create index bingo_library_cards_pack_idx on public.bingo_library_cards(pack_id);

alter table public.bingo_library_cards enable row level security;

create policy "read public cards" on public.bingo_library_cards
  for select using (exists (select 1 from public.bingo_library_packs p
                            where p.id = pack_id and (p.is_public or public.is_bingo_owner())));
create policy "owner writes cards" on public.bingo_library_cards
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- Seed: the ten "AI Team Building" cards.
insert into public.bingo_library_cards (pack_id, title, category, color, hex_code, points, is_contest, contest_bonus, sort_order)
select p.id, v.title, 'AI Team Building', 'AI', v.hex, v.pts, v.contest, v.bonus, v.ord
from public.bingo_library_packs p,
(values
  ('Speed Edit Showdown', '#dc2626', 100, true,  150, 0),
  ('Prompt Relay',        '#7c3aed', 75,  false, 0,   1),
  ('AI Portrait Studio',  '#ec4899', 75,  false, 0,   2),
  ('Caption This',        '#f59e0b', 50,  false, 0,   3),
  ('Style Transfer Race', '#06b6d4', 75,  true,  100, 4),
  ('The Brief Builder',   '#10b981', 100, false, 0,   5),
  ('Hallucination Hunt',  '#ef4444', 75,  false, 0,   6),
  ('One-Word Prompt',     '#8b5cf6', 50,  false, 0,   7),
  ('Team Mascot Design',  '#3b82f6', 75,  false, 0,   8),
  ('Pitch It With AI',    '#f97316', 100, false, 0,   9)
) as v(title, hex, pts, contest, bonus, ord)
where p.name = 'AI Team Building'
  and not exists (select 1 from public.bingo_library_cards c where c.pack_id = p.id and c.title = v.title);
