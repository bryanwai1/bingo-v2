-- ============================================================
-- Duel hardening: marshal-issued referee code + tracked stickers
--
-- Fixes: anon could UPDATE bingo_duels directly and declare itself
-- the winner. Resolution now goes through resolve_duel(), which
-- validates a per-duel code only a marshal can see.
--
-- Rewards (agreed with Bryan):
--   • CHALLENGER always gets the sticker — win or lose.
--   • WINNER (either side) banks the contest bonus points.
--   • Challenger who wins gets both.
-- ============================================================

alter table public.bingo_duels
  add column if not exists sticker_team_id uuid references public.bingo_teams(id) on delete set null;

comment on column public.bingo_duels.sticker_team_id is
  'Team that earned the sticker. Always the challenger — they spent the tile.';

-- ── Codes live in their own table so anon players cannot read them ──
create table if not exists public.bingo_duel_codes (
  duel_id uuid primary key references public.bingo_duels(id) on delete cascade,
  code    text not null,
  created_at timestamptz not null default now()
);

alter table public.bingo_duel_codes enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='bingo_duel_codes'
  loop execute format('drop policy %I on public.bingo_duel_codes', p.policyname); end loop;
end $$;

-- Marshals/admins are `authenticated`; players are `anon`. Only the
-- former may read a code, and only within their own tenant.
create policy "marshal reads own tenant codes" on public.bingo_duel_codes
  for select to authenticated
  using (exists (
    select 1 from public.bingo_duels d
    join public.bingo_sections s on s.id = d.section_id
    where d.id = duel_id and public.bingo_can_write(s.owner_id)));

-- ── Issue a code when a duel goes active ────────────────────
create or replace function public.issue_duel_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text := ''; i int;
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    insert into bingo_duel_codes (duel_id, code) values (new.id, c)
      on conflict (duel_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists on_duel_active on public.bingo_duels;
create trigger on_duel_active
  after update on public.bingo_duels
  for each row execute function public.issue_duel_code();

-- ── The only way to resolve a duel ──────────────────────────
create or replace function public.resolve_duel(
  p_duel uuid, p_code text, p_winner uuid
) returns json language plpgsql security definer set search_path = public as $$
declare d record; want text; existing uuid;
begin
  select * into d from bingo_duels where id = p_duel;
  if not found            then raise exception 'DUEL_NOT_FOUND'; end if;
  if d.status <> 'active' then raise exception 'DUEL_NOT_ACTIVE'; end if;
  if p_winner not in (d.challenger_team_id, d.defender_team_id)
                          then raise exception 'WINNER_NOT_IN_DUEL'; end if;

  select code into want from bingo_duel_codes where duel_id = p_duel;
  if want is null then raise exception 'NO_CODE_ISSUED'; end if;
  if upper(trim(coalesce(p_code,''))) <> upper(want) then raise exception 'BAD_CODE'; end if;

  update bingo_duels set
    status          = 'done',
    winner_team_id  = p_winner,
    sticker_team_id = d.challenger_team_id,   -- challenger always
    resolved_at     = now()
  where id = p_duel and status = 'active';

  -- Challenger's tile crosses off either way: they spent it.
  select id into existing from bingo_scans
   where team_id = d.challenger_team_id and task_id = d.task_id;
  if existing is not null then
    update bingo_scans set completed = true, completed_at = now() where id = existing;
  else
    insert into bingo_scans (team_id, task_id, completed, completed_at)
    values (d.challenger_team_id, d.task_id, true, now());
  end if;

  delete from bingo_duel_codes where duel_id = p_duel;  -- single use
  return json_build_object('ok', true, 'winner', p_winner,
                           'sticker', d.challenger_team_id, 'bonus', d.bonus_points);
end; $$;

grant execute on function public.resolve_duel(uuid, text, uuid) to anon, authenticated;

-- ── Close the hole: anon may no longer rewrite duel rows ────
drop policy if exists "anon update" on public.bingo_duels;
drop policy if exists "anon delete" on public.bingo_duels;

-- Players still need to accept/decline/cancel their OWN duel, but may
-- never touch winner/status='done'. Resolution is resolve_duel() only.
create policy "anon lifecycle only" on public.bingo_duels
  for update to anon
  using (status in ('pending','active'))
  with check (status in ('active','declined','cancelled') and winner_team_id is null);

notify pgrst, 'reload schema';
