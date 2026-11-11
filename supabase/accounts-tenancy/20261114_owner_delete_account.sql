-- Owner-only: fully delete a (non-owner) account — the login AND its row.
-- Deleting only in Supabase Authentication can leave a bingo_accounts row behind.
create or replace function public.owner_delete_account(p_account uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare r text;
begin
  if not public.is_bingo_owner() then raise exception 'OWNER_ONLY'; end if;
  select role into r from bingo_accounts where id = p_account;
  if r = 'owner' or p_account = auth.uid() then raise exception 'CANNOT_DELETE_OWNER'; end if;
  delete from bingo_accounts where id = p_account;
  delete from auth.users where id = p_account;
end; $$;

grant execute on function public.owner_delete_account(uuid) to authenticated;
notify pgrst, 'reload schema';
