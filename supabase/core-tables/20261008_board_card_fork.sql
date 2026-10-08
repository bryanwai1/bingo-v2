-- Board-only card edits (copy-on-write).
--
-- A card is one bingo_tasks row shared by every board that places it. The first
-- time a BOARD edits a card, that board gets its own copy and its placement is
-- re-pointed to it, so the edit never reaches the library or other boards.
-- Until then the board keeps following the library card.
--
--   fork_card_for_board(placement)   -> id of the board's own copy (idempotent)
--   revert_board_copy(placement)     -> back to the library card, copy deleted
--
-- A copy has is_board_copy = true (hidden from the Card Library), section_id =
-- the board (so deleting the board deletes its copies) and cloned_from = the
-- library card. Teams' progress moves with the placement.
--
-- The copy is built from to_jsonb(row) rather than a column list, so every
-- column - including ones added later - is carried over.

alter table public.bingo_tasks
  add column if not exists is_board_copy boolean not null default false;

comment on column public.bingo_tasks.is_board_copy is 'True for a card copy owned by one board (made by fork_card_for_board). Hidden from the Card Library.';

create index if not exists bingo_tasks_board_copy_idx on public.bingo_tasks(section_id) where is_board_copy;

create or replace function public.fork_card_for_board(p_placement uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pl     record;
  sec    record;
  t      record;
  s      record;
  v_new  uuid := gen_random_uuid();
  v_slot uuid;
begin
  select id, section_id, task_id into pl from public.bingo_board_cards where id = p_placement;
  if not found then raise exception 'That box no longer exists.'; end if;

  select * into sec from public.bingo_sections where id = pl.section_id;
  if not (public.can_use_game('bingo') and public.bingo_can_write(sec.owner_id)) then
    raise exception 'You cannot edit this board.';
  end if;

  select * into t from public.bingo_tasks where id = pl.task_id;
  if not found then raise exception 'The card in this box no longer exists.'; end if;

  -- Already this board's own copy: nothing to do.
  if t.is_board_copy and t.section_id = pl.section_id then return t.id; end if;

  insert into public.bingo_tasks
    select (jsonb_populate_record(null::public.bingo_tasks, to_jsonb(t) || jsonb_build_object(
      'id', v_new,
      'section_id', pl.section_id,
      'owner_id', sec.owner_id,
      'cloned_from', case when t.is_board_copy then coalesce(t.cloned_from, t.id) else t.id end,
      'is_board_copy', true,
      'created_at', now()
    ))).*;

  -- Child rows keyed by task_id. 'id' and 'created_at' are ignored by tables that have no such column.
  insert into public.bingo_task_pages
    select (jsonb_populate_record(null::public.bingo_task_pages, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'created_at', now()))).*
    from public.bingo_task_pages c where c.task_id = t.id;
  insert into public.bingo_task_photos
    select (jsonb_populate_record(null::public.bingo_task_photos, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'created_at', now()))).*
    from public.bingo_task_photos c where c.task_id = t.id;
  insert into public.bingo_task_links
    select (jsonb_populate_record(null::public.bingo_task_links, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'created_at', now()))).*
    from public.bingo_task_links c where c.task_id = t.id;
  insert into public.bingo_task_samples
    select (jsonb_populate_record(null::public.bingo_task_samples, to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'created_at', now()))).*
    from public.bingo_task_samples c where c.task_id = t.id;
  insert into public.bingo_task_secrets
    select (jsonb_populate_record(null::public.bingo_task_secrets, to_jsonb(c) || jsonb_build_object('task_id', v_new, 'updated_at', now()))).*
    from public.bingo_task_secrets c where c.task_id = t.id;

  -- Draws: each slot gets a new id, and its items follow it.
  for s in select * from public.bingo_draw_slots where task_id = t.id loop
    v_slot := gen_random_uuid();
    insert into public.bingo_draw_slots
      select (jsonb_populate_record(null::public.bingo_draw_slots, to_jsonb(s) || jsonb_build_object('id', v_slot, 'task_id', v_new, 'created_at', now()))).*;
    insert into public.bingo_draw_items
      select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'slot_id', v_slot, 'created_at', now()))).*
      from public.bingo_draw_items i where i.slot_id = s.id;
  end loop;
  -- The card's flat bank (items with no slot).
  insert into public.bingo_draw_items
    select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'task_id', v_new, 'created_at', now()))).*
    from public.bingo_draw_items i where i.task_id = t.id and i.slot_id is null;

  -- A bundle keeps the same activities; only the membership is copied.
  if t.is_bundle then
    insert into public.bingo_bundle_items
      select (jsonb_populate_record(null::public.bingo_bundle_items, to_jsonb(b) || jsonb_build_object('id', gen_random_uuid(), 'bundle_id', v_new, 'created_at', now()))).*
      from public.bingo_bundle_items b where b.bundle_id = t.id;
  end if;

  -- Point the box at the copy and carry the teams' progress with it: scans of
  -- this box, plus older scans with no box that belong to this board's teams.
  update public.bingo_board_cards set task_id = v_new where id = p_placement;
  update public.bingo_scans
     set task_id = v_new
   where task_id = t.id
     and (board_card_id = p_placement
          or (board_card_id is null
              and team_id in (select id from public.bingo_teams where section_id = pl.section_id)));
  update public.bingo_photo_submissions
     set task_id = v_new
   where task_id = t.id
     and scan_id in (select id from public.bingo_scans where task_id = v_new);

  return v_new;
end $$;

-- Back to the library card: the box follows it again, the copy is deleted.
create or replace function public.revert_board_copy(p_placement uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pl   record;
  sec  record;
  t    record;
  orig uuid;
begin
  select id, section_id, task_id into pl from public.bingo_board_cards where id = p_placement;
  if not found then raise exception 'That box no longer exists.'; end if;

  select * into sec from public.bingo_sections where id = pl.section_id;
  if not (public.can_use_game('bingo') and public.bingo_can_write(sec.owner_id)) then
    raise exception 'You cannot edit this board.';
  end if;

  select * into t from public.bingo_tasks where id = pl.task_id;
  if not found then raise exception 'The card in this box no longer exists.'; end if;
  if not t.is_board_copy then return t.id; end if;

  orig := t.cloned_from;
  if orig is null or not exists (select 1 from public.bingo_tasks where id = orig) then
    raise exception 'The library card this was copied from no longer exists.';
  end if;

  update public.bingo_board_cards set task_id = orig where id = p_placement;

  -- Progress goes back too. A scan that would collide with one already on the
  -- library card stays behind and is removed with the copy.
  update public.bingo_scans s
     set task_id = orig
   where s.task_id = t.id
     and not exists (select 1 from public.bingo_scans x
                      where x.team_id = s.team_id and x.task_id = orig and x.board_card_key = s.board_card_key);
  update public.bingo_photo_submissions
     set task_id = orig
   where task_id = t.id
     and scan_id in (select id from public.bingo_scans where task_id = orig);

  delete from public.bingo_tasks where id = t.id;
  return orig;
end $$;

revoke all on function public.fork_card_for_board(uuid) from public, anon;
revoke all on function public.revert_board_copy(uuid) from public, anon;
grant execute on function public.fork_card_for_board(uuid) to authenticated;
grant execute on function public.revert_board_copy(uuid) to authenticated;
