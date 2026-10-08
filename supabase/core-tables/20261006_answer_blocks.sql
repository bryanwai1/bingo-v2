-- Answer blocks: a card's typed-answer input can hold several questions.
-- Each block is {id, question, kind: 'text' | 'number', answer, min}:
--   kind 'text'   -> the team types text that must equal `answer`
--                    (case and spaces ignored)
--   kind 'number' -> the team types a number that must be >= `min`
-- The card passes only when EVERY block is right. Empty/null = the card keeps
-- using the older single question (answer_question / answer_text / answer_min).
alter table public.bingo_tasks
  add column if not exists answer_blocks jsonb;

comment on column public.bingo_tasks.answer_blocks is 'Typed-answer questions: [{id, question, kind text|number, answer, min}]. All must be correct. Null/empty = legacy single answer.';

-- Checks a team's answers (p_values: JSON array of strings, same order as the
-- blocks) on the server so the browser never decides pass/fail. Returns
-- {passed: bool, results: [bool, ...]} - per-block ticks, never the answers.
-- Only ever flips the scan's answer_ok to true, and only for that scan's card.
create or replace function public.check_answer_blocks(p_scan uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  blocks  jsonb;
  b       jsonb;
  i       int := 0;
  v       text;
  ok      boolean;
  results jsonb := '[]'::jsonb;
  all_ok  boolean := true;
begin
  select t.answer_blocks into blocks
    from public.bingo_scans s join public.bingo_tasks t on t.id = s.task_id
   where s.id = p_scan;

  if blocks is null or jsonb_typeof(blocks) <> 'array' or jsonb_array_length(blocks) = 0 then
    return jsonb_build_object('passed', false, 'results', '[]'::jsonb);
  end if;

  for b in select * from jsonb_array_elements(blocks) loop
    v := coalesce(p_values ->> i, '');
    if b ->> 'kind' = 'number' then
      v := regexp_replace(v, '[,\s]', '', 'g');
      ok := case
              when (b ->> 'min') is null then false
              when v ~ '^-?[0-9]+(\.[0-9]+)?$' then v::numeric >= (b ->> 'min')::numeric
              else false
            end;
    else
      ok := coalesce(b ->> 'answer', '') <> ''
        and lower(regexp_replace(v, '\s', '', 'g'))
          = lower(regexp_replace(coalesce(b ->> 'answer', ''), '\s', '', 'g'));
    end if;
    results := results || to_jsonb(ok);
    all_ok := all_ok and ok;
    i := i + 1;
  end loop;

  if all_ok then
    update public.bingo_scans set answer_ok = true where id = p_scan;
  end if;
  return jsonb_build_object('passed', all_ok, 'results', results);
end $$;

grant execute on function public.check_answer_blocks(uuid, jsonb) to anon, authenticated;
