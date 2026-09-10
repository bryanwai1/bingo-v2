-- Any face count from 1 to 6, not just 1/2/6. A trainer may well want three
-- faces for a 75-tile board, and an arbitrary restriction to three presets is
-- the kind of thing that makes a tool feel like it is arguing with you.
alter table public.bingo_sections drop constraint if exists bingo_sections_face_count_check;
alter table public.bingo_sections
  add constraint bingo_sections_face_count_check check (face_count between 1 and 6);
notify pgrst, 'reload schema';
