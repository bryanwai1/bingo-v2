-- Safer "Sync board":
--   1. Cards remember when someone edited them in the app (tenant_edited_at).
--   2. A sync skips those cards unless the owner picks them.
--   3. The owner can sync chosen cards only (p_slots / p_picks).
--   4. A preview lists what a sync WOULD change, without changing anything.
-- Needs 20261116_sync_board_from_source.sql and 20261118_sync_backup_undo.sql.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

-- ── 1. The edit marker ───────────────────────────────────────────────────
alter table public.bingo_tasks add column if not exists tenant_edited_at timestamptz;

-- App edits arrive as the `authenticated` role. Sync, clone and undo run
-- inside security-definer functions (a different role), so they never mark.
create or replace function public.bingo_mark_card_edited()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.owner_id is not null and new is distinct from old then
    new.tenant_edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists bingo_tasks_mark_edited on public.bingo_tasks;
create trigger bingo_tasks_mark_edited before update on public.bingo_tasks
  for each row execute function public.bingo_mark_card_edited();

-- Editing a card's pages, photos, links ... counts as editing the card.
create or replace function public.bingo_mark_card_edited_child()
returns trigger language plpgsql as $$
declare tid text;
begin
  if current_user = 'authenticated' then
    if tg_op = 'DELETE' then tid := old.task_id::text; else tid := new.task_id::text; end if;
    update public.bingo_tasks set tenant_edited_at = now()
     where id::text = tid and owner_id is not null;
  end if;
  return null;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links', 'bingo_task_samples',
    'bingo_task_secrets', 'bingo_prize_secrets', 'bingo_breakout_puzzles',
    'bingo_draw_slots', 'bingo_draw_items']
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('drop trigger if exists bingo_mark_edited on public.%I', tbl);
      execute format(
        'create trigger bingo_mark_edited after insert or update or delete on public.%I for each row execute function public.bingo_mark_card_edited_child()',
        tbl);
    end if;
  end loop;
end;
$$;

