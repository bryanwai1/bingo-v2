-- Let a card be completed by submitting a link.
--
-- Mission Control Budget asks a team to *build* something — a small tool that
-- splits a pretend budget. The thing they make lives at a URL (Google AI
-- Studio, Canva, a Claude artifact), so neither a photo nor a clip is the
-- deliverable: the link is.
--
-- A link rides the same pipeline as a photo — one row per submission, pending
-- until a marshal approves it, approval completing the tile — so nothing about
-- review changes. Only the thing in photo_url differs: an address rather than
-- a file in the media bucket.
--
-- The Text input can't serve this: it is a letter-box quiz that auto-completes
-- when the typed letters match a known answer, and a URL has no known answer.

alter table public.bingo_photo_submissions
  drop constraint if exists bingo_photo_submissions_media_type_check;

alter table public.bingo_photo_submissions
  add constraint bingo_photo_submissions_media_type_check
  check (media_type in ('image', 'video', 'link'));
