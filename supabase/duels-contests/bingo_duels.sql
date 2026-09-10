-- bingo_duels: contest ("contending") mode. Two teams meet face to face —
-- the CHALLENGER opens a contest card and pairs with the DEFENDER into one
-- duel row; both phones unlock the same clue/payload, play it out, and a
-- marshal declares the winner via resolve_duel() (duels-contests/functions.sql).
--
-- Scoring: the cross-off on the board ALWAYS belongs to the challenger —
-- their tile, spent either way, scoring the card's normal points like any
-- other tile. On top of that, the card's contest_bonus (bingo_tasks) goes
-- only to the winner of the duel — a winning defender scores the bonus
-- without their own board being touched at all.
--
-- Source: duels-contests/20260803_bingo_duels.sql, hardened by
-- duels-contests/002_referee_and_stickers.sql.

create table public.bingo_duels (
  id                 uuid primary key default gen_random_uuid(),
  section_id         uuid not null references public.bingo_sections(id) on delete cascade,
  task_id            uuid not null references public.bingo_tasks(id)    on delete cascade,
  challenger_team_id uuid not null references public.bingo_teams(id)    on delete cascade,
  defender_team_id   uuid not null references public.bingo_teams(id)    on delete cascade,
  game_key           text not null default 'speed-edit',
  status             text not null default 'pending'
                       check (status in ('pending', 'active', 'done', 'declined', 'cancelled')),
  -- Whatever the game needs both phones to agree on, e.g. the randomly drawn
  -- Speed Edit target image. Written once by the challenger so both sides
  -- read the identical value.
  payload            jsonb not null default '{}'::jsonb,
  winner_team_id     uuid references public.bingo_teams(id) on delete set null,
  -- Snapshot of the card's contest bonus at resolve time, so later edits to
  -- the card never rewrite history on the scoreboard.
  bonus_points       int  not null default 0,
  -- Human-readable reference so a marshal can match phone to phone out loud.
  code               text not null,
  created_at         timestamptz not null default now(),
  started_at         timestamptz,
  resolved_at        timestamptz,

  -- (tracked) duels-contests/002_referee_and_stickers.sql
  sticker_team_id    uuid references public.bingo_teams(id) on delete set null,

  constraint bingo_duels_distinct_teams check (challenger_team_id <> defender_team_id)
);

comment on column public.bingo_duels.sticker_team_id is 'Team that earned the sticker. Always the challenger — they spent the tile.';

create index bingo_duels_defender_idx   on public.bingo_duels (defender_team_id, status);
create index bingo_duels_challenger_idx on public.bingo_duels (challenger_team_id, status);
create index bingo_duels_section_idx    on public.bingo_duels (section_id, status);
create index bingo_duels_winner_idx     on public.bingo_duels (winner_team_id);

alter table public.bingo_duels enable row level security;

-- Players are anonymous and need full write access; authenticated sessions
-- are confined to their own tenant so "reset all teams" can never reach
-- across. Anon UPDATE is deliberately narrow (see 002_referee_and_stickers):
-- a player may accept/decline/cancel their OWN duel, but may never set
-- status='done' or a winner directly — only resolve_duel() can do that,
-- gated on a marshal-only code (bingo_duel_codes).
create policy "read open"   on public.bingo_duels for select using (true);
create policy "anon write"  on public.bingo_duels for insert to anon with check (true);
create policy "anon lifecycle only" on public.bingo_duels for update to anon
  using (status in ('pending','active'))
  with check (status in ('active','declined','cancelled') and winner_team_id is null);
create policy "anon delete" on public.bingo_duels for delete to anon using (true);
create policy "tenant write" on public.bingo_duels for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s
    where s.id = section_id and public.bingo_can_write(s.owner_id)));

-- Generates a marshal-facing code the moment a duel goes active.
-- Function defined in duels-contests/functions.sql.
create trigger on_duel_active
  after update on public.bingo_duels
  for each row execute function public.issue_duel_code();

alter publication supabase_realtime add table public.bingo_duels;
