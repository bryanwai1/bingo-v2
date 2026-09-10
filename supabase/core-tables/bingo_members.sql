-- bingo_members: one row per player who joined a team. Created directly in
-- the Supabase dashboard (predates version control) — base columns below
-- are inferred from src/types/database.ts (BingoMember) since no CREATE
-- TABLE for this table exists in the migration history, only ALTERs.

create table public.bingo_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.bingo_teams(id) on delete cascade,
  section_id  uuid,
  name        text not null,
  password    text,
  created_at  timestamptz not null default now(),

  -- (tracked) media-photos/20260421_bingo_features.sql
  role        text not null default 'member'
    check (role in ('member', 'observer'))
);

create index bingo_members_team_idx on public.bingo_members(team_id);
create index bingo_members_section_idx on public.bingo_members(section_id);

alter table public.bingo_members enable row level security;

create policy "read open" on public.bingo_members for select using (true);
create policy "anon write" on public.bingo_members for insert to anon with check (true);
create policy "anon update" on public.bingo_members for update to anon using (true) with check (true);
create policy "anon delete" on public.bingo_members for delete to anon using (true);
create policy "tenant write" on public.bingo_members for all to authenticated
  using (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)))
  with check (public.can_use_game('bingo') and exists (
    select 1 from public.bingo_teams bt
    join public.bingo_sections s on s.id = bt.section_id
    where bt.id = team_id and public.bingo_can_write(s.owner_id)));

alter publication supabase_realtime add table public.bingo_members;

-- ============================================================================
-- NOT part of the live design — written by a migration that was never fully
-- deployed (the app-side "submit to team leader" flow was removed instead of
-- finished; see the commit that removed src/components/LeaderApprovalQueue.tsx).
-- role's CHECK constraint above was never widened to allow 'leader', so no row
-- can ever actually reach that state even if this trigger/function existed —
-- keep both DISABLED. Recorded here only so a from-scratch run reproduces the
-- exact (inert) live shape; safe to delete this whole block if you'd rather
-- not carry dead weight forward.
-- ============================================================================
-- create trigger on_member_join_claim_leader
--   before insert on public.bingo_members
--   for each row execute function public.claim_team_leader();
