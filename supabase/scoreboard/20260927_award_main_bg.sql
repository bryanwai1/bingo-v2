-- Main slide background colour, picked per board in the award admin.
--
-- Null keeps the HSBC red, so every existing board is unchanged. The app
-- validates the value as #rrggbb before putting it in a CSS gradient; this
-- column is deliberately plain text rather than a constrained domain, because
-- a bad value must not be able to block a save during a live ceremony - it
-- simply falls back to the default when rendered.

alter table public.bingo_award_configs
  add column if not exists main_bg text;

comment on column public.bingo_award_configs.main_bg is
  'Main award slide background as #rrggbb. Null = HSBC red default.';

-- clone_bingo_board copies award config by an explicit column list, so it must
-- learn about main_bg or every cloned board silently loses the colour. This is
-- also the auto-provision path behind handle_bingo_account_approved, so the
-- loss would not surface until a ceremony ran. Reproduced whole from
-- supabase/accounts-tenancy/functions.sql: `create or replace function`
-- cannot patch a single statement.

create or replace function public.clone_bingo_board(p_template uuid, p_target_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
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
        (section_id, total_points, image_url, award_slogan, slide_photos, main_bg,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline)
  select new_section, total_points, image_url, award_slogan, slide_photos, main_bg,
         consolation_count, consolation_group_count, third_count, second_count, first_count,
         slide_order, slide_points, holding_title, main_title, main_subtitle, main_tagline
    from bingo_award_configs
   where section_id = p_template;

  drop table if exists _cs_map;
  return new_section;
end;
$$;

-- PostgREST caches the schema; without this the client reports a baffling
-- "column does not exist" for a column that is plainly present.
notify pgrst, 'reload schema';
