-- Enable realtime broadcasts for bingo_sections so BingoDashJoin's live
-- subscription on game_started fires the moment the admin toggles Set live / Set locked.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_sections'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_sections';
  end if;
end $$;