-- ── 2 + 3. Sync one board: skips edited cards, or syncs only p_slots ──────
-- p_slots null  = every card, except ones edited in the app (tenant_edited_at).
-- p_slots given = exactly those slots, edited or not (the owner chose them).
-- p_settings    = also copy the board's display settings.
drop function if exists public.sync_bingo_board(uuid, uuid);
create or replace function public.sync_bingo_board(
  p_target uuid, p_source uuid, p_slots int[] default null, p_settings boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare
  tgt          record;
  src          record;
  r            record;
  s            record;
  cols         text;
  child        text[];
  tcard        uuid;
  new_task     uuid;
  v_slot       uuid;
  tmap         jsonb := '{}'::jsonb;
  touched      uuid[] := '{}';
  n_updated    int := 0;
  n_added      int := 0;
  n_skipped    int := 0;
  shell_cols   text;
begin
  select * into tgt from bingo_sections where id = p_target;
  select * into src from bingo_sections where id = p_source;
  if tgt.id is null or src.id is null then raise exception 'board not found'; end if;

  -- Card columns that are copied over. Identity, ownership, lineage and the
  -- unlock link (re-pointed below) stay the tenant's own.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bingo_tasks' and is_generated = 'NEVER'
     and column_name not in ('id', 'section_id', 'owner_id', 'cloned_from', 'is_board_copy',
                             'created_at', 'prerequisite_task_id', 'tenant_edited_at');

  for r in
    select bc.slot, t.id as src_id, t.cloned_from as src_cloned_from
      from bingo_board_cards bc join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_source
     order by bc.slot
  loop
    select bc.task_id into tcard from bingo_board_cards bc where bc.section_id = p_target and bc.slot = r.slot;

    -- Not chosen, or edited in the app: leave the card alone. It still goes in
    -- the map so other cards' unlock links can point at it.
    if (p_slots is not null and not (r.slot = any (p_slots)))
       or (p_slots is null and tcard is not null
           and exists (select 1 from bingo_tasks e where e.id = tcard and e.tenant_edited_at is not null))
    then
      if tcard is not null then
        tmap := tmap || jsonb_build_object(r.src_id::text, tcard);
        if r.src_cloned_from is not null then tmap := tmap || jsonb_build_object(r.src_cloned_from::text, tcard); end if;
        tmap := tmap || jsonb_build_object(r.src_id::text, tcard);
      end if;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if tcard is not null then
      execute format(
        'update public.bingo_tasks t set (%1$s) = (select %1$s from public.bingo_tasks s where s.id = $1), tenant_edited_at = null where t.id = $2',
        cols) using r.src_id, tcard;
      n_updated := n_updated + 1;
    else
      -- A card the tenant does not have yet: add a board-only copy on the slot.
      new_task := gen_random_uuid();
      insert into bingo_tasks
        select (jsonb_populate_record(null::public.bingo_tasks, to_jsonb(t) || jsonb_build_object(
          'id', new_task, 'section_id', p_target, 'owner_id', tgt.owner_id,
          'cloned_from', null, 'is_board_copy', true, 'created_at', now(), 'tenant_edited_at', null))).*
        from bingo_tasks t where t.id = r.src_id;
      insert into bingo_board_cards (section_id, task_id, slot) values (p_target, new_task, r.slot);
      tcard := new_task;
      n_added := n_added + 1;
    end if;

    touched := touched || tcard;
    tmap := tmap || jsonb_build_object(r.src_id::text, tcard);
    if r.src_cloned_from is not null then tmap := tmap || jsonb_build_object(r.src_cloned_from::text, tcard); end if;
    tmap := tmap || jsonb_build_object(r.src_id::text, tcard);

    -- Children: replace the tenant's with the source's.
    foreach child slice 1 in array array[
      array['bingo_task_pages', 'task_id'],
      array['bingo_task_photos', 'task_id'],
      array['bingo_task_links', 'task_id'],
      array['bingo_task_samples', 'task_id'],
      array['bingo_task_secrets', 'task_id'],
      array['bingo_prize_secrets', 'task_id'],
      array['bingo_breakout_puzzles', 'task_id']
    ]
    loop
      if to_regclass('public.' || child[1]) is not null then
        execute format('delete from public.%I where %I::text = $1', child[1], child[2]) using tcard::text;
        execute format(
          'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(c) || jsonb_build_object(%2$L, gen_random_uuid(), %3$L, $1, %4$L, now()))).* from public.%1$I c where c.%3$I::text = $2',
          child[1], 'id', child[2], 'created_at') using tcard::text, r.src_id::text;
      end if;
    end loop;

    if to_regclass('public.bingo_draw_slots') is not null then
      delete from bingo_draw_items where task_id = tcard;
      delete from bingo_draw_slots where task_id = tcard;
      for s in select * from bingo_draw_slots where task_id = r.src_id loop
        v_slot := gen_random_uuid();
        insert into bingo_draw_slots
          select (jsonb_populate_record(null::public.bingo_draw_slots, to_jsonb(s) || jsonb_build_object(
            'id', v_slot, 'task_id', tcard, 'created_at', now()))).*;
        insert into bingo_draw_items
          select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
            'id', gen_random_uuid(), 'task_id', tcard, 'slot_id', v_slot, 'created_at', now()))).*
          from bingo_draw_items i where i.slot_id = s.id;
      end loop;
      insert into bingo_draw_items
        select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
          'id', gen_random_uuid(), 'task_id', tcard, 'created_at', now()))).*
        from bingo_draw_items i where i.task_id = r.src_id and i.slot_id is null;
    end if;
  end loop;

  -- Unlock chain: each synced card follows the tenant's copy of the card the
  -- source says it follows (a predecessor that is not on the board = unchained).
  update bingo_tasks t
     set prerequisite_task_id = nullif(tmap ->> sp.prerequisite_task_id::text, '')::uuid
    from bingo_board_cards tb
    join bingo_board_cards sb on sb.slot = tb.slot and sb.section_id = p_source
    join bingo_tasks sp on sp.id = sb.task_id
   where tb.section_id = p_target and t.id = tb.task_id and t.id = any (touched);

  if to_regclass('public.bingo_bundle_items') is not null then
    update bingo_bundle_items b
       set activity_id = (tmap ->> b.activity_id::text)::uuid
     where b.bundle_id = any (touched) and tmap ? b.activity_id::text;
  end if;

  -- Categories: make sure the tenant has the source's, with the same icon.
  insert into bingo_categories (section_id, name, sort_order, tile_icon)
  select p_target, c.name, c.sort_order, c.tile_icon from bingo_categories c
   where c.section_id = p_source
     and not exists (select 1 from bingo_categories x where x.section_id = p_target and x.name = c.name);
  update bingo_categories x set tile_icon = c.tile_icon
    from bingo_categories c
   where c.section_id = p_source and x.section_id = p_target and x.name = c.name;

  -- Display settings only (never the name, slug, password, timer or game state).
  if p_settings then
    select string_agg(quote_ident(column_name), ', ') into shell_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'bingo_sections'
       and column_name in ('scoreboard_theme', 'default_bonus_full_minutes', 'default_bonus_timer_minutes', 'card_pauses');
    if shell_cols is not null then
      execute format('update public.bingo_sections t set (%1$s) = (select %1$s from public.bingo_sections s where s.id = $1) where t.id = $2',
                     shell_cols) using p_source, p_target;
    end if;
  end if;

  update bingo_sections set synced_from = p_source where id = p_target;
  return json_build_object('board', p_target, 'updated', n_updated, 'added', n_added, 'skipped', n_skipped);
