-- Enable realtime broadcasts for bingo_photo_submissions so BingoDashAdmin's live
-- subscription fires the moment a participant uploads a photo. Without this, admins
-- had to refresh the page to see new submissions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_photo_submissions'
  ) then
    execute 'alter publication supabase_realtime add table public.bingo_photo_submissions';
  end if;
end $$;
