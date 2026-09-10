-- bingo_settings: singleton config row (id = 'main') read by every
-- anonymous front-door page. Created directly in the Supabase dashboard
-- (predates version control) — base columns below are inferred from
-- src/types/database.ts (BingoSettings) since no CREATE TABLE for this
-- table exists in the migration history, only ALTERs.

create table public.bingo_settings (
  id                  text primary key,
  timer_seconds       int,
  timer_end_at        timestamptz,
  active_section_id   uuid references public.bingo_sections(id) on delete set null,
  marshal_password    text,
  game_started        boolean not null default false,
  created_at          timestamptz not null default now(),

  -- (tracked) media-photos/20260428_bingo_photo_submissions_toggle.sql
  photo_submissions_enabled boolean not null default true,

  -- (tracked) misc-small-tweaks/20260429_bingo_time_up_message.sql
  time_up_message     text not null default 'Time''s up! Please return to the meeting point.',
  time_up_label       text not null default '',
  time_up_maps_url    text not null default '',

  -- (tracked) accounts-tenancy/20260702_bingo_template_clone.sql
  template_section_id uuid references public.bingo_sections(id) on delete set null
);

alter table public.bingo_settings enable row level security;

create policy "read open" on public.bingo_settings for select using (true);
create policy "owner insert" on public.bingo_settings for insert to authenticated
  with check (public.is_bingo_owner());
create policy "owner update" on public.bingo_settings for update to authenticated
  using (public.is_bingo_owner()) with check (public.is_bingo_owner());

alter publication supabase_realtime add table public.bingo_settings;

-- Every column has a default, so seeding the id is enough. Fixes the 'main'
-- row never having existed on this DB (every anonymous page reads it).
insert into public.bingo_settings (id) values ('main') on conflict (id) do nothing;
