-- Enable realtime broadcasts for bingo_members so the public team-members live
-- view (BingoDashTeamMembers) and any future subscribers receive INSERT/UPDATE/
-- DELETE events the moment a participant joins or leaves a group.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_members'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_members';
  end if;
end $$;
