-- The `media` storage bucket every upload in the app writes to.
--
-- The code has always used supabase.storage.from('media') — hero photos, card
-- page media, draw artwork, Breakout Hunt puzzle images and team bundles, and
-- every Sign Splice letter photo, crop and final title strip. The bucket was
-- created by hand in an earlier Supabase project (a handful of instruction
-- pages still point at that project's storage) and was never recreated when the
-- database moved, so today every one of those uploads fails with
-- "Bucket not found". This makes the bucket part of the schema instead.
--
-- Run it in the SQL editor: creating storage policies needs the owner rights
-- the dashboard session has, which the app's anon key does not.

-- ── The bucket ───────────────────────────────────────────────────────────────
--
-- Public: the app hands out getPublicUrl() links and renders them in <img>
-- tags on the participant board, so reads must not need a token.
--
-- 20 MB matches the largest thing the UI offers to upload (a page video); the
-- 5 MB image cap is enforced client-side, and this is the backstop.

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 20971520)
on conflict (id) do update
  set public = true,
      file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), 20971520);

-- ── Access ───────────────────────────────────────────────────────────────────
--
-- Participants play without an account: a team scanning a Sign Splice letter or
-- submitting a Breakout Hunt bundle is the anon role, and it has to be able to
-- write. That is the same open-access pattern the participant-facing tables
-- already use, and it carries the same caveat — anyone holding the anon key can
-- write here, so this is not a place for anything private.
--
-- Delete is included because the admin sweeps a team's photos from storage when
-- the team is removed.

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'media_read') then
    create policy media_read on storage.objects
      for select using (bucket_id = 'media');
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'media_insert') then
    create policy media_insert on storage.objects
      for insert with check (bucket_id = 'media');
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'media_update') then
    create policy media_update on storage.objects
      for update using (bucket_id = 'media') with check (bucket_id = 'media');
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'media_delete') then
    create policy media_delete on storage.objects
      for delete using (bucket_id = 'media');
  end if;
end $$;
