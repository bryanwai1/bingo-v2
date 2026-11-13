-- Undo for "Sync board": every sync first saves a copy of the tenant's board
-- content, and the owner can put that copy back with owner_undo_board_sync().
--
-- A backup holds what the sync can change: the board's cards, their pages,
-- photos, links, samples, secrets, puzzles, draws, bundle items, the board's
-- categories and display settings. Teams, scans and scores are never part of
-- it, so an undo leaves them alone (except scans on cards the sync itself
-- added, which go away with those cards).
-- The last 5 backups per board are kept.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

create table if not exists public.bingo_board_sync_backups (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references public.bingo_sections(id) on delete cascade,
  source_id      uuid,
  created_at     timestamptz not null default now(),
  snapshot       jsonb not null,
  added_task_ids uuid[] not null default '{}',   -- cards the sync added
  restored_at    timestamptz
);
create index if not exists bingo_board_sync_backups_section_idx
  on public.bingo_board_sync_backups (section_id, created_at desc);
-- Only the security-definer functions below read or write it.
alter table public.bingo_board_sync_backups enable row level security;

-- ── Everything a sync can change on one board, as JSON ───────────────────
create or replace function public.bingo_board_snapshot(p_board uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids   text[];
  tbl   text;
  rws   jsonb;
  kids  jsonb := '{}'::jsonb;
  bund  jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(task_id::text), '{}') into ids
    from bingo_board_cards where section_id = p_board;

  foreach tbl in array array[
    'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links', 'bingo_task_samples',
    'bingo_task_secrets', 'bingo_prize_secrets', 'bingo_breakout_puzzles',
    'bingo_draw_items', 'bingo_draw_slots']
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(c) order by c.task_id::text, to_jsonb(c)::text), ''[]'') from public.%I c where c.task_id::text = any($1)',
        tbl) into rws using ids;
      kids := kids || jsonb_build_object(tbl, rws);
    end if;
  end loop;

  if to_regclass('public.bingo_bundle_items') is not null then
    select coalesce(jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text), '[]') into bund
      from bingo_bundle_items b where b.bundle_id::text = any (ids);
  end if;

  return jsonb_build_object(
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from bingo_tasks t where t.id::text = any (ids)),
    'children', kids,
    'bundle_items', bund,
    'categories', (select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]') from bingo_categories c where c.section_id = p_board),
    'section', (select to_jsonb(s) from bingo_sections s where s.id = p_board));
end;
$$;

-- ── Put one backup back ──────────────────────────────────────────────────
create or replace function public.restore_bingo_board_backup(p_backup uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  bk        record;
  snap      jsonb;
  ids       text[];
  wipe      text[];
  cols      text;
  tbl       text;
  tbls      text[] := array[
    'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links', 'bingo_task_samples',
    'bingo_task_secrets', 'bingo_prize_secrets', 'bingo_breakout_puzzles',
    'bingo_draw_items', 'bingo_draw_slots'];   -- items before slots: delete order
  i         int;
begin
  select * into bk from bingo_board_sync_backups where id = p_backup;
  if bk.id is null then raise exception 'backup not found'; end if;
  snap := bk.snapshot;

  -- Backed-up cards that still exist (a card the tenant deleted since stays deleted).
  select coalesce(array_agg(t.id::text), '{}') into ids
    from bingo_tasks t
   where t.id::text in (select e ->> 'id' from jsonb_array_elements(snap -> 'tasks') e);
  wipe := ids || bk.added_task_ids::text[];

  -- Card rows: every column back to the backed-up value.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bingo_tasks'
     and is_generated = 'NEVER' and column_name <> 'id';
  execute format(
    'update public.bingo_tasks t set (%1$s) = (select %1$s from jsonb_populate_recordset(null::public.bingo_tasks, $1) s where s.id = t.id) where t.id::text = any($2)',
    cols) using snap -> 'tasks', ids;

  -- Children: drop what is there now, put the backed-up rows back.
  foreach tbl in array tbls loop
    if to_regclass('public.' || tbl) is not null then
      execute format('delete from public.%I where task_id::text = any($1)', tbl) using wipe;
    end if;
  end loop;

  -- Cards the sync added leave the board.
  delete from bingo_board_cards where section_id = bk.section_id and task_id = any (bk.added_task_ids);
  delete from bingo_tasks where id = any (bk.added_task_ids) and is_board_copy;

  for i in reverse array_length(tbls, 1) .. 1 loop   -- slots before items: insert order
    tbl := tbls[i];
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'insert into public.%1$I select s.* from jsonb_populate_recordset(null::public.%1$I, $1) s where s.task_id::text = any($2)',
        tbl) using coalesce(snap -> 'children' -> tbl, '[]'::jsonb), ids;
    end if;
  end loop;

  if to_regclass('public.bingo_bundle_items') is not null then
    delete from bingo_bundle_items where bundle_id::text = any (ids);
    insert into bingo_bundle_items
      select s.* from jsonb_populate_recordset(null::public.bingo_bundle_items, snap -> 'bundle_items') s
       where s.bundle_id::text = any (ids)
         and exists (select 1 from bingo_tasks t where t.id = s.activity_id);
  end if;

  -- Categories: remove the ones the sync brought in, restore icons on the rest.
  delete from bingo_categories x
   where x.section_id = bk.section_id
     and x.name not in (select e ->> 'name' from jsonb_array_elements(snap -> 'categories') e)
     and exists (select 1 from bingo_categories c where c.section_id = bk.source_id and c.name = x.name);
  update bingo_categories x set tile_icon = s.tile_icon
    from jsonb_populate_recordset(null::public.bingo_categories, snap -> 'categories') s
   where x.section_id = bk.section_id and x.name = s.name;

  -- Display settings (the same four the sync copies).
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bingo_sections'
     and column_name in ('scoreboard_theme', 'default_bonus_full_minutes', 'default_bonus_timer_minutes', 'card_pauses');
  if cols is not null then
    execute format(
      'update public.bingo_sections t set (%1$s) = (select %1$s from jsonb_populate_record(null::public.bingo_sections, $1)) where t.id = $2',
      cols) using snap -> 'section', bk.section_id;
  end if;

  update bingo_board_sync_backups set restored_at = now() where id = p_backup;
  return json_build_object('board', bk.section_id, 'backup_at', bk.created_at,
                           'cards', coalesce(array_length(ids, 1), 0));
end;
$$;

-- owner_sync_account_boards (which saves the backup before each sync) lives in
-- 20261119_sync_preview_and_protect.sql.

-- ── Owner: undo the last sync on one account's boards ────────────────────
create or replace function public.owner_undo_board_sync(p_account uuid)
returns json language plpgsql security definer set search_path = public as $$
declare b record; out json[] := '{}';
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  for b in
    select distinct on (k.section_id) k.id
      from bingo_board_sync_backups k
      join bingo_sections s on s.id = k.section_id
     where s.owner_id = p_account and k.restored_at is null
     order by k.section_id, k.created_at desc
  loop
    out := out || public.restore_bingo_board_backup(b.id);
  end loop;
  return json_build_object('boards', coalesce(array_length(out, 1), 0), 'detail', to_json(out));
end;
$$;

revoke execute on function public.bingo_board_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.restore_bingo_board_backup(uuid) from public, anon, authenticated;
grant execute on function public.owner_undo_board_sync(uuid) to authenticated;
notify pgrst, 'reload schema';
