-- draws business logic. Run after bingo_draw_items.sql and bingo_draw_slots.sql.

-- Loose comparison for a typed answer.
--
-- A team writing "the Food Court" and a bank holding "Food court" mean the same
-- thing, so case, punctuation, spacing and a leading "the" are all ignored.
-- Deliberately not fuzzy beyond that: "cinema" should not pass for "canteen".
create or replace function public.norm_draw_answer(p_text text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(p_text, '')), '^\s*the\s+', ''),
           '[^a-z0-9]', '', 'g'
         );
$$;

-- Check a team's guess against the answer on the item they drew.
--
-- SECURITY DEFINER so the answer itself never leaves the database. The
-- participant payload deliberately selects only label/hint/hex/photo_url from
-- bingo_draw_items — sending `detail` to the browser would hand any team the
-- solution to its own riddle, which is the whole card. So the guess travels to
-- Postgres and only a yes/no comes back.
--
-- Matched on the prompt the team was actually dealt, not on the card as a
-- whole: two teams hold different riddles, and one team's answer must not
-- unlock another's.
create or replace function public.check_draw_answer(
  p_task uuid, p_prompt text, p_guess text
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.bingo_draw_items i
    where i.task_id = p_task
      and i.label = p_prompt
      and i.detail is not null
      and public.norm_draw_answer(i.detail) = public.norm_draw_answer(p_guess)
  );
$$;

-- Participants play without an account.
grant execute on function public.norm_draw_answer(text) to anon, authenticated;
grant execute on function public.check_draw_answer(uuid, text, text) to anon, authenticated;
