-- APPLIED to the live project (tetbxjqhfsoipwdnbetm). Checked 2026-11-20: the live function matches this file
-- exactly and anon/authenticated can execute it.
--
-- What: the player's passcode panel shows WHICH box the code opens ("Box 1" next to 124),
-- not just the digits. Players cannot read bingo_task_passcodes, so they get the label
-- of the code their team was handed through this function, the same way they get the
-- code itself from get_card_passcode.
--
-- Safe to run on a board mid-game: additive (a new function, no table changes). Until it
-- is applied the app simply shows the code without the box name.
-- Roll back with:  drop function if exists public.get_card_passcode_label(uuid);

create or replace function public.get_card_passcode_label(p_scan uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(p.label), '')
    from bingo_scans s
    join bingo_passcode_claims c on c.task_id = s.task_id and c.team_id = s.team_id
    join bingo_task_passcodes p on p.id = c.passcode_id
   where s.id = p_scan and s.answer_ok = true
   limit 1;
$$;

grant execute on function public.get_card_passcode_label(uuid) to anon, authenticated;
