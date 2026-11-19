-- APPLIED to the live project on 2026-11-19.
--
-- What: a card (e.g. Crack the Passcode) can reveal one of SEVERAL passcodes
-- instead of the same one to every team. Each team that answers correctly is
-- handed a code nobody else holds yet; a team always gets the same code back
-- if it asks again. Once every code is held, the least-used ones are handed out
-- again so no team is ever left without a code.
--
-- Admin side: the pool is edited on the card's edit page (components/CardPasscodeBox.tsx);
-- each code shows which team holds it.
--
-- Safe to run on a board mid-game: additive. The old single code in
-- bingo_task_secrets is copied into the pool as one entry and the table is left
-- in place (get_card_passcode falls back to it when a card has no pool).
--
-- Roll back with:
--   drop function if exists public.get_card_passcode(uuid);   -- then re-run 20261006_card_passcode.sql
--   drop table if exists public.bingo_passcode_claims;
--   drop table if exists public.bingo_task_passcodes;

create table if not exists public.bingo_task_passcodes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  label      text not null default '',
  passcode   text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bingo_task_passcodes_task_idx on public.bingo_task_passcodes(task_id, sort_order);

create table if not exists public.bingo_passcode_claims (
  task_id     uuid not null references public.bingo_tasks(id) on delete cascade,
  team_id     uuid not null references public.bingo_teams(id) on delete cascade,
  passcode_id uuid not null references public.bingo_task_passcodes(id) on delete cascade,
  claimed_at  timestamptz not null default now(),
  primary key (task_id, team_id)
);

alter table public.bingo_task_passcodes enable row level security;
alter table public.bingo_passcode_claims enable row level security;

-- Only whoever can edit the card can read or change its codes and see who holds them.
drop policy if exists "tenant all" on public.bingo_task_passcodes;
create policy "tenant all" on public.bingo_task_passcodes for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t where t.id = task_id and public.bingo_can_write(t.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t where t.id = task_id and public.bingo_can_write(t.owner_id)));

drop policy if exists "tenant all" on public.bingo_passcode_claims;
create policy "tenant all" on public.bingo_passcode_claims for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t where t.id = task_id and public.bingo_can_write(t.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t where t.id = task_id and public.bingo_can_write(t.owner_id)));

-- Existing single codes become the first pool entry.
insert into public.bingo_task_passcodes (task_id, label, passcode)
select s.task_id, 'Code', s.passcode
  from public.bingo_task_secrets s
 where not exists (select 1 from public.bingo_task_passcodes p where p.task_id = s.task_id);

-- Players still call this with their scan id and get a code only once the answer is right.
-- It now writes (the claim), so it is volatile, and the per-card lock keeps two teams
-- answering at the same moment from being handed the same code.
create or replace function public.get_card_passcode(p_scan uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_task uuid;
  v_team uuid;
  v_code text;
  v_pid  uuid;
begin
  select task_id, team_id into v_task, v_team
    from bingo_scans where id = p_scan and answer_ok = true;
  if v_task is null then return null; end if;

  select p.passcode into v_code
    from bingo_passcode_claims c join bingo_task_passcodes p on p.id = c.passcode_id
   where c.task_id = v_task and c.team_id = v_team;
  if v_code is not null then return v_code; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_task::text, 1));

  select p.passcode into v_code
    from bingo_passcode_claims c join bingo_task_passcodes p on p.id = c.passcode_id
   where c.task_id = v_task and c.team_id = v_team;
  if v_code is not null then return v_code; end if;

  -- Least-held code first, random among equals: free codes go out before any repeat.
  select p.id, p.passcode into v_pid, v_code
    from bingo_task_passcodes p
   where p.task_id = v_task and p.passcode <> ''
   order by (select count(*) from bingo_passcode_claims c where c.passcode_id = p.id), random()
   limit 1;

  if v_pid is null then
    -- No pool: fall back to the card's single code, if it has one.
    select passcode into v_code from bingo_task_secrets where task_id = v_task;
    return v_code;
  end if;

  insert into bingo_passcode_claims (task_id, team_id, passcode_id) values (v_task, v_team, v_pid);
  return v_code;
end;
$$;

grant execute on function public.get_card_passcode(uuid) to anon, authenticated;
