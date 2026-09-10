-- ============================================================
-- bingo_settings: guarantee the 'main' row exists
--
-- Symptom: every admin / home / projector load logged a 406 from
--   GET /rest/v1/bingo_settings?select=*&id=eq.main
--   {"code":"PGRST116","details":"The result contains 0 rows"}
-- because bingo_settings was empty — the singleton row was never seeded on
-- this database.
--
-- The real damage was quieter than the console noise: set_active_board()
-- moves the owner's global pointer with
--   update bingo_settings set active_section_id = p_section where id = 'main'
-- which matched zero rows, so "Set live" appeared to work while the
-- anonymous front door (/bingo-dash, the projector, the sample board) still
-- had no active board to read.
--
-- Safe to run more than once, and safe on an event day: it adds a row and
-- redefines one function, touching no existing data.
-- ============================================================

-- ── 1. Seed the singleton ───────────────────────────────────
-- Every column carries a default, so the id alone is enough.
insert into public.bingo_settings (id) values ('main')
on conflict (id) do nothing;

-- ── 2. Make the owner pointer write self-healing ────────────
-- Identical to the 20260704_facilitators.sql version except for the final
-- block: an upsert instead of a bare update, so a missing row can never
-- silently swallow the write again.
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

  -- Owner-only: the global pointer the anonymous pages read.
  if public.is_bingo_owner() then
    insert into bingo_settings (id, active_section_id)
      values ('main', p_section)
    on conflict (id) do update set active_section_id = excluded.active_section_id;
  end if;
end;
$$;

-- Verify after running:
--   select * from public.bingo_settings;              -- exactly one 'main' row
--   -- then press "Set live" in the admin and re-check active_section_id