end;
$$;

-- ── Owner: sync (backup first). p_picks = {"<board id>": [slot, ...]} ─────
-- A board missing from p_picks (or p_picks null) gets the default: every card
-- except the ones edited in the app.
drop function if exists public.owner_sync_account_boards(uuid);
create or replace function public.owner_sync_account_boards(
  p_account uuid default null, p_picks jsonb default null, p_settings boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare b record; res json; out json[] := '{}'; v_bk uuid; v_slots int[];
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  for b in
    select id, synced_from from bingo_sections
     where synced_from is not null and owner_id is not null
       and (p_account is null or owner_id = p_account)
  loop
    v_slots := null;
    if p_picks ? b.id::text then
      select coalesce(array_agg(x::int), '{}') into v_slots
        from jsonb_array_elements_text(p_picks -> b.id::text) x;
    end if;

    insert into bingo_board_sync_backups (section_id, source_id, snapshot)
    values (b.id, b.synced_from, public.bingo_board_snapshot(b.id))
    returning id into v_bk;

    res := public.sync_bingo_board(b.id, b.synced_from, v_slots, p_settings);

    update bingo_board_sync_backups k
       set added_task_ids = coalesce((
             select array_agg(bc.task_id) from bingo_board_cards bc
              where bc.section_id = b.id
                and bc.task_id::text not in (select e ->> 'id' from jsonb_array_elements(k.snapshot -> 'tasks') e)), '{}')
     where k.id = v_bk;

    delete from bingo_board_sync_backups
     where section_id = b.id
       and id not in (select id from bingo_board_sync_backups
                       where section_id = b.id order by created_at desc limit 5);
    out := out || res;
  end loop;
  return json_build_object('boards', coalesce(array_length(out, 1), 0), 'detail', to_json(out));
end;
$$;

-- ── 4. Preview: what a sync would change on one board ────────────────────
-- Per card: settings that differ (field, tenant's value, source's value),
-- which extras differ, and whether the card was edited in the app. Plus the
-- cards a sync would add. The unlock chain is not listed.
create or replace function public.preview_bingo_board_sync(p_target uuid, p_source uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  skip    text[] := array['id', 'section_id', 'owner_id', 'cloned_from', 'is_board_copy',
                          'created_at', 'prerequisite_task_id', 'tenant_edited_at'];
  strip   text[] := array['id', 'task_id', 'created_at', 'slot_id'];
  r       record;
  tj      jsonb;
  sj      jsonb;
  fields  jsonb;
  parts   jsonb;
  a       jsonb;
  b       jsonb;
  child   text;
  v_edit  boolean;
  changes jsonb := '[]'::jsonb;
  added   jsonb := '[]'::jsonb;
begin
  for r in
    select bc.slot, t.id as src_id, t.title as src_title,
           (select x.task_id from bingo_board_cards x
             where x.section_id = p_target and x.slot = bc.slot
             order by x.created_at limit 1) as tgt_id   -- a slot can hold two rows on old boards
      from bingo_board_cards bc join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_source
     order by bc.slot
  loop
    if r.tgt_id is null then
      added := added || jsonb_build_object('slot', r.slot, 'title', r.src_title);
      continue;
    end if;

    select to_jsonb(t) - skip, t.tenant_edited_at is not null into tj, v_edit
      from bingo_tasks t where t.id = r.tgt_id;
    select to_jsonb(t) - skip into sj from bingo_tasks t where t.id = r.src_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'field', e.key, 'from', left(tj ->> e.key, 120), 'to', left(sj ->> e.key, 120)) order by e.key), '[]')
      into fields
      from jsonb_each(sj) e
     where e.value is distinct from tj -> e.key;

    parts := '[]'::jsonb;
    foreach child in array array[
      'bingo_task_pages', 'bingo_task_photos', 'bingo_task_links', 'bingo_task_samples',
      'bingo_task_secrets', 'bingo_prize_secrets', 'bingo_breakout_puzzles',
      'bingo_draw_slots', 'bingo_draw_items']
    loop
      if to_regclass('public.' || child) is not null then
        execute format(
          'select coalesce(jsonb_agg(x order by x::text), ''[]'') from (select to_jsonb(c) - $2 as x from public.%I c where c.task_id::text = $1) q',
          child) into a using r.tgt_id::text, strip;
        execute format(
          'select coalesce(jsonb_agg(x order by x::text), ''[]'') from (select to_jsonb(c) - $2 as x from public.%I c where c.task_id::text = $1) q',
          child) into b using r.src_id::text, strip;
        if a <> b then
          parts := parts || jsonb_build_object(
            'part', child, 'from', jsonb_array_length(a), 'to', jsonb_array_length(b));
        end if;
      end if;
    end loop;

    if fields <> '[]'::jsonb or parts <> '[]'::jsonb then
      changes := changes || jsonb_build_object(
        'slot', r.slot, 'title', tj ->> 'title', 'edited', v_edit, 'fields', fields, 'parts', parts);
    end if;
  end loop;

  return jsonb_build_object('changes', changes, 'added', added);
