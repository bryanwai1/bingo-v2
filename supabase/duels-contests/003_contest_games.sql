-- ============================================================
-- Contest games move from src/lib/contestGames.ts into the DB so
-- Bryan can author questions, steps and images from the admin.
-- ============================================================

create table if not exists public.bingo_contest_games (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid,
  key           text not null,
  name          text not null,
  emoji         text not null default '⚔️',
  tagline       text not null default '',
  clue          text not null default '',
  steps         jsonb not null default '[]'::jsonb,
  win_condition text not null default '',
  mins          int  not null default 10,
  images        jsonb not null default '[]'::jsonb,  -- [{url,label}]
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists bingo_contest_games_owner_idx on public.bingo_contest_games(owner_id);
create unique index if not exists bingo_contest_games_owner_key on public.bingo_contest_games(coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid), key);

alter table public.bingo_contest_games enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='bingo_contest_games'
  loop execute format('drop policy %I on public.bingo_contest_games', p.policyname); end loop;
end $$;

create policy "read open" on public.bingo_contest_games for select using (true);
create policy "tenant write" on public.bingo_contest_games for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_write(owner_id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

-- Seed the existing hardcoded game so nothing breaks on upgrade.
insert into public.bingo_contest_games (owner_id, key, name, emoji, tagline, clue, steps, win_condition, mins, images)
values (null, 'speed-edit', 'Speed Edit Competition', '👁️',
  'Both teams race to recreate the same image with AI. First to 80-100% wins.',
  'Recreate this picture with AI - as close as you can, as fast as you can.',
  '["Look at the target image below - both teams get the exact same one.","Use any AI image tool to recreate it. Take turns writing prompts!","Keep regenerating until it looks 80-100% the same.","Show the marshal your picture next to the target.","The marshal says YES to the first team that hits 80-100%."]'::jsonb,
  '80-100% similarity to the target, approved by the marshal. First approval wins.', 12,
  '[{"url":"/gamesystem/edit1.jpg","label":"3D cartoon"},{"url":"/gamesystem/edit2.jpg","label":"Photorealistic"},{"url":"/gamesystem/edit3.jpg","label":"Pixel art"},{"url":"/gamesystem/edit4.jpg","label":"Watercolor"},{"url":"/gamesystem/edit5.jpg","label":"Claymation"},{"url":"/gamesystem/edit6.jpg","label":"Comic book"},{"url":"/gamesystem/edit7.jpg","label":"Paper cutout"},{"url":"/gamesystem/edit8.jpg","label":"Neon glow"},{"url":"/gamesystem/edit9.jpg","label":"Crayon drawing"},{"url":"/gamesystem/edit10.jpg","label":"Origami"}]'::jsonb)
on conflict do nothing;

notify pgrst, 'reload schema';
