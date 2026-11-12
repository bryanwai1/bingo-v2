-- Keep a given board in step with the board it was copied from, without giving
-- the tenant a new board (their teams, scans and scores are kept).
--
-- A given board remembers its source in bingo_sections.synced_from. Syncing
-- matches cards BY SLOT and updates the tenant's existing cards in place (same
-- ids, so every scan and score stays attached), so it carries over:
--   card content and settings (title, colour, icon, points, type, timers,
--   answers ...), instruction pages, photos, links, samples, secrets, puzzles,
--   draws, the unlock chain, categories and the board's display settings.
-- It adds source cards the tenant lacks. It does NOT delete anything, and it
-- never touches teams, scans, scores, the board name/slug/password or whether
-- the game has started.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

alter table public.bingo_sections
  add column if not exists synced_from uuid references public.bingo_sections(id) on delete set null;

-- ── Core: sync one board from its source ─────────────────────────────────
create or replace function public.sync_bingo_board(p_target uuid, p_source uuid)
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
     and column_name not in ('id', 'section_id', 'owner_id', 'cloned_from',
                             'is_board_copy', 'created_at', 'prerequisite_task_id');

  for r in
    select bc.slot, t.id as src_id, t.cloned_from as src_cloned_from
      from bingo_board_cards bc join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_source
     order by bc.slot
  loop
    select bc.task_id into tcard from bingo_board_cards bc where bc.section_id = p_target and bc.slot = r.slot;

    if tcard is not null then
      execute format(
        'update public.bingo_tasks t set (%1$s) = (select %1$s from public.bingo_tasks s where s.id = $1) where t.id = $2',
        cols) using r.src_id, tcard;
      n_updated := n_updated + 1;
    else
      -- A card the tenant does not have yet: add a board-only copy on the slot.
      new_task := gen_random_uuid();
      insert into bingo_tasks
        select (jsonb_populate_record(null::public.bingo_tasks, to_jsonb(t) || jsonb_build_object(
          'id', new_task, 'section_id', p_target, 'owner_id', tgt.owner_id,
          'cloned_from', null, 'is_board_copy', true, 'created_at', now()))).*
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
  select string_agg(quote_ident(column_name), ', ') into shell_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bingo_sections'
     and column_name in ('scoreboard_theme', 'default_bonus_full_minutes', 'default_bonus_timer_minutes', 'card_pauses');
  if shell_cols is not null then
    execute format('update public.bingo_sections t set (%1$s) = (select %1$s from public.bingo_sections s where s.id = $1) where t.id = $2',
                   shell_cols) using p_source, p_target;
  end if;

  update bingo_sections set synced_from = p_source where id = p_target;
  return json_build_object('board', p_target, 'updated', n_updated, 'added', n_added);
end;
$$;

-- ── Owner: sync every board given to one account (or to all accounts) ─────
create or replace function public.owner_sync_account_boards(p_account uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare b record; res json; out json[] := '{}';
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  for b in
    select id, synced_from from bingo_sections
     where synced_from is not null and owner_id is not null
       and (p_account is null or owner_id = p_account)
  loop
    res := public.sync_bingo_board(b.id, b.synced_from);
    out := out || res;
  end loop;
  return json_build_object('boards', coalesce(array_length(out, 1), 0), 'detail', to_json(out));
end;
$$;

grant execute on function public.owner_sync_account_boards(uuid) to authenticated;
revoke execute on function public.sync_bingo_board(uuid, uuid) from public, anon, authenticated;

-- ── From now on, a given board remembers where it came from ──────────────
create or replace function public.admin_clone_template_for(p_target uuid, p_template uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if not public.is_bingo_owner() then
    raise exception 'owner only';
  end if;
  tmpl := p_template;
  if tmpl is null then
    select template_section_id into tmpl from bingo_settings where id = 'main';
  end if;
  if tmpl is null then
    raise exception 'no template board designated';
  end if;
  new_board := public.clone_bingo_board(tmpl, p_target);
  update bingo_sections set synced_from = tmpl where id = new_board;
  update bingo_accounts
     set active_section_id = coalesce(active_section_id, new_board)
   where id = p_target;
  return new_board;
end;
$$;

grant execute on function public.admin_clone_template_for(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
