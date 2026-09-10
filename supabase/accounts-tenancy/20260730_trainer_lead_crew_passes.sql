-- ============================================================
-- Trainer leads can run their own crew
--
-- 20260729_facilitator_sessions.sql already lets an approved sub host a pass:
-- create_facilitator_session accepts p_host = auth.uid(), the table's RLS is
-- `is_bingo_owner() or host_id = auth.uid()`, and end_facilitator_session
-- accepts the host. What was missing was on the read side — a lead could not
-- see WHO had joined their own pass, because bingo_accounts only ever exposed
-- your own row (plus your host's, for facilitators).
--
-- This migration:
--   1. lets a host read the crew rows attached to them, so /bingo-dash/crew
--      can list the helpers on each pass by name;
--   2. tightens create_facilitator_session to approved accounts only, matching
--      the rule the UI already enforces (a pending signup should not be able
--      to mint passes via the RPC).
--
-- ADDITIVE: one policy replaced with a wider one, one function re-created with
-- a single extra guard. No table, column or trigger changes.
--
-- Run in the SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. A host can read their own crew ───────────────────────
-- `facilitator_host = auth.uid()` reads a column of the candidate row, not a
-- subquery on bingo_accounts, so this adds no RLS recursion.
drop policy if exists "read own, host, or owner-all" on public.bingo_accounts;
drop policy if exists "read own, host, crew, or owner-all" on public.bingo_accounts;
create policy "read own, host, crew, or owner-all" on public.bingo_accounts
  for select using (
    id = auth.uid()
    or public.is_bingo_owner()
    or id = public.my_facilitator_host()
    or facilitator_host = auth.uid()
  );

-- ── 2. Only approved accounts may issue passes ──────────────
-- Unchanged from 20260729 apart from the `status = 'approved'` guard.
create or replace function public.create_facilitator_session(
  p_label    text,
  p_host     uuid,
  p_hours    int default 12,
  p_max_uses int default null
)
returns public.bingo_facilitator_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  -- No 0/O/1/I — these get read aloud and typed on phones.
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  new_code text;
  me_row   record;
  host_row record;
  result   public.bingo_facilitator_sessions;
  i        int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- A pending or rejected account has no event to staff. The owner is exempt:
  -- the main account must never be able to lock itself out of its own passes
  -- on the strength of a status column it does not otherwise depend on.
  select * into me_row from bingo_accounts where id = auth.uid();
  if not public.is_bingo_owner() and (not found or me_row.status <> 'approved') then
    raise exception 'account is not approved';
  end if;

  -- Only the owner may issue passes for someone else's tenant.
  if p_host <> auth.uid() and not public.is_bingo_owner() then
    raise exception 'not allowed to create a pass for that host';
  end if;

  select * into host_row from bingo_accounts where id = p_host;
  if not found then
    raise exception 'host account not found';
  end if;
  -- A facilitator has no tenant of its own, so it cannot host a crew.
  if host_row.facilitator_host is not null then
    raise exception 'facilitators cannot host a session';
  end if;

  -- Collision is ~1 in a billion; loop anyway so a clash can never surface
  -- as a unique-violation on event day.
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_facilitator_sessions where code = new_code);
  end loop;

  insert into bingo_facilitator_sessions (code, pin, host_id, label, expires_at, max_uses, created_by)
  values (
    new_code,
    lpad(floor(random() * 10000)::int::text, 4, '0'),
    p_host,
    coalesce(nullif(trim(p_label), ''), 'Event session'),
    now() + make_interval(hours => greatest(1, coalesce(p_hours, 12))),
    case when p_max_uses is null or p_max_uses < 1 then null else p_max_uses end,
    auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.create_facilitator_session(text, uuid, int, int) to authenticated;

notify pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────
-- Re-run section 6 of 20260704_facilitators.sql and section 3 of
-- 20260729_facilitator_sessions.sql to restore the previous policy and
-- function, then:
-- drop policy if exists "read own, host, crew, or owner-all" on public.bingo_accounts;
-- notify pgrst, 'reload schema';
