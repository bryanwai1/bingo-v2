-- bingo_bundle_items: membership of a bundle tile (one card holding a set
-- of activities — the AI Team Building pack placed as one tile instead of
-- ten separate ones). Source: bundle-cards/013_bundle_cards.sql.
--
-- Scoring (decided with the owner): points are earned PER ACTIVITY, not
-- for the bundle as a whole — a team that finishes six of ten keeps the
-- six. Each activity is approved individually, either by a marshal on the
-- spot or by the host later in Submissions, so a team is never blocked
-- waiting for one approval before starting the next.

create table public.bingo_bundle_items (
  id           uuid primary key default gen_random_uuid(),
  bundle_id    uuid not null references public.bingo_tasks(id) on delete cascade,
  activity_id  uuid not null references public.bingo_tasks(id) on delete cascade,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (bundle_id, activity_id)
);

create index bingo_bundle_items_bundle_idx on public.bingo_bundle_items(bundle_id, sort_order);

alter table public.bingo_bundle_items enable row level security;

create policy "read open" on public.bingo_bundle_items for select using (true);
create policy "tenant write" on public.bingo_bundle_items for all to authenticated
  using (exists (select 1 from public.bingo_tasks t
                 where t.id = bundle_id and public.bingo_can_write(t.owner_id)))
  with check (exists (select 1 from public.bingo_tasks t
                 where t.id = bundle_id and public.bingo_can_write(t.owner_id)));

-- ── Seed: build the "AI Team Building (Full Set)" bundle from existing cards ──
-- Global pass — every board whose cards carry category = 'AI Team Building'.
do $$
declare sec uuid; b uuid; a record; i int := 0;
begin
  select section_id into sec from bingo_tasks
   where category = 'AI Team Building' limit 1;
  if sec is null then raise notice 'No AI Team Building cards found'; return; end if;

  select id into b from bingo_tasks where title = 'AI Team Building (Full Set)';
  if b is null then
    insert into bingo_tasks (section_id, title, color, hex_code, category, points,
                             sort_order, in_grid, task_type, require_marshal, is_bundle)
    values (sec, 'AI Team Building (Full Set)', 'AI Team Building', '#8b5cf6',
            'AI Team Building', 0, 0, true, 'standard', true, true)
    returning id into b;
  end if;

  for a in select id from bingo_tasks
            where category = 'AI Team Building' and id <> b and not is_bundle
            order by sort_order
  loop
    insert into bingo_bundle_items (bundle_id, activity_id, sort_order)
    values (b, a.id, i) on conflict do nothing;
    i := i + 1;
  end loop;
  raise notice 'Bundle has % activities', i;
end $$;

-- One-off, scoped separately (bundle-cards/016_kl_bundle_seed.sql): this
-- project has the same activity titles duplicated across two boards
-- ("Default" and "kl") — the global pass above only ever finds the first
-- board it hits, so the "kl" board needs its own explicit pass or it never
-- gets a bundle tile of its own.
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
