-- ============================================================
-- Facilitator logins: temporary event helpers working ON a host's data
--
-- A facilitator is a bingo_accounts row with facilitator_host set. They get
-- full admin powers over the HOST's tenant (host = owner -> house data,
-- owner_id NULL; host = sub -> that sub's rows) until access_expires_at.
-- They never own data of their own and never get a template board clone.
--
-- ADDITIVE + safe to run before the app deploy: with no facilitator rows,
-- every rewritten function behaves exactly as before (the extra expiry
-- check is NULL -> passes for all existing accounts).
-- Run in the Supabase SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. Columns ──────────────────────────────────────────────
alter table public.bingo_accounts
  add column if not exists facilitator_host uuid references public.bingo_accounts(id) on delete cascade,
  add column if not exists access_expires_at timestamptz;

-- ── 2. can_use_game: expired accounts lose game access ──────
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
      and (access_expires_at is null or now() < access_expires_at)
      and (role = 'owner'
           or (g = 'bingo' and can_bingo)
           or (g = 'flag'  and can_flag))
  );
$$;

-- ── 3. bingo_can_write: owner passes; else approved + unexpired AND
--       (own rows OR the host tenant's rows when facilitating).
--       The approved/unexpired check matters here (not just in
--       can_use_game) because the `settings` policy uses bingo_can_write
--       alone.
create or replace function public.bingo_can_write(row_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_bingo_owner()
    or exists (
      select 1 from public.bingo_accounts a
      where a.id = auth.uid()
        and a.status = 'approved'
        and (a.access_expires_at is null or now() < a.access_expires_at)
        and (
          row_owner = a.id
          or exists (
            select 1 from public.bingo_accounts h
            where h.id = a.facilitator_host
              and ((h.role = 'owner' and row_owner is null)
                or (h.role <> 'owner' and row_owner = h.id))
          )
        )
    );
$$;

-- ── 4. set_active_board: accept facilitators. The board must belong to
--       the caller's WORKING tenant (host tenant when facilitating). Only
--       the caller's own active_section_id moves; the global
--       bingo_settings pointer stays owner-only.
create or replace function public.set_active_board(p_section uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acct record;
  host_role text;
  tenant_owner uuid;  -- effective tenant: NULL = house (owner) data
begin
  select * into acct from bingo_accounts
   where id = auth.uid()
     and status = 'approved'
     and (access_expires_at is null or now() < access_expires_at);
  if not found then
    raise exception 'not an approved account';
  end if;

  if acct.facilitator_host is not null then
    select role into host_role from bingo_accounts where id = acct.facilitator_host;
    if host_role = 'owner' then
      tenant_owner := null;
    else
      tenant_owner := acct.facilitator_host;
    end if;
  elsif acct.role = 'owner' then
    tenant_owner := null;
  else
    tenant_owner := acct.id;
  end if;

  if not exists (
    select 1 from bingo_sections s
    where s.id = p_section
      and ((tenant_owner is null and s.owner_id is null)
        or s.owner_id = tenant_owner)
  ) then
    raise exception 'not your board';
  end if;

  update bingo_accounts set active_section_id = p_section where id = auth.uid();

  if public.is_bingo_owner() then
    update bingo_settings set active_section_id = p_section where id = 'main';
  end if;
end;
$$;

-- ── 5. Approval clone trigger: facilitators never get a template clone —
--       they work on the host's boards, not their own.
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
     and new.facilitator_host is null
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

-- ── 6. Let a facilitator read their host's account row ──────
-- SECURITY DEFINER helper avoids RLS recursion inside the policy.
create or replace function public.my_facilitator_host()
returns uuid language sql stable security definer set search_path = public as $$
  select facilitator_host from public.bingo_accounts where id = auth.uid();
$$;

drop policy if exists "read own or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
create policy "read own, host, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
  );

notify pgrst, 'reload schema';
