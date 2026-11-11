-- Catch-up for a database that never got 007_renter_accounts.sql.
-- Symptom: "Could not find the function public.set_account_plan(...)" and
-- "column bingo_accounts.plan does not exist". Safe to run more than once.
-- Run in Supabase -> SQL Editor on project tetbxjqhfsoipwdnbetm.

alter table public.bingo_accounts
  add column if not exists company_name        text,
  add column if not exists contact_name        text,
  add column if not exists phone               text,
  add column if not exists plan                text not null default 'trial',
  add column if not exists max_boards          int  not null default 3,
  add column if not exists max_teams_per_board int  not null default 20,
  add column if not exists plan_expires_at     timestamptz,
  add column if not exists owner_notes         text;

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

create or replace view public.my_account_summary as
select a.id, a.email, a.company_name, a.contact_name, a.phone,
       a.display_name, a.plan, a.max_boards, a.max_teams_per_board,
       a.plan_expires_at, a.status, a.role,
       (select count(*) from bingo_sections s where s.owner_id = a.id) as boards_used,
       (select count(*) from bingo_facilitator_sessions f
         where f.host_id = a.id and not f.revoked and f.expires_at > now()) as active_crew_passes
from bingo_accounts a
where a.id = auth.uid();

grant select on public.my_account_summary to authenticated;
grant execute on function public.update_my_profile(text,text,text,text) to authenticated;
grant execute on function public.set_account_plan(uuid,text,int,int,timestamptz) to authenticated;

-- Make the API see the new columns and functions straight away.
notify pgrst, 'reload schema';
