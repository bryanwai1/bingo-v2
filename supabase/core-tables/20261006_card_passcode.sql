-- Passcode a card reveals after a correct answer (e.g. the box code on
-- Crack the Passcode). Kept in its own table, NOT on bingo_tasks: tasks are
-- readable by every player (select *), so a column there would leak the code.
-- A row means "this card reveals a passcode"; no row means it does not.
-- Default code is 1234; the admin changes it on the card.
create table if not exists public.bingo_task_secrets (
  task_id    uuid primary key references public.bingo_tasks(id) on delete cascade,
  passcode   text not null default '1234',
  updated_at timestamptz not null default now()
);

alter table public.bingo_task_secrets enable row level security;

-- Only whoever can edit the card can read or write its passcode.
create policy "tenant all" on public.bingo_task_secrets for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t
    where t.id = task_id and public.bingo_can_write(t.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_tasks t
    where t.id = task_id and public.bingo_can_write(t.owner_id)));

-- Players have no table access. They ask here, and only get the code when the
-- scan for that card has a correct answer (answer_ok). Null otherwise.
create or replace function public.get_card_passcode(p_scan uuid)
returns text language sql stable security definer set search_path = public as $$
  select k.passcode
    from public.bingo_scans s
    join public.bingo_task_secrets k on k.task_id = s.task_id
   where s.id = p_scan and s.answer_ok = true;
$$;

grant execute on function public.get_card_passcode(uuid) to anon, authenticated;
