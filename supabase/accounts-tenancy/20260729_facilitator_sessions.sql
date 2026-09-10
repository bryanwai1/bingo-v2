-- ============================================================
-- Facilitator SESSIONS — one shareable link + PIN per event
--
-- Problem this solves: a helper who signs up at /bingo-dash/login lands as a
-- pending SUB with their own tenant. Approving them clones the template into
-- THEIR account, so they see an empty board — no teams, no scans, no
-- scoreboard. The only correct path was the easy-to-miss "Make facilitator"
-- button, which also needed the helper to sign up first and the owner to be
-- at a laptop mid-event.
--
-- A facilitator session is a disposable event pass: the host creates one,
-- shares `/bingo-dash/join-crew/<code>` + a 4-digit PIN with the crew, and
-- each helper joins anonymously (no email, no sign-up, no approval) as a
-- facilitator ON THE HOST'S tenant until the pass expires.
--
-- Builds on 20260704_facilitators.sql: this only sets `facilitator_host` /
-- `access_expires_at`, so every RLS rule, expiry check and the no-clone guard
-- written there applies unchanged.
--
-- ADDITIVE: creates one new table, two columns and four functions. No
-- existing policy, function or trigger is modified.
--
-- ⚠️ PREREQUISITE — enable Anonymous sign-ins in the Supabase dashboard:
--    Authentication → Sign In / Providers → Anonymous sign-ins → ON.
--    Without it, /bingo-dash/join-crew returns "Anonymous sign-ins are
--    disabled" and no one can join.
--
-- Run in the SQL editor of project <YOUR-PROJECT-REF>.
-- ============================================================

