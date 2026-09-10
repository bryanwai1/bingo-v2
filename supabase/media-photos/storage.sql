-- The `media` storage bucket every upload in the app writes to — hero
-- photos, card page media, draw artwork, Breakout Hunt puzzle images, team
-- bundles, and every Sign Splice letter photo/crop/title strip.
--
-- Public: the app hands out getPublicUrl() links and renders them in <img>
-- tags on the participant board, so reads must not need a token.
--
-- Access: participants play without an account, so a team scanning a Sign
-- Splice letter or submitting a Breakout Hunt bundle is the anon role and
-- has to be able to write — same open-access pattern the participant-facing
-- tables already use, with the same caveat: anyone holding the anon key can
-- write here, so this is not a place for anything private. Delete is
-- included because the admin sweeps a team's photos from storage when the
-- team is removed.
--
-- Source: media-photos/031_media_bucket.sql, limit raised by
-- media-photos/034_video_submissions.sql (100 MiB, to cover a minute of
-- phone footage — the participant view refuses anything bigger client-side
-- before it starts uploading).

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do update
  set public = true,
      file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), 104857600);

create policy media_read on storage.objects
  for select using (bucket_id = 'media');

create policy media_insert on storage.objects
  for insert with check (bucket_id = 'media');

create policy media_update on storage.objects
  for update using (bucket_id = 'media') with check (bucket_id = 'media');

create policy media_delete on storage.objects
  for delete using (bucket_id = 'media');
