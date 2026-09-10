-- ============================================================
-- Rental accounts, step 2/3: template board + deep clone on approval
-- Run AFTER 20260702_bingo_account_games.sql.
-- ADDITIVE ONLY — the clone trigger no-ops until the owner designates a
-- template board, so this is safe to run any time.
--
-- Column lists below were written against the app's schema
-- (src/types/database.ts + the supabase-migration-*.sql files). If the
-- live tables have drifted, the CREATE FUNCTION still succeeds but the
-- first clone call will error naming the missing column — fix there.
-- ============================================================

-- 1. Owner-designated template board (cloned for every newly approved account).
alter table public.bingo_settings
  add column if not exists template_section_id uuid references public.bingo_sections(id) on delete set null;

-- 2. Copy lineage for copy-on-use: which task a task was cloned from.
--    Lets the app reuse an existing copy instead of duplicating again.
alter table public.bingo_tasks
  add column if not exists cloned_from uuid references public.bingo_tasks(id) on delete set null;
create index if not exists bingo_tasks_cloned_from_idx on public.bingo_tasks(cloned_from);

-- 3. Deep clone: board + placed cards (with pages/photos/links) + grid slots
--    + categories/challenge sections + award config. The clone is fully
--    independent — no row references the template afterwards (cloned_from is
--    lineage metadata only, ON DELETE SET NULL).
create or replace function public.clone_bingo_board(p_template uuid, p_target_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_section uuid;
  r record;
  new_task uuid;
begin
  -- Board shell: fresh slug, marshal password reset, game not started,
  -- timer cleared. Everything else copied.
  insert into bingo_sections
        (name, slug, sort_order, owner_id,
         timer_seconds, timer_end_at, time_up_message, time_up_label, time_up_maps_url,
         marshal_password, photo_submissions_enabled, game_started,
         board_note, board_note_every)
  select name,
         slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
         0, p_target_owner,
         timer_seconds, null, time_up_message, time_up_label, time_up_maps_url,
         '1234', photo_submissions_enabled, false,
         board_note, board_note_every
    from bingo_sections
   where id = p_template
  returning id into new_section;

  if new_section is null then
    raise exception 'template board % not found', p_template;
  end if;

  -- Challenge sections + categories (library grouping), with id remapping.
  create temp table _cs_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from bingo_challenge_sections where game_section_id = p_template
  loop
    with ins as (
      insert into bingo_challenge_sections (game_section_id, name, sort_order)
      values (new_section, r.name, r.sort_order)
      returning id
    )
    insert into _cs_map select r.id, id from ins;
  end loop;

  insert into bingo_categories (section_id, challenge_section_id, name, sort_order)
  select new_section, m.new_id, c.name, c.sort_order
    from bingo_categories c
    left join _cs_map m on m.old_id = c.challenge_section_id
   where c.section_id = p_template;

  -- Cards placed on the template grid: deep copy each task + children,
  -- then place the copy on the same slot.
  for r in
    select bc.slot, t.*
      from bingo_board_cards bc
      join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_template
  loop
    insert into bingo_tasks
          (section_id, owner_id, cloned_from, title, color, hex_code, sort_order,
           in_grid, category, points, task_type, answer_question, answer_text,
           completion_warning, require_marshal, maps_url, maps_label)
    values (new_section, p_target_owner, r.id, r.title, r.color, r.hex_code, r.sort_order,
            r.in_grid, r.category, r.points, r.task_type, r.answer_question, r.answer_text,
            r.completion_warning, r.require_marshal, r.maps_url, r.maps_label)
    returning id into new_task;

    insert into bingo_task_pages
          (task_id, page_order, media_url, media_type,
           pointer_1, pointer_2, pointer_3, pointer_4, pointer_5, pointer_6,
           example_1, example_2, example_3, example_4, example_5, example_6,
           icon_1, icon_2, icon_3, icon_4, icon_5, icon_6)
    select new_task, page_order, media_url, media_type,
           pointer_1, pointer_2, pointer_3, pointer_4, pointer_5, pointer_6,
           example_1, example_2, example_3, example_4, example_5, example_6,
           icon_1, icon_2, icon_3, icon_4, icon_5, icon_6
      from bingo_task_pages where task_id = r.id;

    insert into bingo_task_photos (task_id, photo_url, photo_order, position_x, position_y, caption)
    select new_task, photo_url, photo_order, position_x, position_y, caption
      from bingo_task_photos where task_id = r.id;

    insert into bingo_task_links (task_id, label, url, sort_order)
    select new_task, label, url, sort_order
      from bingo_task_links where task_id = r.id;

    insert into bingo_board_cards (section_id, task_id, slot)
    values (new_section, new_task, r.slot);
  end loop;

  -- Award slides config (one row per board, if the template has one).
  insert into bingo_award_configs
        (section_id, total_points, image_url,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline)
  select new_section, total_points, image_url,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline
    from bingo_award_configs
   where section_id = p_template;

  drop table if exists _cs_map;
  return new_section;
end;
$$;

-- 4. Auto-provision on approval: the first time a sub account becomes
--    approved with bingo access and owns no boards yet, clone the template
--    and point their active board at it. No template designated -> no-op.
create or replace function public.handle_bingo_account_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if new.role = 'sub'
     and new.status = 'approved'
     and new.can_bingo
     and (old.status is distinct from 'approved' or old.can_bingo is distinct from new.can_bingo)
     and not exists (select 1 from bingo_sections where owner_id = new.id)
  then
    select template_section_id into tmpl from bingo_settings where id = 'main';
    if tmpl is not null then
      new_board := public.clone_bingo_board(tmpl, new.id);
      update bingo_accounts set active_section_id = new_board where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bingo_account_approved on public.bingo_accounts;
create trigger on_bingo_account_approved
  after update on public.bingo_accounts
  for each row execute function public.handle_bingo_account_approved();

-- 5. Owner-callable manual provisioning (accounts panel button), for
--    accounts approved before a template existed, or to hand out a fresh
--    copy later.
create or replace function public.admin_clone_template_for(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if not public.is_bingo_owner() then
    raise exception 'owner only';
  end if;
  select template_section_id into tmpl from bingo_settings where id = 'main';
  if tmpl is null then
    raise exception 'no template board designated';
  end if;
  new_board := public.clone_bingo_board(tmpl, p_target);
  update bingo_accounts
     set active_section_id = coalesce(active_section_id, new_board)
   where id = p_target;
  return new_board;
end;
$$;

notify pgrst, 'reload schema';
