-- Library cards are edited by the platform owner only.
--
-- Until now anyone who "owned" a card could change it, and that card is shared
-- by every board using it. From now on:
--
--   * the platform owner (is_bingo_owner) can edit or delete any card;
--   * a board's own copy (is_board_copy, see 20261008_board_card_fork.sql) can be
--     edited by whoever can write to that board;
--   * a card nobody has placed on a board yet is still a draft, so the person
--     who created it can build it up and delete it;
--   * once a card sits on a board, everyone else changes it only through that
--     board's own copy.
--
-- Creating cards and placing them on boards is unchanged.
-- Run after 20261008_board_card_fork.sql.

create or replace function public.bingo_can_edit_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner()
      or exists (
        select 1 from public.bingo_tasks t
         where t.id = p_task
           and public.bingo_can_write(t.owner_id)
           and (t.is_board_copy
                or not exists (select 1 from public.bingo_board_cards bc where bc.task_id = t.id))
      );
$$;

grant execute on function public.bingo_can_edit_task(uuid) to authenticated;

-- ── the card itself ──────────────────────────────────────────────────────
drop policy if exists "tenant update" on public.bingo_tasks;
create policy "tenant update" on public.bingo_tasks for update to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(id))
  with check (public.can_use_game('bingo') and public.bingo_can_write(owner_id));

drop policy if exists "tenant delete" on public.bingo_tasks;
create policy "tenant delete" on public.bingo_tasks for delete to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(id));

-- ── what hangs off a card: pages, photos, links, samples, passcode, bundles ─
drop policy if exists "tenant write" on public.bingo_task_pages;
create policy "tenant write" on public.bingo_task_pages for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

drop policy if exists "tenant write" on public.bingo_task_photos;
create policy "tenant write" on public.bingo_task_photos for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

drop policy if exists "tenant write" on public.bingo_task_links;
create policy "tenant write" on public.bingo_task_links for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

drop policy if exists "tenant write" on public.bingo_task_samples;
create policy "tenant write" on public.bingo_task_samples for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

drop policy if exists "tenant all" on public.bingo_task_secrets;
create policy "tenant all" on public.bingo_task_secrets for all to authenticated
  using (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id))
  with check (public.can_use_game('bingo') and public.bingo_can_edit_task(task_id));

drop policy if exists "tenant write" on public.bingo_bundle_items;
create policy "tenant write" on public.bingo_bundle_items for all to authenticated
  using (public.bingo_can_edit_task(bundle_id))
  with check (public.bingo_can_edit_task(bundle_id));

-- ── draws: these were writable by anyone (using (true)); reading stays open ─
drop policy if exists draw_slots_all on public.bingo_draw_slots;
drop policy if exists "read open" on public.bingo_draw_slots;
drop policy if exists "tenant write" on public.bingo_draw_slots;
create policy "read open" on public.bingo_draw_slots for select using (true);
create policy "tenant write" on public.bingo_draw_slots for all to authenticated
  using (public.bingo_can_edit_task(task_id)) with check (public.bingo_can_edit_task(task_id));

drop policy if exists draw_items_all on public.bingo_draw_items;
drop policy if exists "read open" on public.bingo_draw_items;
drop policy if exists "tenant write" on public.bingo_draw_items;
create policy "read open" on public.bingo_draw_items for select using (true);
create policy "tenant write" on public.bingo_draw_items for all to authenticated
  using (public.bingo_can_edit_task(task_id)) with check (public.bingo_can_edit_task(task_id));
