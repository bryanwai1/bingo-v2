-- accounts-tenancy business logic. Run this file LAST in this folder — every
-- function here reads/writes tables defined in the other files in this
-- folder (bingo_accounts, bingo_events, bingo_library_*, bingo_facilitator_sessions)
-- plus bingo_sections/bingo_tasks/etc. from core-tables/. Postgres doesn't
-- validate a plpgsql function body's table/function references until it's
-- actually called, so the exact file order doesn't matter beyond "after the
-- tables"; this groups logically instead: identity → quotas → tenancy →
-- board lifecycle → events → library → facilitators.

-- ── Identity ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER so it can read bingo_accounts without tripping the
-- table's own RLS — avoids infinite recursion in policies.
create or replace function public.is_bingo_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and role = 'owner' and status = 'approved'
  );
$$;

create or replace function public.is_bingo_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bingo_accounts
    where id = auth.uid() and status = 'approved'
  );
$$;

-- Auto-creates a bingo_accounts row on signup; auto-approves the hardcoded
-- owner email, everyone else lands pending. Change the email below (or
-- promote manually) if your main login differs.
create or replace function public.handle_new_bingo_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_email constant text := 'bryanwai.design@gmail.com';
begin
  insert into public.bingo_accounts (id, email, role, status)
  values (
    new.id,
    new.email,
    case when lower(new.email) = lower(owner_email) then 'owner'    else 'sub'     end,
    case when lower(new.email) = lower(owner_email) then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Let a facilitator read their host's account row. SECURITY DEFINER avoids
-- RLS recursion inside the policy that calls it.
create or replace function public.my_facilitator_host()
returns uuid language sql stable security definer set search_path = public as $$
  select facilitator_host from public.bingo_accounts where id = auth.uid();
$$;

-- ── Quotas (triggers on bingo_sections / bingo_teams) ───────────────────

-- Enforced in a trigger rather than a policy: RLS cannot count sibling
-- rows cheaply, and a renter hitting the cap should get a clear message,
-- not a silent permission failure mid-event.
create or replace function public.enforce_board_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare acct record; n int;
begin
  if new.owner_id is null then return new; end if;      -- house board
  select * into acct from bingo_accounts where id = new.owner_id;
  if not found or acct.role = 'owner' then return new; end if;

  select count(*) into n from bingo_sections where owner_id = new.owner_id;
  if n >= acct.max_boards then
    raise exception 'BOARD_LIMIT_REACHED: your plan allows % board(s). Contact the organiser to raise it.', acct.max_boards;
  end if;
  return new;
end; $$;

create or replace function public.enforce_team_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare sec record; acct record; n int;
begin
  select * into sec from bingo_sections where id = new.section_id;
  if not found or sec.owner_id is null then return new; end if;
  select * into acct from bingo_accounts where id = sec.owner_id;
  if not found or acct.role = 'owner' then return new; end if;

  select count(*) into n from bingo_teams where section_id = new.section_id;
  if n >= acct.max_teams_per_board then
    raise exception 'TEAM_LIMIT_REACHED: this board allows % team(s).', acct.max_teams_per_board;
  end if;
  return new;
end; $$;

-- ── Renter self-service ──────────────────────────────────────────────────

-- A SECURITY DEFINER RPC, not a self-UPDATE policy: WITH CHECK cannot
-- compare old vs new, so a policy would let a renter flip their own
-- role/status/limits while "editing their profile".
create or replace function public.update_my_profile(
  p_company text default null,
  p_contact text default null,
  p_phone   text default null,
  p_display text default null
) returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update bingo_accounts set
    company_name = coalesce(nullif(trim(p_company), ''), company_name),
    contact_name = coalesce(nullif(trim(p_contact), ''), contact_name),
    phone        = coalesce(nullif(trim(p_phone),   ''), phone),
    display_name = coalesce(nullif(trim(p_display), ''), display_name)
  where id = auth.uid();
  return json_build_object('ok', true);
end; $$;

-- Owner-only: set a renter's plan and limits.
create or replace function public.set_account_plan(
  p_account uuid, p_plan text, p_max_boards int,
  p_max_teams int, p_expires timestamptz default null
) returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  update bingo_accounts set
    plan = coalesce(p_plan, plan),
    max_boards = greatest(1, coalesce(p_max_boards, max_boards)),
    max_teams_per_board = greatest(1, coalesce(p_max_teams, max_teams_per_board)),
    plan_expires_at = p_expires
  where id = p_account;
  return json_build_object('ok', true);
end; $$;

-- What a renter may see about their own account.
create or replace view public.my_account_summary as
select a.id, a.email, a.company_name, a.contact_name, a.phone,
       a.display_name, a.plan, a.max_boards, a.max_teams_per_board,
       a.plan_expires_at, a.status, a.role,
       (select count(*) from bingo_sections s where s.owner_id = a.id) as boards_used,
       (select count(*) from bingo_facilitator_sessions f
         where f.host_id = a.id and not f.revoked and f.expires_at > now()) as active_crew_passes
from bingo_accounts a
where a.id = auth.uid();

-- ── Tenancy ──────────────────────────────────────────────────────────────

-- Per-game access check (bingo/flag), used by RLS and mirrored by the UI
-- gate. Final version: expired accounts (access_expires_at) lose access —
-- this matters for facilitators, whose pass eventually runs out.
create or replace function public.can_use_game(g text)
returns boolean language sql stable security definer set search_path = public as $$
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

-- True when the current session may write a row owned by row_owner: the
-- owner writes everything; an approved-and-unexpired sub writes their own
-- rows, or (when facilitating) their host's rows.
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

-- Can this caller see this section? Owner sees everything; own tenant;
-- shared via an accepted event; or the board that's currently LIVE, since
-- anonymous players need it before they have any identity at all.
create or replace function public.can_read_section(p_section uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_bingo_owner()
    or exists (select 1 from bingo_sections s
                where s.id = p_section and public.bingo_can_write(s.owner_id))
    or p_section in (select public.shared_section_ids())
    or exists (select 1 from bingo_sections s
                where s.id = p_section and s.game_started)
    or exists (select 1 from bingo_settings g
                where g.id = 'main' and g.active_section_id = p_section);
$$;

-- ── Board lifecycle ──────────────────────────────────────────────────────

-- Moves the caller's active_section_id. Accepts facilitators (the board
-- must belong to the caller's WORKING tenant — the host's, when
-- facilitating). The owner's call also self-heals/updates the global
-- bingo_settings pointer the anonymous front door reads.
create or replace function public.set_active_board(p_section uuid)
returns void language plpgsql security definer set search_path = public as $$
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

  -- Owner-only: the global pointer the anonymous pages read. Upsert, not a
  -- bare update — the 'main' row must never be able to silently not exist.
  if public.is_bingo_owner() then
    insert into bingo_settings (id, active_section_id)
      values ('main', p_section)
    on conflict (id) do update set active_section_id = excluded.active_section_id;
  end if;
end;
$$;

-- Deep clone: board + placed cards (with pages/photos/links) + grid slots +
-- categories/challenge sections + award config. Fully independent afterward
-- — no row references the template (cloned_from is lineage metadata only,
-- ON DELETE SET NULL).
create or replace function public.clone_bingo_board(p_template uuid, p_target_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sec         record;
  r           record;
  s           record;
  new_section uuid := gen_random_uuid();
  new_task    uuid;
  v_slot      uuid;
  tmap        jsonb := '{}'::jsonb;   -- template task id (or its library original) -> new task id
  child       text[];
  new_ids     uuid[] := '{}';
begin
  select * into sec from bingo_sections where id = p_template;
  if not found then
    raise exception 'template board % not found', p_template;
  end if;

  -- Board shell: every setting is carried over (built from the row itself, so
  -- columns added later come along). Only what must be unique or is live game
  -- state changes: new id and slug, the new owner, game not started, timer off.
  insert into bingo_sections
    select (jsonb_populate_record(null::public.bingo_sections, to_jsonb(sec) || jsonb_build_object(
      'id', new_section,
      'slug', sec.slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
      'owner_id', p_target_owner,
      'sort_order', 0,
      'game_started', false,
      'timer_end_at', null,
      'created_at', now()
    ))).*;

  -- Challenge sections + categories (library grouping), with id remapping.
  create temp table _cs_map (old_id uuid, new_id uuid) on commit drop;
  for r in select * from bingo_challenge_sections where game_section_id = p_template
  loop
    v_slot := gen_random_uuid();
    insert into bingo_challenge_sections
      select (jsonb_populate_record(null::public.bingo_challenge_sections, to_jsonb(r) || jsonb_build_object(
        'id', v_slot, 'game_section_id', new_section, 'created_at', now()))).*;
    insert into _cs_map values (r.id, v_slot);
  end loop;

  for r in select * from bingo_categories where section_id = p_template
  loop
    insert into bingo_categories
      select (jsonb_populate_record(null::public.bingo_categories, to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'section_id', new_section,
        'challenge_section_id', (select new_id from _cs_map where old_id = r.challenge_section_id),
        'created_at', now()))).*;
  end loop;

  -- Cards placed on the grid: copy each task with every column (unlock chain,
  -- tile icon, card type, timers, answer blocks ...) plus its children, and
  -- place the copy on the same slot. The unlock chain is re-pointed below.
  for r in
    select bc.slot, t.*
      from bingo_board_cards bc
      join bingo_tasks t on t.id = bc.task_id
     where bc.section_id = p_template
  loop
    new_task := gen_random_uuid();
    insert into bingo_tasks
      select (jsonb_populate_record(null::public.bingo_tasks, to_jsonb(r) - 'slot' || jsonb_build_object(
        'id', new_task,
        'section_id', new_section,
        'owner_id', p_target_owner,
        -- Board-only copies: they belong to this board, are hidden from the
        -- account's Card Library, and are deleted with the board. (As library
        -- cards, every "Give board" left ~25 duplicates behind in the library,
        -- and deleting the board did not remove them.) No lineage to the
        -- template's card, which belongs to another account.
        'cloned_from', null,
        'is_board_copy', true,
        'created_at', now()
      ))).*;
    new_ids := new_ids || new_task;
    tmap := tmap || jsonb_build_object(r.id::text, new_task);
    if r.cloned_from is not null then
      tmap := tmap || jsonb_build_object(r.cloned_from::text, new_task);
    end if;
    -- a card's own id wins over another card's cloned_from
    tmap := tmap || jsonb_build_object(r.id::text, new_task);

    -- Children keyed by task_id; skipped quietly if this database lacks the table.
    foreach child slice 1 in array array[
      array['bingo_task_pages', 'task_id'],
      array['bingo_task_photos', 'task_id'],
      array['bingo_task_links', 'task_id'],
      array['bingo_task_samples', 'task_id'],
      array['bingo_task_secrets', 'task_id'],
      array['bingo_prize_secrets', 'task_id'],
      array['bingo_breakout_puzzles', 'task_id'],
      array['bingo_bundle_items', 'bundle_id']
    ]
    loop
      if to_regclass('public.' || child[1]) is not null then
        execute format(
          'insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(c) || jsonb_build_object(%2$L, gen_random_uuid(), %3$L, $1, %4$L, now()))).* from public.%1$I c where c.%3$I = $2',
          child[1], 'id', child[2], 'created_at')
        using new_task::text, r.id;
      end if;
    end loop;

    -- Draws: each slot gets a new id and its items follow it.
    if to_regclass('public.bingo_draw_slots') is not null then
      for s in select * from bingo_draw_slots where task_id = r.id loop
        v_slot := gen_random_uuid();
        insert into bingo_draw_slots
          select (jsonb_populate_record(null::public.bingo_draw_slots, to_jsonb(s) || jsonb_build_object(
            'id', v_slot, 'task_id', new_task, 'created_at', now()))).*;
        insert into bingo_draw_items
          select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
            'id', gen_random_uuid(), 'task_id', new_task, 'slot_id', v_slot, 'created_at', now()))).*
          from bingo_draw_items i where i.slot_id = s.id;
      end loop;
      insert into bingo_draw_items
        select (jsonb_populate_record(null::public.bingo_draw_items, to_jsonb(i) || jsonb_build_object(
          'id', gen_random_uuid(), 'task_id', new_task, 'created_at', now()))).*
        from bingo_draw_items i where i.task_id = r.id and i.slot_id is null;
    end if;

    insert into bingo_board_cards (section_id, task_id, slot)
    values (new_section, new_task, r.slot);
  end loop;

  -- Unlock chain: point each card at the COPY of the card it follows. A card
  -- whose predecessor is not on this board is no longer chained.
  update bingo_tasks t
     set prerequisite_task_id = nullif(tmap ->> t.prerequisite_task_id::text, '')::uuid
   where t.id = any (new_ids) and t.prerequisite_task_id is not null;

  -- Bundles keep their activities when the activity card is on this board.
  if to_regclass('public.bingo_bundle_items') is not null then
    update bingo_bundle_items b
       set activity_id = (tmap ->> b.activity_id::text)::uuid
     where b.bundle_id = any (new_ids) and tmap ? b.activity_id::text;
  end if;

  -- Award slides config (one row per board, if the template has one).
  for r in select * from bingo_award_configs where section_id = p_template
  loop
    insert into bingo_award_configs
      select (jsonb_populate_record(null::public.bingo_award_configs, to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(), 'section_id', new_section, 'created_at', now()))).*;
  end loop;

  drop table if exists _cs_map;
  return new_section;
