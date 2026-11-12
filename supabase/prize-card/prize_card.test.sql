-- PRD-008 server rules, to run by hand in a SANDBOX database after
-- 20261117_prize_card.sql (NOT run yet). Everything is rolled back at the end.
-- Each block raises on failure. Replace the four ids with a sandbox board that
-- has a prize card placed on slot 200 and >= 20 grid cards, two teams (A, B)
-- each with a player, and one observer on team A. A has 20 completed scans, B 19.
begin;

set local t.prize_bc   = '00000000-0000-0000-0000-000000000002';  -- bingo_board_cards.id of the prize placement
set local t.a_player   = '00000000-0000-0000-0000-0000000000a1';
set local t.a_observer = '00000000-0000-0000-0000-0000000000a2';
set local t.b_player   = '00000000-0000-0000-0000-0000000000b1';

-- AC-4 / AC-8: team B (19 completed) is refused and nothing is written
do $$ declare r json; begin
  r := public.claim_prize(current_setting('t.b_player')::uuid, current_setting('t.prize_bc')::uuid);
  assert (r->>'ok')::boolean = false and r->>'reason' = 'not_eligible', 'B should be refused';
  assert not exists (select 1 from bingo_prize_claims where board_card_id = current_setting('t.prize_bc')::uuid), 'no row after refusal';
end $$;

-- AC-9: an observer cannot claim, even on the winning team
do $$ declare r json; begin
  r := public.claim_prize(current_setting('t.a_observer')::uuid, current_setting('t.prize_bc')::uuid);
  assert r->>'reason' = 'not_eligible', 'observer refused';
end $$;

-- AC-2 / AC-3: A claims once; a repeat by A stays ok; exactly one row. (A rival
-- team with enough cards would get reason 'taken': give B 20 scans to try it.)
do $$ declare r json; begin
  r := public.claim_prize(current_setting('t.a_player')::uuid, current_setting('t.prize_bc')::uuid);
  assert (r->>'ok')::boolean, 'A wins';
  r := public.claim_prize(current_setting('t.a_player')::uuid, current_setting('t.prize_bc')::uuid);
  assert (r->>'ok')::boolean, 'a repeat claim by the holding team is ok, not "taken"';
  assert (select count(*) from bingo_prize_claims where board_card_id = current_setting('t.prize_bc')::uuid) = 1, 'exactly one claim';
end $$;

-- AC-6: only the winning team (observer included) can read the reveal text
do $$ begin
  assert public.get_prize_reveal(current_setting('t.a_player')::uuid, current_setting('t.prize_bc')::uuid) is not null, 'winner reads reveal';
  assert public.get_prize_reveal(current_setting('t.a_observer')::uuid, current_setting('t.prize_bc')::uuid) is not null, 'winner observer reads reveal';
  assert public.get_prize_reveal(current_setting('t.b_player')::uuid, current_setting('t.prize_bc')::uuid) is null, 'loser gets null';
end $$;

-- AC-11: Reset claim (delete), then the claim is possible again
delete from bingo_prize_claims where board_card_id = current_setting('t.prize_bc')::uuid;
do $$ declare r json; begin
  r := public.claim_prize(current_setting('t.a_player')::uuid, current_setting('t.prize_bc')::uuid);
  assert (r->>'ok')::boolean, 'claim possible again after reset';
end $$;

-- AC-12: a cloned/synced board gets its own unclaimed prize placement. Run
-- clone_bingo_board on the sandbox board, then:
--   select count(*) from bingo_prize_claims where section_id = <new board>;  -- expect 0
--   select count(*) from bingo_board_cards where section_id = <new board> and slot >= 200;  -- expect same as source
--   select count(*) from bingo_prize_secrets where task_id in (select task_id from bingo_board_cards where section_id = <new board> and slot >= 200);  -- expect same as source

rollback;
