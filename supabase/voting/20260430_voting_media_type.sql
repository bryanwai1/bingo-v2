-- Voting: add media_type so a poll can be a photo poll or a video poll.
-- Existing rows default to 'photo' so the original photo voting keeps working.

alter table vote_polls
  add column if not exists media_type text not null default 'photo';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vote_polls'
      and constraint_name = 'vote_polls_media_type_check'
  ) then
    alter table vote_polls
      add constraint vote_polls_media_type_check
      check (media_type in ('photo','video'));
  end if;
end $$;

notify pgrst, 'reload schema';