end;
$$;

create or replace function public.owner_preview_account_sync(p_account uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare b record; out jsonb := '[]'::jsonb;
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  for b in
    select s.id, s.name, s.synced_from, a.email
      from bingo_sections s left join bingo_accounts a on a.id = s.owner_id
     where s.synced_from is not null and s.owner_id is not null
       and (p_account is null or s.owner_id = p_account)
     order by a.email, s.name
  loop
    out := out || (jsonb_build_object('board', b.id, 'name', b.name, 'email', b.email)
                   || public.preview_bingo_board_sync(b.id, b.synced_from));
  end loop;
  return json_build_object('boards', out);
end;
$$;

-- ── One-time: protect what already differs ───────────────────────────────
-- Edits made before this file ran left no marker. Until the first marker
-- exists, treat every given-board card that differs from its source as edited,
-- so the next sync keeps it unless the owner picks it.
do $$
declare b record;
begin
  if exists (select 1 from bingo_tasks where tenant_edited_at is not null) then return; end if;
  for b in select id, synced_from from bingo_sections where synced_from is not null and owner_id is not null loop
    update bingo_tasks t set tenant_edited_at = now()
      from bingo_board_cards bc
     where bc.section_id = b.id and t.id = bc.task_id
       and bc.slot in (select (c ->> 'slot')::int
                         from jsonb_array_elements(public.preview_bingo_board_sync(b.id, b.synced_from) -> 'changes') c);
  end loop;
end;
$$;

revoke execute on function public.sync_bingo_board(uuid, uuid, int[], boolean) from public, anon, authenticated;
revoke execute on function public.preview_bingo_board_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_sync_account_boards(uuid, jsonb, boolean) to authenticated;
grant execute on function public.owner_preview_account_sync(uuid) to authenticated;
notify pgrst, 'reload schema';
