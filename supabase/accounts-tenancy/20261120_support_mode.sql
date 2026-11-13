-- Support mode: the owner works on a tenant's boards from the admin page.
-- Everything else already works through the owner's normal write access; this
-- is the one call that acts on "the signed-in account", so the owner needs a
-- version that names the tenant.
-- Run in Supabase -> SQL Editor. Safe to run more than once.

create or replace function public.owner_set_account_active_board(p_account uuid, p_section uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  if not exists (select 1 from bingo_sections where id = p_section and owner_id = p_account) then
    raise exception 'That board does not belong to this account';
  end if;
  update bingo_accounts set active_section_id = p_section where id = p_account;
end;
$$;

grant execute on function public.owner_set_account_active_board(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
