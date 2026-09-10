-- ============================================================
-- 008a — remove dead tables and close the worst single policy.
-- Zero risk: nothing in the bingo-only codebase touches these.
-- ============================================================

-- Flag Retrieval + Shape Sequence leftovers. Each carried open anon
-- INSERT/UPDATE/DELETE policies, so dropping them removes ~20 wide-open
-- policies as well as the tables.
drop table if exists public.team_scans      cascade;
drop table if exists public.team_members    cascade;
drop table if exists public.task_photos     cascade;
drop table if exists public.task_links      cascade;
drop table if exists public.task_pages      cascade;
drop table if exists public.tasks           cascade;
drop table if exists public.teams           cascade;
drop table if exists public.shape_facilitators cascade;

-- bingo_award_configs was ALL / public / true / true — anyone with the
-- publishable key could rewrite any tenant's award ceremony.
drop policy if exists "award_configs_all" on public.bingo_award_configs;

create policy "read open" on public.bingo_award_configs
  for select using (true);

create policy "tenant write" on public.bingo_award_configs
  for all to authenticated
  using (exists (select 1 from public.bingo_sections s
                 where s.id = section_id and public.bingo_can_write(s.owner_id)))
  with check (exists (select 1 from public.bingo_sections s
                      where s.id = section_id and public.bingo_can_write(s.owner_id)));

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────
-- drop policy if exists "read open"    on public.bingo_award_configs;
-- drop policy if exists "tenant write" on public.bingo_award_configs;
-- create policy "award_configs_all" on public.bingo_award_configs
--   for all using (true) with check (true);
-- notify pgrst, 'reload schema';
