-- "Give board" / template clone that produces EXACTLY the same board.
--
-- The old clone_bingo_board copied a fixed list of columns, so a cloned board
-- lost the unlock chain (prerequisite_task_id), tile icons, card types,
-- bonus timers, answer blocks, glow, tile display, theme and more - and a
-- copied card still pointed at the TEMPLATE's card as its prerequisite.
--
-- This version copies whole rows (so future columns come along), copies every
-- child table that exists, and re-points the unlock chain at the new cards.
-- Teams, scans and game progress are not copied; the new board starts not
-- started with the timer off.
--
-- Run in Supabase -> SQL Editor. Safe to run more than once.

create or replace function public.clone_bingo_board(p_template uuid, p_target_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sec         record;
  r           record;
  s           record;
  new_section uuid := gen_random_uuid();
  new_task    uuid;
  v_slot      uuid;
  tmap        jsonb := '{}'::jsonb;   -- template task id (or its library original) -> new task id
  child       text[];
  new_ids     uuid[] := '{}';
begin
  select * into sec from bingo_sections where id = p_template;
  if not found then
    raise exception 'template board % not found', p_template;
  end if;

  -- Board shell: every setting is carried over (built from the row itself, so
  -- columns added later come along). Only what must be unique or is live game
  -- state changes: new id and slug, the new owner, game not started, timer off.
  insert into bingo_sections
    select (jsonb_populate_record(null::public.bingo_sections, to_jsonb(sec) || jsonb_build_object(
      'id', new_section,
      'slug', sec.slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
      'owner_id', p_target_owner,
      'sort_order', 0,
      'game_started', false,
      'timer_end_at', null,
      'created_at', now()
    ))).*;

  -- Challenge sections + categories (library grouping), with id remapping.
  create temp table _cs_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from bingo_challenge_sections where game_section_id = p_template
  loop
    v_slot := gen_random_uuid();
    insert into bingo_challenge_sections
      select (jsonb_populate_record(null::public.bingo_challenge_sections, to_jsonb(r) || jsonb_build_object(
        'id', v_slot, 'game_section_id', new_section, 'created_at', now()))).*;
    insert into _cs_map values (r.id, v_slot);
  end loop;

  for r in select * from bingo_categories where section_id = p_template
  loop
    insert into bingo_categories
      select (jsonb_populate_record(null::public.bingo_categories, to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'section_id', new_section,
        'challenge_section_id', (select new_id from _cs_map where old_id = r.challenge_section_id),
        'created_at', now()))).*;
  end loop;

  -- Cards placed on the grid: copy each task with every column (unlock chain,
  -- tile icon, card type, timers, answer blocks ...) plus its children, and
  -- place the copy on the same slot. The unlock chain is re-pointed below.
  for r in
    select bc.slot, t.*
      from bingo_board_cards bc
      join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_template
  loop
    new_task := gen_random_uuid();
    insert into bingo_tasks
      select (jsonb_populate_record(null::public.bingo_tasks, to_jsonb(r) - 'slot' || jsonb_build_object(
        'id', new_task,
        'section_id', new_section,
        'owner_id', p_target_owner,
        -- Board-only copies: they belong to this board, are hidden from the
        -- account's Card Library, and are deleted with the board. (As library
        -- cards, every "Give board" left ~25 duplicates behind in the library,
        -- and deleting the board did not remove them.) No lineage to the
        -- template's card, which belongs to another account.
        'cloned_from', null,
        'is_board_copy', true,
        'created_at', now()
      ))).*;
    new_ids := new_ids || new_task;
    tmap := tmap || jsonb_build_object(r.id::text, new_task);
    if r.cloned_from is not null then
      tmap := tmap || jsonb_build_object(r.cloned_from::text, new_task);
    end if;
    -- a card's own id wins over another card's cloned_from
    tmap := tmap || jsonb_build_object(r.id::text, new_task);

    -- Children keyed by task_id; skipped quietly if this database lacks the table.
    foreach child slice 1 in array array[
      array['bingo_task_pages', 'task_id'],
      array['bingo_task_photos', 'task_id'],
      array['bingo_task_links', 'task_id'],
      array['bingo_task_samples', 'task_id'],
      array['bingo_task_secrets', 'task_id'],
      array['bingo_breakout_puzzles', 'task_id'],
      array['bingo_bundle_items', 'bundle_id']
    ]
    loop
      if to_regclass('public.' || child[1]) is not null then
        execute format(
          'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(c) || jsonb_build_object(%2$L, gen_random_uuid(), %3$L, $1, %4$L, now()))).* from public.%1$I c where c.%3$I = $2',
          child[1], 'id', child[2], 'created_at')
        using new_task::text, r.id;
      end if;
    end loop;

    -- Draws: each slot gets a new id and its items follow it.
    if to_regclass('public.bingo_draw_slots') is not null then
      for s in select * from bingo_draw_slots where task_id = r.id loop
        v_slot := gen_random_uuid();
        insert into bingo_draw_slots
          select (jsonb_populate_record(null::public.bingo_draw_slots, to_jsonb(s) || jsonb_build_object(
            'id', v_slot, 'task_id', new_task, 'created_at', now()))).*;
        insert into bingo_draw_items
          select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
            'id', gen_random_uuid(), 'task_id', new_task, 'slot_id', v_slot, 'created_at', now()))).*
          from bingo_draw_items i where i.slot_id = s.id;
      end loop;
      insert into bingo_draw_items
        select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
          'id', gen_random_uuid(), 'task_id', new_task, 'created_at', now()))).*
        from bingo_draw_items i where i.task_id = r.id and i.slot_id is null;
    end if;

    insert into bingo_board_cards (section_id, task_id, slot)
    values (new_section, new_task, r.slot);
  end loop;

  -- Unlock chain: point each card at the COPY of the card it follows. A card
  -- whose predecessor is not on this board is no longer chained.
  update bingo_tasks t
     set prerequisite_task_id = nullif(tmap ->> t.prerequisite_task_id::text, '')::uuid
   where t.id = any (new_ids) and t.prerequisite_task_id is not null;

  -- Bundles keep their activities when the activity card is on this board.
  if to_regclass('public.bingo_bundle_items') is not null then
    update bingo_bundle_items b
       set activity_id = (tmap ->> b.activity_id::text)::uuid
     where b.bundle_id = any (new_ids) and tmap ? b.activity_id::text;
  end if;

  -- Award slides config (one row per board, if the template has one).
  for r in select * from bingo_award_configs where section_id = p_template
  loop
    insert into bingo_award_configs
      select (jsonb_populate_record(null::public.bingo_award_configs, to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(), 'section_id', new_section, 'created_at', now()))).*;
  end loop;

  drop table if exists _cs_map;
  return new_section;
end;
$$;

notify pgrst, 'reload schema';
