-- PRD-008 / ADR-008: the prize card ("?"). NOT RUN against any database yet.
--
-- A prize card is a normal bingo_tasks row flagged is_prize, placed on a
-- RESERVED slot 200..209 of bingo_board_cards (never a grid tile, never scored).
-- The first team to reach the card's threshold of completed grid cards can claim
-- it; one claim per placement (= per board). The reveal text and Maps link live
-- in their own table, because bingo_tasks is readable by every player.
--
-- Also re-run these edited files so clone, sync, fork and library push carry
-- bingo_prize_secrets (each gained one array entry / one insert):
--   accounts-tenancy/20261112_clone_board_exact.sql
--   accounts-tenancy/20261116_sync_board_from_source.sql
--   accounts-tenancy/functions.sql   (clone_template... and import_library_pack)
--   core-tables/20261008_board_card_fork.sql
--   core-tables/20261028_push_board_copy_to_library.sql
-- Reset Game needs no change: it deletes the board's teams and claims cascade.

-- 1. Card columns (public: the strip shows "n / threshold") -----------------
alter table public.bingo_tasks
  add column if not exists is_prize boolean not null default false,
  add column if not exists prize_threshold int not null default 20;
alter table public.bingo_tasks drop constraint if exists bingo_tasks_prize_threshold_check;
alter table public.bingo_tasks add constraint bingo_tasks_prize_threshold_check check (prize_threshold >= 1);

alter table public.bingo_library_cards
  add column if not exists is_prize boolean not null default false,
  add column if not exists prize_threshold int not null default 20;
alter table public.bingo_library_cards drop constraint if exists bingo_library_cards_prize_threshold_check;
alter table public.bingo_library_cards add constraint bingo_library_cards_prize_threshold_check check (prize_threshold >= 1);

-- import_library_pack: a pack can carry the flag and threshold (not the secret text).
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
    if exists (select 1 from bingo_tasks t
               where t.section_id = p_section and lower(t.title) = lower(c.title)) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into bingo_tasks (section_id, owner_id, title, color, hex_code, category,
                             points, sort_order, in_grid, task_type,
                             is_contest, contest_bonus, contest_game,
                             is_prize, prize_threshold)
    values (p_section, sec.owner_id, c.title, c.color, c.hex_code, c.category,
            c.points, c.sort_order, false, c.task_type,
            c.is_contest, c.contest_bonus, c.contest_game,
            coalesce(c.is_prize, false), coalesce(c.prize_threshold, 20));
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'created', n, 'skipped', skipped);
end; $$;

-- 2. Reveal text: players have no table access, only get_prize_reveal ------
create table if not exists public.bingo_prize_secrets (
  task_id       uuid primary key references public.bingo_tasks(id) on delete cascade,
  message       text,
  marshal_name  text,
  location_text text,
  maps_url      text,
  maps_label    text,
  updated_at    timestamptz not null default now()
);
alter table public.bingo_prize_secrets enable row level security;
drop policy if exists "tenant all" on public.bingo_prize_secrets;
create policy "tenant all" on public.bingo_prize_secrets for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

-- 3. Reserved placement slots 200..209 ---------------------------------------
alter table public.bingo_board_cards drop constraint if exists bingo_board_cards_slot_check;
alter table public.bingo_board_cards add constraint bingo_board_cards_slot_check check (slot >= 0 and slot < 210);

-- 4. Claims: one per placement; the unique index is the one-winner guard -----
create table if not exists public.bingo_prize_claims (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references public.bingo_sections(id) on delete cascade,
  board_card_id uuid not null unique references public.bingo_board_cards(id) on delete cascade,
  team_id       uuid not null references public.bingo_teams(id) on delete cascade,
  team_name     text not null,
  claimed_at    timestamptz not null default now()
);
create index if not exists bingo_prize_claims_section_idx on public.bingo_prize_claims(section_id);
alter table public.bingo_prize_claims enable row level security;
-- The winner is public by design. No insert/update policy: claim_prize is the only way in.
drop policy if exists "read open" on public.bingo_prize_claims;
create policy "read open" on public.bingo_prize_claims for select using (true);
-- Reset claim (admin).
drop policy if exists "tenant delete" on public.bingo_prize_claims;
create policy "tenant delete" on public.bingo_prize_claims for delete to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_sections s where s.id = section_id and public.bingo_can_write(s.owner_id)));
alter table public.bingo_prize_claims replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.bingo_prize_claims;
exception when duplicate_object then null; end $$;

-- 5. RPCs: the caller is bingo_members.id; team and role come from that row ---
create or replace function public.claim_prize(p_member uuid, p_board_card uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  m  bingo_members%rowtype;
  tm bingo_teams%rowtype;
  bc bingo_board_cards%rowtype;
  t  bingo_tasks%rowtype;
  n  int;
  v_id uuid;
  v_winner text;
  v_team uuid;
begin
  select * into m  from bingo_members where id = p_member;
  select * into bc from bingo_board_cards where id = p_board_card;
  if m.id is null or bc.id is null then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;
  select * into tm from bingo_teams where id = m.team_id;
  select * into t  from bingo_tasks where id = bc.task_id;
  -- an observer, a team of another board, or a card that is not a prize: refused, nothing written
  if tm.id is null or tm.section_id <> bc.section_id or m.role <> 'player' or not coalesce(t.is_prize, false) then
    return json_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  -- Re-count on the server (the client number is display only). Same predicate
  -- as the scoreboard: a completed scan of the box, or (legacy scan without a
  -- box) of its card. Pending, submitted and awaiting-approval scans have
  -- completed = false; prize placements (slot >= 200) are never counted.
  select count(*) into n
    from bingo_board_cards g
   where g.section_id = bc.section_id and g.slot < 200
     and exists (select 1 from bingo_scans sc
                  where sc.team_id = tm.id and sc.completed
                    and (sc.board_card_id = g.id or (sc.board_card_id is null and sc.task_id = g.task_id)));
  if n < t.prize_threshold then return json_build_object('ok', false, 'reason', 'not_eligible'); end if;

  insert into bingo_prize_claims (section_id, board_card_id, team_id, team_name)
  values (bc.section_id, bc.id, tm.id, tm.name)
  on conflict (board_card_id) do nothing
  returning id into v_id;
  if v_id is null then
    select team_id, team_name into v_team, v_winner from bingo_prize_claims where board_card_id = bc.id;
    -- the holding team tapping CLAIM again is not "too late": it already has it
    if v_team = tm.id then return json_build_object('ok', true); end if;
    return json_build_object('ok', false, 'reason', 'taken', 'winner', v_winner);
  end if;
  return json_build_object('ok', true);
end $$;

-- The secret text, only for the team that holds the claim (observers included),
-- at any time, also after the event has ended. Null for everyone else.
create or replace function public.get_prize_reveal(p_member uuid, p_board_card uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
           'title', t.title, 'message', k.message, 'marshal_name', k.marshal_name,
           'location_text', k.location_text, 'maps_url', k.maps_url, 'maps_label', k.maps_label,
           'task_id', t.id, 'team_name', c.team_name, 'claimed_at', c.claimed_at)
    from bingo_members m
    join bingo_prize_claims c on c.team_id = m.team_id and c.board_card_id = p_board_card
    join bingo_board_cards bc on bc.id = c.board_card_id
    join bingo_tasks t on t.id = bc.task_id
    left join bingo_prize_secrets k on k.task_id = t.id
   where m.id = p_member;
$$;

grant execute on function public.claim_prize(uuid, uuid) to anon, authenticated;
grant execute on function public.get_prize_reveal(uuid, uuid) to anon, authenticated;
