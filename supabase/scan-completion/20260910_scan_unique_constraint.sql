-- ============================================================================
-- bingo_scans: close the recordScan() race that creates duplicate rows
--
-- Symptom: recordScan() does "select existing, else insert" without a DB
-- constraint to back it up. Two calls for the same (team, task, box) that
-- both run their select before either insert lands both see "nothing yet"
-- and both insert — observed live as two rows per box a fraction of a
-- second apart, one completed, one not. The app currently tolerates this by
-- reading completion with .some() instead of .find(), but the duplicate
-- rows themselves are junk and nothing stops more of them appearing.
--
-- Fix, in two parts:
--   1. Dedupe existing duplicates: for every (team_id, task_id, board_card_id)
--      group, keep one row — preferring a completed one — reparent any photo
--      submission pointing at a row about to be dropped, and pull forward
--      completed/completed_at/words from the rows being dropped so nothing
--      real is lost.
--   2. A generated board_card_key column (board_card_id, or a sentinel UUID
--      when it's NULL — legacy scans predating that column) backs a real
--      unique index, so recordScan()'s upsert (see useBingoScans.ts) can
--      never create a second row for the same group again, no matter how
--      the calls interleave. board_card_id stays nullable; board_card_key
--      only exists to give NULL a stable identity for the index.
-- ============================================================================

begin;

-- Step 1a: reparent photo submissions off any row that's about to be
-- dropped, onto its group's survivor.
with groups as (
  select
    id,
    first_value(id) over (
      partition by team_id, task_id,
        coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by completed desc nulls last, completed_at asc nulls last, scanned_at asc, id asc
    ) as keep_id
  from public.bingo_scans
)
update public.bingo_photo_submissions p
set scan_id = g.keep_id
from groups g
where p.scan_id = g.id and g.id <> g.keep_id;

-- Step 1b: pull completed/completed_at/words forward onto the survivor in
-- case a *duplicate* — not the row picked to survive — is the one that
-- actually recorded the real completion.
--
-- Window functions, not array_agg: words is already text[], and
-- array_agg(text[]) collapses to a plain text[] value with no dimension
-- tracking, so array_agg(words)[1] resolves to scalar text instead of
-- text[] and can't coalesce against s.words. first_value(words) over (...)
-- picks the same "best" row's array without ever wrapping it in another
-- array, so the type stays text[] throughout.
with groups as (
  select
    id,
    first_value(id) over w as keep_id,
    bool_or(completed) over w as completed,
    min(completed_at) filter (where completed) over w as completed_at,
    first_value(words) over (
      partition by team_id, task_id,
        coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by cardinality(words) desc nulls last, scanned_at asc, id asc
    ) as words
  from public.bingo_scans
  window w as (
    partition by team_id, task_id,
      coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)
    order by completed desc nulls last, completed_at asc nulls last, scanned_at asc, id asc
  )
),
merged as (
  select distinct keep_id, completed, completed_at, words from groups
)
update public.bingo_scans s
set completed = m.completed,
    completed_at = coalesce(m.completed_at, s.completed_at),
    words = coalesce(m.words, s.words)
from merged m
where s.id = m.keep_id;

-- Step 1c: drop every row that isn't its group's survivor.
with groups as (
  select
    id,
    first_value(id) over (
      partition by team_id, task_id,
        coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by completed desc nulls last, completed_at asc nulls last, scanned_at asc, id asc
    ) as keep_id
  from public.bingo_scans
)
delete from public.bingo_scans s
using groups g
where s.id = g.id and g.id <> g.keep_id;

-- Step 2: a stable, always-non-null key for the unique index, plus the
-- index itself. Generated (not written by the app) so recordScan() never
-- has to know it exists — it just inserts board_card_id as before.
alter table public.bingo_scans
  add column if not exists board_card_key uuid
  generated always as (coalesce(board_card_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

create unique index if not exists bingo_scans_team_task_board_key_uidx
  on public.bingo_scans (team_id, task_id, board_card_key);

commit;

notify pgrst, 'reload schema';