-- ── 1. The pass ─────────────────────────────────────────────
create table if not exists public.bingo_facilitator_sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  pin         text not null,
  -- Whose tenant the crew works on. Owner host -> house rows (owner_id NULL),
  -- sub host -> that sub's rows. Mirrors bingo_accounts.facilitator_host.
  host_id     uuid not null references public.bingo_accounts(id) on delete cascade,
  label       text not null default 'Event session',
  expires_at  timestamptz not null,
  max_uses    int,                              -- NULL = unlimited seats
  uses        int not null default 0,
  revoked     boolean not null default false,
  created_by  uuid references public.bingo_accounts(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists bingo_fac_sessions_host_idx on public.bingo_facilitator_sessions(host_id);

alter table public.bingo_facilitator_sessions enable row level security;

-- The owner sees every pass; a sub host sees only their own. Players and
-- joining facilitators never read this table directly — they go through the
-- SECURITY DEFINER functions below, which never expose the PIN.
drop policy if exists "hosts manage own passes" on public.bingo_facilitator_sessions;
create policy "hosts manage own passes" on public.bingo_facilitator_sessions
  for all
  using (public.is_bingo_owner() or host_id = auth.uid())
  with check (public.is_bingo_owner() or host_id = auth.uid());

-- ── 2. Roster columns on the account ────────────────────────
alter table public.bingo_accounts
  add column if not exists display_name text,
  add column if not exists facilitator_session_id uuid
    references public.bingo_facilitator_sessions(id) on delete set null;

create index if not exists bingo_accounts_fac_session_idx
  on public.bingo_accounts(facilitator_session_id);

-- ── 3. Create a pass (server-generated code + PIN) ──────────
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
  host_row record;
  result   public.bingo_facilitator_sessions;
  i        int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
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

-- ── 4. Public lookup for the join page (never returns the PIN) ──
create or replace function public.facilitator_session_info(p_code text)
returns table (label text, host_label text, expires_at timestamptz, state text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s    record;
  host record;
begin
  select * into s from bingo_facilitator_sessions
   where upper(code) = upper(trim(coalesce(p_code, '')));

  if not found then
    return query select null::text, null::text, null::timestamptz, 'not_found'::text;
    return;
  end if;

  select * into host from bingo_accounts where id = s.host_id;

  return query select
    s.label,
    coalesce(host.display_name, host.email, 'the organiser'),
    s.expires_at,
    case
      when s.revoked                                        then 'revoked'
      when now() >= s.expires_at                            then 'expired'
      when s.max_uses is not null and s.uses >= s.max_uses  then 'full'
      else 'ok'
    end;
end;
$$;

-- ── 5. Redeem: attach the caller as a facilitator on the host ───
create or replace function public.redeem_facilitator_session(
  p_code text,
  p_pin  text,
  p_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  me       record;
  host     record;
  board    uuid;
  is_rejoin boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  select * into s from bingo_facilitator_sessions
   where upper(code) = upper(trim(coalesce(p_code, '')));
  if not found              then raise exception 'INVALID_CODE'; end if;
  if s.revoked              then raise exception 'REVOKED';      end if;
  if now() >= s.expires_at  then raise exception 'EXPIRED';      end if;
  if s.pin <> trim(coalesce(p_pin, '')) then raise exception 'BAD_PIN'; end if;

  select * into me from bingo_accounts where id = auth.uid();
  if not found then raise exception 'NO_ACCOUNT'; end if;

  -- Guard rails: joining a crew must never cost someone their own data.
  -- The owner would lose house access; an approved renter would have their
  -- tenant pointed at someone else's boards.
  if me.role = 'owner' then
    raise exception 'OWNER_CANNOT_JOIN';
  end if;
  if me.facilitator_host is null and me.status = 'approved' then
    raise exception 'ALREADY_TENANT';
  end if;

  -- Re-opening the link on the same device must not burn a second seat.
  is_rejoin := me.facilitator_session_id is not distinct from s.id;
  if s.max_uses is not null and not is_rejoin and s.uses >= s.max_uses then
    raise exception 'FULL';
  end if;

  -- Land the helper on whatever board the host is running right now, so the
  -- first thing they see is the live game rather than an empty picker.
  select * into host from bingo_accounts where id = s.host_id;
  if host.role = 'owner' then
    select active_section_id into board from bingo_settings where id = 'main';
  else
    board := host.active_section_id;
  end if;

  -- Setting facilitator_host in the SAME update keeps the approval trigger's
  -- `new.facilitator_host is null` guard false, so no template board is
  -- cloned for this account. That clone is exactly the bug being fixed.
  update bingo_accounts set
    facilitator_host       = s.host_id,
    facilitator_session_id = s.id,
    access_expires_at      = s.expires_at,
    status                 = 'approved',
    can_bingo              = true,
    can_flag               = true,
    display_name           = coalesce(nullif(trim(p_name), ''), display_name),
    -- Switching to a different host makes any previously selected board
    -- invisible to this account, so reset the pointer rather than leaving
    -- them staring at an empty admin.
    active_section_id      = case
                               when me.facilitator_host is distinct from s.host_id then board
                               else coalesce(active_section_id, board)
                             end
  where id = auth.uid();

  if not is_rejoin then
    update bingo_facilitator_sessions set uses = uses + 1 where id = s.id;
  end if;

  return json_build_object(
    'ok', true,
    'label', s.label,
    'expires_at', s.expires_at,
    'rejoined', is_rejoin
  );
end;
$$;

-- ── 6. End a session: revoke the pass AND cut everyone off now ──
create or replace function public.end_facilitator_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from bingo_facilitator_sessions where id = p_id;
  if not found then raise exception 'session not found'; end if;
  if not (public.is_bingo_owner() or s.host_id = auth.uid()) then
    raise exception 'not your session';
  end if;

  update bingo_facilitator_sessions
     set revoked = true, expires_at = now()
   where id = p_id;

  -- Expire the crew too — revoking the pass alone only stops NEW joins.
  update bingo_accounts
     set access_expires_at = now()
   where facilitator_session_id = p_id;
end;
$$;

-- ── 7. Grants ───────────────────────────────────────────────
-- anon needs the two join-flow functions: the join page reads the session
-- before signing in, and supabase-js may still carry the anon role on the
-- first call after an anonymous sign-in.
grant execute on function public.facilitator_session_info(text)            to anon, authenticated;
grant execute on function public.redeem_facilitator_session(text, text, text) to anon, authenticated;
grant execute on function public.create_facilitator_session(text, uuid, int, int) to authenticated;
grant execute on function public.end_facilitator_session(uuid)             to authenticated;

notify pgrst, 'reload schema';

-- ── Housekeeping (optional, run occasionally) ───────────────
-- Anonymous crew logins accumulate in auth.users. Once a session is long
-- over, its accounts are dead weight — this clears accounts that expired
-- more than 7 days ago. Deleting the auth user cascades to bingo_accounts.
--
-- delete from auth.users u
--  using public.bingo_accounts a
--  where a.id = u.id
--    and a.facilitator_session_id is not null
--    and a.access_expires_at < now() - interval '7 days';

-- ── Rollback ────────────────────────────────────────────────
-- drop function if exists public.end_facilitator_session(uuid);
-- drop function if exists public.redeem_facilitator_session(text, text, text);
-- drop function if exists public.facilitator_session_info(text);
-- drop function if exists public.create_facilitator_session(text, uuid, int, int);
-- alter table public.bingo_accounts drop column if exists facilitator_session_id;
-- alter table public.bingo_accounts drop column if exists display_name;
-- drop table if exists public.bingo_facilitator_sessions;
-- notify pgrst, 'reload schema';
