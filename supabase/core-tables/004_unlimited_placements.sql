-- ============================================================
-- #1: allow the same card to be placed in as many grid slots as
-- needed. Placement rows already point at a task; only a uniqueness
-- constraint prevented reuse.
-- ============================================================
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.bingo_board_cards'::regclass
      and contype in ('u','p')
      and pg_get_constraintdef(oid) ilike '%task_id%'
      and pg_get_constraintdef(oid) not ilike '%slot%'
  loop
    execute format('alter table public.bingo_board_cards drop constraint %I', c.conname);
    raise notice 'dropped %', c.conname;
  end loop;
end $$;

do $$
declare i record;
begin
  for i in
    select indexname from pg_indexes
    where schemaname='public' and tablename='bingo_board_cards'
      and indexdef ilike '%unique%' and indexdef ilike '%task_id%'
      and indexdef not ilike '%slot%'
  loop
    execute format('drop index if exists public.%I', i.indexname);
    raise notice 'dropped index %', i.indexname;
  end loop;
end $$;

-- One card per slot still holds; the same task may fill many slots.
create unique index if not exists bingo_board_cards_section_slot_key
  on public.bingo_board_cards(section_id, slot);

notify pgrst, 'reload schema';
