-- ============================================================
-- Shared card library — content packs every renter can pull from.
--
-- AI Team Building used to be a hardcoded array only the house account
-- could import. Now it is owner-authored rows any tenant can browse and
-- copy into their own board. Copy-on-use: the renter gets their own
-- editable card, so their changes never touch the source or each other.
-- ============================================================

create table if not exists public.bingo_library_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  emoji       text not null default '📦',
  is_public   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.bingo_library_cards (
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

create index if not exists bingo_library_cards_pack_idx on public.bingo_library_cards(pack_id);

alter table public.bingo_library_packs enable row level security;
alter table public.bingo_library_cards enable row level security;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('bingo_library_packs','bingo_library_cards')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Every approved account may browse public packs; only the owner authors them.
create policy "read public packs" on public.bingo_library_packs
  for select using (is_public or public.is_bingo_owner());
create policy "owner writes packs" on public.bingo_library_packs
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

create policy "read public cards" on public.bingo_library_cards
  for select using (exists (select 1 from bingo_library_packs p
                            where p.id = pack_id and (p.is_public or public.is_bingo_owner())));
create policy "owner writes cards" on public.bingo_library_cards
  for all to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

-- ── Copy a whole pack into a caller's board ─────────────────
create or replace function public.import_library_pack(p_pack uuid, p_section uuid)
returns json language plpgsql security definer set search_path = public as $$
declare sec record; c record; n int := 0; skipped int := 0;
begin
  select * into sec from bingo_sections where id = p_section;
  if not found then raise exception 'BOARD_NOT_FOUND'; end if;
  if not (public.is_bingo_owner() or public.bingo_can_write(sec.owner_id)) then
    raise exception 'NOT_YOUR_BOARD';
  end if;

  for c in select * from bingo_library_cards where pack_id = p_pack order by sort_order
  loop
    -- Idempotent: pressing Import twice must not double the library.
    if exists (select 1 from bingo_tasks t
               where t.section_id = p_section and lower(t.title) = lower(c.title)) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into bingo_tasks (section_id, owner_id, title, color, hex_code, category,
                             points, sort_order, in_grid, task_type,
                             is_contest, contest_bonus, contest_game)
    values (p_section, sec.owner_id, c.title, c.color, c.hex_code, c.category,
            c.points, c.sort_order, false, c.task_type,
            c.is_contest, c.contest_bonus, c.contest_game);
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'created', n, 'skipped', skipped);
end; $$;

grant execute on function public.import_library_pack(uuid, uuid) to authenticated;

-- ── Seed the AI Team Building pack ──────────────────────────
insert into public.bingo_library_packs (name, description, emoji, sort_order)
select 'AI Team Building', 'Ten AI-led activities for corporate teams — prompting, generation and judgement under time pressure.', '🤖', 0
where not exists (select 1 from bingo_library_packs where name = 'AI Team Building');

insert into public.bingo_library_cards (pack_id, title, category, color, hex_code, points, is_contest, contest_bonus, sort_order)
select p.id, v.title, 'AI Team Building', 'AI', v.hex, v.pts, v.contest, v.bonus, v.ord
from bingo_library_packs p,
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
  and not exists (select 1 from bingo_library_cards c where c.pack_id = p.id and c.title = v.title);

notify pgrst, 'reload schema';
