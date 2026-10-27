-- Owner only: publish a board's own copy of a card back onto the library card.
--
--   push_board_copy_to_library(placement) -> id of the library card
--
-- The library card (bingo_tasks.cloned_from of the copy) takes the copy's
-- settings, instruction pages, photos, links, samples, passcode, draws and
-- bundle membership. Every board that still follows the library card sees the
-- change. The board's own copy is left as it is, so this board is unchanged.
--
-- Only the platform owner may call it (is_bingo_owner), checked here as well as
-- hidden in the app. Run once in the Supabase SQL editor.

create or replace function public.push_board_copy_to_library(p_placement uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pl     record;
  cp     record;
  lib    record;
  s      record;
  v_slot uuid;
  v_cols text;
begin
  if not public.is_bingo_owner() then
    raise exception 'Only the owner can update the library card.';
  end if;

  select id, section_id, task_id into pl from public.bingo_board_cards where id = p_placement;
  if not found then raise exception 'That box no longer exists.'; end if;

  select * into cp from public.bingo_tasks where id = pl.task_id;
  if not found then raise exception 'The card in this box no longer exists.'; end if;
  if not cp.is_board_copy or cp.cloned_from is null then
    raise exception 'This card is already the library card.';
  end if;

  select * into lib from public.bingo_tasks where id = cp.cloned_from;
  if not found then raise exception 'The library card this was copied from no longer exists.'; end if;

  -- The card's own settings. Identity, placement and ownership stay the library's.
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'bingo_tasks'
     and column_name not in ('id', 'section_id', 'owner_id', 'cloned_from', 'is_board_copy',
                             'created_at', 'in_grid', 'sort_order');
  execute format(
    'update public.bingo_tasks l set (%1$s) = (select %1$s from jsonb_populate_record(null::public.bingo_tasks, $1) r) where l.id = $2',
    v_cols)
    using to_jsonb(cp), lib.id;

  -- Child rows: replace the library's with the copy's.
  delete from public.bingo_task_pages   where task_id = lib.id;
  delete from public.bingo_task_photos  where task_id = lib.id;
  delete from public.bingo_task_links   where task_id = lib.id;
  delete from public.bingo_task_samples where task_id = lib.id;
  delete from public.bingo_task_secrets where task_id = lib.id;
  delete from public.bingo_draw_items   where task_id = lib.id;
  delete from public.bingo_draw_slots   where task_id = lib.id;

  insert into public.bingo_task_pages
    select (jsonb_populate_record(null::public.bingo_task_pages, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'created_at', now()))).*
    from public.bingo_task_pages c where c.task_id = cp.id;
  insert into public.bingo_task_photos
    select (jsonb_populate_record(null::public.bingo_task_photos, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'created_at', now()))).*
    from public.bingo_task_photos c where c.task_id = cp.id;
  insert into public.bingo_task_links
    select (jsonb_populate_record(null::public.bingo_task_links, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'created_at', now()))).*
    from public.bingo_task_links c where c.task_id = cp.id;
  insert into public.bingo_task_samples
    select (jsonb_populate_record(null::public.bingo_task_samples, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'created_at', now()))).*
    from public.bingo_task_samples c where c.task_id = cp.id;
  insert into public.bingo_task_secrets
    select (jsonb_populate_record(null::public.bingo_task_secrets, to_jsonb(c) || jsonb_build_object('task_id', lib.id, 'updated_at', now()))).*
    from public.bingo_task_secrets c where c.task_id = cp.id;

  for s in select * from public.bingo_draw_slots where task_id = cp.id loop
    v_slot := gen_random_uuid();
    insert into public.bingo_draw_slots
      select (jsonb_populate_record(null::public.bingo_draw_slots, to_jsonb(s) || jsonb_build_object('id', v_slot, 'task_id', lib.id, 'created_at', now()))).*;
    insert into public.bingo_draw_items
      select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'slot_id', v_slot, 'created_at', now()))).*
      from public.bingo_draw_items i where i.slot_id = s.id;
  end loop;
  insert into public.bingo_draw_items
    select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'task_id', lib.id, 'created_at', now()))).*
    from public.bingo_draw_items i where i.task_id = cp.id and i.slot_id is null;

  if cp.is_bundle then
    delete from public.bingo_bundle_items where bundle_id = lib.id;
    insert into public.bingo_bundle_items
      select (jsonb_populate_record(null::public.bingo_bundle_items, to_jsonb(b) || jsonb_build_object('id', gen_random_uuid(), 'bundle_id', lib.id, 'created_at', now()))).*
      from public.bingo_bundle_items b where b.bundle_id = cp.id;
  end if;

  return lib.id;
end $$;

revoke all on function public.push_board_copy_to_library(uuid) from public, anon;
grant execute on function public.push_board_copy_to_library(uuid) to authenticated;
