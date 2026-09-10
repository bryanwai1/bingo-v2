-- aitb_settings: singleton config row (id = 1) for the standalone AI Team
-- Building marathon app (/aitb — distinct from AITB cards played on a
-- Bingo Dash board, which use bingo_tasks/bingo_scans instead).
-- Source: aitb/20260723_aitb.sql, widened by aitb/20260723_aitb_game_timer.sql.

create table public.aitb_settings (
  id int primary key default 1 check (id = 1),
  admin_password text not null default '1994',
  updated_at timestamptz not null default now(),

  -- (tracked) aitb/20260723_aitb_game_timer.sql
  -- Whole-game countdown: admin sets a global end time; mission pages lock
  -- and the projector flashes TIME'S UP once it passes. Null = not running.
  game_ends_at timestamptz
);

insert into public.aitb_settings (id) values (1) on conflict (id) do nothing;

-- Permissive RLS to match the rest of this anon-keyed event app.
alter table public.aitb_settings enable row level security;
create policy "anon rw aitb_settings" on public.aitb_settings for all using (true) with check (true);

alter publication supabase_realtime add table public.aitb_settings;