end;
$$;

-- Auto-provisions a template-board clone the first time a sub is approved
-- with bingo access and owns no boards yet. Facilitators are excluded —
-- they work on the host's boards, not their own.
create or replace function public.handle_bingo_account_approved()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- Owner-callable manual provisioning (accounts panel button), for accounts
-- approved before a template existed, or to hand out a fresh copy later.
-- p_template is optional: omit it to use the designated default template.
drop function if exists public.admin_clone_template_for(uuid);
create or replace function public.admin_clone_template_for(p_target uuid, p_template uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if not public.is_bingo_owner() then
    raise exception 'owner only';
  end if;
  tmpl := p_template;
  if tmpl is null then
    select template_section_id into tmpl from bingo_settings where id = 'main';
  end if;
  if tmpl is null then
    raise exception 'no template board designated';
  end if;
  new_board := public.clone_bingo_board(tmpl, p_target);
  update bingo_accounts
     set active_section_id = coalesce(active_section_id, new_board)
   where id = p_target;
  return new_board;
end;
$$;

-- ── Shared events ────────────────────────────────────────────────────────

-- Events this caller has accepted.
create or replace function public.my_event_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select event_id from bingo_event_members
   where account_id = auth.uid() and status = 'accepted';
$$;

-- Sections visible to me through a shared event (never my own — those are
-- already covered by normal tenancy).
create or replace function public.shared_section_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select eb.section_id from bingo_event_boards eb
   where eb.event_id in (select public.my_event_ids());
$$;

create or replace function public.join_event(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into e from bingo_events where upper(code) = upper(trim(coalesce(p_code,'')));
  if not found  then raise exception 'INVALID_CODE'; end if;
  if e.archived then raise exception 'EVENT_ARCHIVED'; end if;

  insert into bingo_event_members (event_id, account_id, status, joined_at)
  values (e.id, auth.uid(), 'accepted', now())
  on conflict (event_id, account_id)
    do update set status = 'accepted', joined_at = now();

  return json_build_object('ok', true, 'event', e.id, 'name', e.name);
end; $$;

create or replace function public.create_event(p_name text)
returns public.bingo_events language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text; i int; r public.bingo_events;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_events where code = c);
  end loop;

  insert into bingo_events (name, code, created_by)
  values (coalesce(nullif(trim(p_name),''), 'Shared event'), c, auth.uid())
  returning * into r;

  insert into bingo_event_members (event_id, account_id, status, joined_at)
  values (r.id, auth.uid(), 'accepted', now());

  return r;
end; $$;

-- ── Shared card library ──────────────────────────────────────────────────

-- Copy a whole pack into a caller's board. Idempotent by title — pressing
-- Import twice must not double the library.
create or replace function public.import_library_pack(p_pack uuid, p_section uuid)
returns json language plpgsql security definer set search_path = public as $$
declare sec record; c record; n int := 0; skipped int := 0;
begin
  select * into sec from bingo_sections where id = p_section;
  if not found then raise exception 'BOARD_NOT_FOUND'; end if;
  if not (public.is_bingo_owner() or public.bingo_can_write(sec.owner_id)) then
    raise exception 'NOT_YOUR_BOARD';
  end if;

  for c in select * from bingo_library_cards where pack_id = p_pack order by sort_order
  loop
    if exists (select 1 from bingo_tasks t
               where t.section_id = p_section and lower(t.title) = lower(c.title)) then
      skipped := skipped + 1;
      continue;
    end if;
    insert into bingo_tasks (section_id, owner_id, title, color, hex_code, category,
                             points, sort_order, in_grid, task_type,
                             is_contest, contest_bonus, contest_game,
                             is_prize, prize_threshold)
    values (p_section, sec.owner_id, c.title, c.color, c.hex_code, c.category,
            c.points, c.sort_order, false, c.task_type,
            c.is_contest, c.contest_bonus, c.contest_game,
            coalesce(c.is_prize, false), coalesce(c.prize_threshold, 20));
    n := n + 1;
  end loop;

  return json_build_object('ok', true, 'created', n, 'skipped', skipped);
end; $$;

-- ── Facilitator sessions ─────────────────────────────────────────────────

-- Creates a pass (server-generated code + PIN). Final version: only
-- approved accounts may issue passes (the owner is exempt from its own
-- status column).
create or replace function public.create_facilitator_session(
  p_label    text,
  p_host     uuid,
  p_hours    int default 12,
  p_max_uses int default null
)
returns public.bingo_facilitator_sessions
language plpgsql security definer set search_path = public as $$
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

-- Public lookup for the join page. Never returns the PIN.
create or replace function public.facilitator_session_info(p_code text)
returns table (label text, host_label text, expires_at timestamptz, state text)
language plpgsql security definer set search_path = public as $$
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
      -- 'full' only for someone NOT already on this pass. A facilitator who
      -- is already attached has had their seat counted, so reporting 'full'
      -- walled them out of their own session on any pass that hit its cap —
      -- redeem_facilitator_session would have let them straight back in.
      when s.max_uses is not null and s.uses >= s.max_uses
           and not exists (select 1 from bingo_accounts a
                            where a.id = auth.uid()
                              and a.facilitator_session_id = s.id)
                                                            then 'full'
      else 'ok'
    end;
end;
$$;

-- Redeem: attach the caller as a facilitator on the host's tenant.
create or replace function public.redeem_facilitator_session(
  p_code text,
  p_pin  text,
  p_name text default null
)
returns json language plpgsql security definer set search_path = public as $$
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

-- End a session: revoke the pass AND cut everyone off now (not just new
-- joins — the crew who already joined get expired too).
create or replace function public.end_facilitator_session(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
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

  update bingo_accounts
     set access_expires_at = now()
   where facilitator_session_id = p_id;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

grant execute on function public.can_read_section(uuid) to anon, authenticated;
grant select on public.my_account_summary to authenticated;
grant execute on function public.update_my_profile(text,text,text,text) to authenticated;
grant execute on function public.set_account_plan(uuid,text,int,int,timestamptz) to authenticated;
grant select on public.event_scoreboard to authenticated;
grant execute on function public.join_event(text)   to authenticated;
grant execute on function public.create_event(text) to authenticated;
grant execute on function public.my_event_ids()     to authenticated;
grant execute on function public.shared_section_ids() to authenticated;
grant execute on function public.import_library_pack(uuid, uuid) to authenticated;
-- Called directly from the Accounts page ("Give default board"). Missing from
-- this file until 2026-09-25, so the button failed for anyone but a superuser.
grant execute on function public.admin_clone_template_for(uuid, uuid) to authenticated;
-- anon needs the two join-flow functions: the join page reads the session
-- before signing in, and supabase-js may still carry the anon role on the
-- first call after an anonymous sign-in.
grant execute on function public.facilitator_session_info(text)            to anon, authenticated;
grant execute on function public.redeem_facilitator_session(text, text, text) to anon, authenticated;
grant execute on function public.create_facilitator_session(text, uuid, int, int) to authenticated;
grant execute on function public.end_facilitator_session(uuid)             to authenticated;

-- ── Housekeeping (optional, run occasionally) ───────────────────────────
-- Anonymous crew logins accumulate in auth.users. Once a session is long
-- over, its accounts are dead weight — this clears accounts that expired
-- more than 7 days ago. Deleting the auth user cascades to bingo_accounts.
--
-- delete from auth.users u
--  using public.bingo_accounts a
--  where a.id = u.id
--    and a.facilitator_session_id is not null
--    and a.access_expires_at < now() - interval '7 days';
