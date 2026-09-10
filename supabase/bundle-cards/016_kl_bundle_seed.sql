-- One-off: create the "AI Team Building (Full Set)" bundle tile on the "kl"
-- board and wire up its 4 existing activities (Nerf Prompt Cups, Roulette
-- Jingle & Dance Off, Retro Game Speed Build, Random Card Cinematic).
--
-- Scoped to this one section explicitly (rather than the global loop in
-- 013_bundle_cards.sql) because this project has the same activity titles
-- duplicated across two boards ("Default" and "kl") — a global loop would
-- mix cards from both into one bundle.

do $$
declare sec uuid := '77ff1b09-b803-42a2-ab36-246d3a40732d'; -- "kl" board
        b uuid; a record; i int := 0;
begin
  select id into b from bingo_tasks
   where title = 'AI Team Building (Full Set)' and section_id = sec;
  if b is null then
    insert into bingo_tasks (section_id, title, color, hex_code, category, points,
                             sort_order, in_grid, task_type, require_marshal, is_bundle)
    values (sec, 'AI Team Building (Full Set)', 'AI Team Building', '#8b5cf6',
            'AI Team Building', 0, 0, true, 'standard', true, true)
    returning id into b;
  end if;

  for a in select id from bingo_tasks
            where section_id = sec and category = 'AI Team Building' and id <> b and not is_bundle
            order by sort_order
  loop
    insert into bingo_bundle_items (bundle_id, activity_id, sort_order)
    values (b, a.id, i) on conflict do nothing;
    i := i + 1;
  end loop;
  raise notice 'kl bundle has % activities', i;
end $$;

notify pgrst, 'reload schema';
