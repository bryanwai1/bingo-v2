-- Duplicate cards after "Give board".
--
-- Cause: clone_bingo_board made every copied card an ordinary library card of
-- the receiving account, so each "Give board" added ~25 duplicates to that
-- account's Card Library. Fixed going forward by 20261112_clone_board_exact.sql
-- (copies are now board-only and hidden from the library).
--
-- This file cleans up what is already there. STEP 1 only LOOKS; nothing is
-- deleted until you run STEP 2 yourself.

-- STEP 1 - which boards did Give board create for the account, and are they used?
select s.id, s.name, s.slug, s.created_at,
       (select count(*) from bingo_board_cards bc where bc.section_id = s.id) as placed_cards,
       (select count(*) from bingo_teams t where t.section_id = s.id)         as teams
  from bingo_sections s
 where s.owner_id = '5b9a9864-27c5-4a47-abfe-13badbc19071'   -- ujiamin0512@gmail.com
 order by s.created_at;

-- STEP 2 - delete the boards you do NOT want. Deleting a board also deletes its
-- 25 card copies, its teams and their scores, so only list boards with teams = 0
-- (or that you are sure are test boards). Replace the ids, then run:
--
-- delete from bingo_sections
--  where id in (
--    '05217483-df32-4fce-9c51-39b7c4b3a542',
--    'a0cb3157-ab15-442b-9c68-53ee05b8cda7',
--    '8efd82c0-f062-49f2-a64e-c0ce8c288c3a'
--  );
--
-- Kept: 42bb8745-f395-49d3-bde5-31635473816c (resort-hunt-6bd854), the board
-- that is currently visible in that account.
