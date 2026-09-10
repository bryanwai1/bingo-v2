-- ============================================================
-- Rental accounts, step 1/3: per-account game toggles + active board
-- Run in the Supabase SQL editor BEFORE 20260702_bingo_template_clone.sql.
-- ADDITIVE ONLY — the deployed app keeps working unchanged until the
-- Phase B build ships. Safe to run any time.
-- ============================================================

-- 1. Game permissions + per-account active board pointer.
--    can_bingo defaults true (matches today's implicit behavior for
--    approved subs); can_flag is opt-in per account.
alter table public.bingo_accounts
  add column if not exists can_bingo boolean not null default true,
  add column if not exists can_flag  boolean not null default false,
  add column if not exists active_section_id uuid references public.bingo_sections(id) on delete set null;

update public.bingo_accounts set can_bingo = true, can_flag = true where role = 'owner';

-- 2. Per-game access check, used by RLS (Phase C) and mirrored by the UI gate.
create or replace function public.can_use_game(g text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid()
      and status = 'approved'
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- 3. Per-account active board. A SECURITY DEFINER RPC instead of a
--    self-UPDATE policy on bingo_accounts: WITH CHECK cannot compare old
--    vs new values, so a plain policy would let a sub flip their own
--    status/role while updating active_section_id.
--    The owner's call also updates the global bingo_settings pointer so
--    the anonymous home/registration/projector/sample pages keep working
--    as the owner's front door.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bingo_accounts where id = auth.uid() and status = 'approved'
  ) then
    raise exception 'not an approved account';
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and (s.owner_id = auth.uid() or (s.owner_id is null and public.is_bingo_owner()))
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

notify pgrst, 'reload schema';
